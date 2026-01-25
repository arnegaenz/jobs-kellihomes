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
        id, job_id AS "jobId", s3_key AS "s3Key", name, type AS "documentType",
        size, created_at AS "createdAt", uploaded_by AS "uploadedBy", deleted_at AS "deletedAt"
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
            Key: doc.s3Key,
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
        id, job_id AS "jobId", s3_key AS "s3Key", name, type AS "documentType",
        size, created_at AS "createdAt", uploaded_by AS "uploadedBy", deleted_at AS "deletedAt"
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
        Key: doc.s3Key,
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
      SET type = $1
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING id, job_id AS "jobId", s3_key AS "s3Key", name, type AS "documentType",
                size, created_at AS "createdAt", uploaded_by AS "uploadedBy", deleted_at AS "deletedAt"`,
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

module.exports = router;
