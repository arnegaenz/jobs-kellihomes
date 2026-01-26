const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const crypto = require('crypto');
const logger = require('../logger');

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET;

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// GET /documents - List all documents across all jobs
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const showTrashed = req.query.includeTrashed === 'true';

    let query = `
      SELECT
        id, job_id AS "jobId", storage_key AS "storageKey", name, document_type AS "documentType",
        size, created_at AS "createdAt", deleted_at AS "deletedAt"
      FROM documents
    `;

    if (!showTrashed) {
      query += ' WHERE deleted_at IS NULL';
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query);

    // Generate presigned URLs for each document
    const documentsWithUrls = await Promise.all(
      result.rows.map(async (doc) => {
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: doc.storageKey,
          });
          const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
          return { ...doc, url };
        } catch (error) {
          logger.error('Error generating presigned URL for document', { docId: doc.id, error: error.message });
          return { ...doc, url: null };
        }
      })
    );

    res.json(documentsWithUrls);
  } catch (error) {
    logger.error('Error fetching documents', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /documents/:id - Get a single document
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        id, job_id AS "jobId", storage_key AS "storageKey", name, document_type AS "documentType",
        size, created_at AS "createdAt", deleted_at AS "deletedAt"
      FROM documents
      WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Generate presigned URL
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: doc.storageKey,
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      doc.url = url;
    } catch (error) {
      logger.error('Error generating presigned URL', { docId: doc.id, error: error.message });
      doc.url = null;
    }

    res.json(doc);
  } catch (error) {
    logger.error('Error fetching document', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// PUT /documents/:id - Update document type
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.body;

    if (!documentType) {
      return res.status(400).json({ error: 'Document type is required' });
    }

    const pool = getPool();
    const result = await pool.query(
      `UPDATE documents
      SET document_type = $1
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING id, job_id AS "jobId", storage_key AS "storageKey", name, document_type AS "documentType",
                size, created_at AS "createdAt", deleted_at AS "deletedAt"`,
      [documentType, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    logger.info('Document type updated', { docId: id, type: documentType, updatedBy: req.user.username });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating document', { error: error.message });
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /documents/:id - Soft delete a document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `UPDATE documents
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    logger.info('Document deleted', { docId: id, deletedBy: req.user.username });
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    logger.error('Error deleting document', { error: error.message });
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// POST /documents/:id/restore - Restore a soft-deleted document
router.post('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `UPDATE documents
      SET deleted_at = NULL
      WHERE id = $1 AND deleted_at IS NOT NULL
      RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deleted document not found' });
    }

    logger.info('Document restored', { docId: id, restoredBy: req.user.username });
    res.json({ message: 'Document restored successfully' });
  } catch (error) {
    logger.error('Error restoring document', { error: error.message });
    res.status(500).json({ error: 'Failed to restore document' });
  }
});

// POST /documents/upload - Request presigned URL for document upload
router.post('/upload', async (req, res) => {
  try {
    const { jobId, filename, contentType, size, documentType } = req.body;

    logger.info('Document upload request received', {
      jobId,
      filename,
      contentType,
      size,
      documentType,
      hasS3Bucket: !!S3_BUCKET,
      hasAwsRegion: !!process.env.AWS_REGION
    });

    if (!jobId || !filename || !documentType) {
      logger.warn('Missing required fields for document upload', { jobId, filename, documentType });
      return res.status(400).json({ error: 'Job ID, filename, and document type are required' });
    }

    // Validate file size (10MB limit)
    if (size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }

    // Verify job exists
    const pool = getPool();
    const jobCheck = await pool.query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Generate unique document ID and storage key
    const documentId = `doc-${crypto.randomBytes(8).toString('hex')}`;
    const fileExtension = filename.split('.').pop();
    const storageKey = `jobs/${jobId}/${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;

    // Create presigned URL for upload
    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, uploadCommand, { expiresIn: 3600 });

    // Save document record to database
    // The documents table uses text IDs, so we generate one
    const result = await pool.query(
      `INSERT INTO documents (id, job_id, storage_key, name, document_type, size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, job_id AS "jobId", storage_key AS "storageKey", name, document_type AS "documentType",
                 size, created_at AS "createdAt"`,
      [documentId, jobId, storageKey, filename, documentType, size, req.user.username]
    );

    const doc = result.rows[0];

    logger.info('Document upload initiated', {
      docId: doc.id,
      jobId,
      filename,
      documentType,
      uploadedBy: req.user.username
    });

    res.json({
      uploadUrl,
      document: doc
    });
  } catch (error) {
    logger.error('Error initiating document upload', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ error: 'Failed to initiate document upload', details: error.message });
  }
});

module.exports = router;
