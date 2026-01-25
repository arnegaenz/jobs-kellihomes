const express = require('express');
const router = express.Router();
const pool = require('../db');
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

// GET /business-documents - List all business documents
router.get('/', async (req, res) => {
  try {
    const showTrashed = req.query.showTrashed === 'true';

    let query = `
      SELECT
        id, s3_key, file_name, file_type, file_size, type, description,
        uploaded_at, uploaded_by, deleted_at
      FROM business_documents
    `;

    if (!showTrashed) {
      query += ' WHERE deleted_at IS NULL';
    }

    query += ' ORDER BY uploaded_at DESC';

    const result = await pool.query(query);

    // Generate presigned URLs for each document
    const documentsWithUrls = await Promise.all(
      result.rows.map(async (doc) => {
        try {
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: doc.s3_key,
          });
          const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
          return { ...doc, url };
        } catch (error) {
          logger.error('Error generating presigned URL for business document', { docId: doc.id, error: error.message });
          return { ...doc, url: null };
        }
      })
    );

    res.json(documentsWithUrls);
  } catch (error) {
    logger.error('Error fetching business documents', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch business documents' });
  }
});

// POST /business-documents/upload - Upload a new business document
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { type, description } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Document type is required' });
    }

    // Generate unique S3 key
    const fileExtension = req.file.originalname.split('.').pop();
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const s3Key = `business/${uniqueId}.${fileExtension}`;

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });

    await s3Client.send(uploadCommand);

    // Save metadata to database
    const insertQuery = `
      INSERT INTO business_documents (
        s3_key, file_name, file_type, file_size, type, description, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      s3Key,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      type,
      description || null,
      req.user.username,
    ]);

    logger.info('Business document uploaded', {
      docId: result.rows[0].id,
      fileName: req.file.originalname,
      type,
      uploadedBy: req.user.username,
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error uploading business document', { error: error.message });
    res.status(500).json({ error: 'Failed to upload business document' });
  }
});

// PATCH /business-documents/:id - Update business document metadata
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, description } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (type !== undefined) {
      updates.push(`type = $${paramCount}`);
      values.push(type);
      paramCount++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `
      UPDATE business_documents
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business document not found' });
    }

    logger.info('Business document updated', { docId: id, updatedBy: req.user.username });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating business document', { error: error.message });
    res.status(500).json({ error: 'Failed to update business document' });
  }
});

// DELETE /business-documents/:id - Soft delete a business document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE business_documents
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business document not found' });
    }

    logger.info('Business document deleted', { docId: id, deletedBy: req.user.username });
    res.json({ message: 'Business document deleted successfully' });
  } catch (error) {
    logger.error('Error deleting business document', { error: error.message });
    res.status(500).json({ error: 'Failed to delete business document' });
  }
});

// POST /business-documents/:id/restore - Restore a soft-deleted business document
router.post('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE business_documents
      SET deleted_at = NULL
      WHERE id = $1 AND deleted_at IS NOT NULL
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deleted business document not found' });
    }

    logger.info('Business document restored', { docId: id, restoredBy: req.user.username });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error restoring business document', { error: error.message });
    res.status(500).json({ error: 'Failed to restore business document' });
  }
});

module.exports = router;
