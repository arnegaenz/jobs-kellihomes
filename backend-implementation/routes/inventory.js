/**
 * Inventory Routes for Kelli Homes - Wasteland Material Tracking
 * CRUD for inventory items with S3 photo support and claim/unclaim flow
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET;

const SELECT_FIELDS = `
  i.id,
  i.name,
  i.description,
  i.quantity,
  i.category,
  i.source_job_id AS "sourceJobId",
  sj.name AS "sourceJobName",
  i.destination_job_id AS "destinationJobId",
  dj.name AS "destinationJobName",
  i.status,
  i.photo_key AS "photoKey",
  i.photo_name AS "photoName",
  i.notes,
  i.added_by AS "addedBy",
  i.claimed_by AS "claimedBy",
  i.claimed_at AS "claimedAt",
  i.created_at AS "createdAt",
  i.updated_at AS "updatedAt"
`;

const FROM_JOINS = `
  FROM inventory_items i
  LEFT JOIN jobs sj ON i.source_job_id = sj.id
  LEFT JOIN jobs dj ON i.destination_job_id = dj.id
`;

/**
 * GET /inventory
 * List items with optional ?status, ?category, ?search filters
 */
router.get('/', async (req, res) => {
  const { status, category, search } = req.query;

  try {
    const pool = getPool();

    let query = `SELECT ${SELECT_FIELDS} ${FROM_JOINS}`;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }

    if (category) {
      params.push(category);
      conditions.push(`i.category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.name ILIKE $${params.length} OR i.description ILIKE $${params.length} OR i.notes ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY i.created_at DESC';

    const result = await pool.query(query, params);

    // Generate presigned photo URLs
    const items = await Promise.all(
      result.rows.map(async (item) => {
        if (item.photoKey) {
          try {
            const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: item.photoKey });
            item.photoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          } catch {
            item.photoUrl = null;
          }
        }
        return item;
      })
    );

    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

/**
 * GET /inventory/:id
 * Single item with presigned photo URL
 */
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${SELECT_FIELDS} ${FROM_JOINS} WHERE i.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = result.rows[0];

    if (item.photoKey) {
      try {
        const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: item.photoKey });
        item.photoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      } catch {
        item.photoUrl = null;
      }
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

/**
 * POST /inventory
 * Create item (metadata only)
 */
router.post('/', async (req, res) => {
  const { name, description, quantity, category, sourceJobId, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const pool = getPool();
    const id = `inv-${crypto.randomBytes(8).toString('hex')}`;

    await pool.query(
      `INSERT INTO inventory_items (id, name, description, quantity, category, source_job_id, notes, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        name.trim(),
        description || '',
        quantity || 1,
        category || 'Other',
        sourceJobId || null,
        notes || '',
        req.user?.username || null
      ]
    );

    // Fetch created item with joins
    const result = await pool.query(
      `SELECT ${SELECT_FIELDS} ${FROM_JOINS} WHERE i.id = $1`,
      [id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

/**
 * PUT /inventory/:id
 * Update item fields
 */
router.put('/:id', async (req, res) => {
  const { name, description, quantity, category, sourceJobId, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const pool = getPool();
    const updateResult = await pool.query(
      `UPDATE inventory_items SET
        name = $1,
        description = $2,
        quantity = $3,
        category = $4,
        source_job_id = $5,
        notes = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING id`,
      [
        name.trim(),
        description || '',
        quantity || 1,
        category || 'Other',
        sourceJobId || null,
        notes || '',
        req.params.id
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const result = await pool.query(
      `SELECT ${SELECT_FIELDS} ${FROM_JOINS} WHERE i.id = $1`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

/**
 * POST /inventory/:id/photo
 * Get presigned S3 upload URL for photo
 */
router.post('/:id/photo', async (req, res) => {
  const { filename, contentType } = req.body;

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  try {
    const pool = getPool();

    // Verify item exists
    const check = await pool.query('SELECT id FROM inventory_items WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const ext = filename.split('.').pop();
    const photoKey = `inventory/${req.params.id}/${crypto.randomBytes(8).toString('hex')}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: photoKey,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Update item with photo key
    await pool.query(
      'UPDATE inventory_items SET photo_key = $1, photo_name = $2, updated_at = NOW() WHERE id = $3',
      [photoKey, filename, req.params.id]
    );

    res.json({ uploadUrl, photoKey });
  } catch (error) {
    console.error('Error generating photo upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * DELETE /inventory/:id/photo
 * Remove photo from item
 */
router.delete('/:id/photo', async (req, res) => {
  try {
    const pool = getPool();

    const item = await pool.query(
      'SELECT photo_key FROM inventory_items WHERE id = $1',
      [req.params.id]
    );

    if (item.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Delete from S3 if exists
    if (item.rows[0].photo_key) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: item.rows[0].photo_key,
        }));
      } catch (err) {
        console.error('Error deleting photo from S3:', err);
      }
    }

    await pool.query(
      'UPDATE inventory_items SET photo_key = NULL, photo_name = NULL, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Photo removed' });
  } catch (error) {
    console.error('Error removing photo:', error);
    res.status(500).json({ error: 'Failed to remove photo' });
  }
});

/**
 * POST /inventory/:id/claim
 * Mark as Claimed with destination job
 */
router.post('/:id/claim', async (req, res) => {
  const { destinationJobId } = req.body;

  if (!destinationJobId) {
    return res.status(400).json({ error: 'Destination job is required' });
  }

  try {
    const pool = getPool();

    const updateResult = await pool.query(
      `UPDATE inventory_items SET
        status = 'Claimed',
        destination_job_id = $1,
        claimed_by = $2,
        claimed_at = NOW(),
        updated_at = NOW()
      WHERE id = $3 AND status = 'Available'
      RETURNING id`,
      [destinationJobId, req.user?.username || null, req.params.id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or already claimed' });
    }

    const result = await pool.query(
      `SELECT ${SELECT_FIELDS} ${FROM_JOINS} WHERE i.id = $1`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error claiming item:', error);
    res.status(500).json({ error: 'Failed to claim item' });
  }
});

/**
 * POST /inventory/:id/unclaim
 * Mark as Available again
 */
router.post('/:id/unclaim', async (req, res) => {
  try {
    const pool = getPool();

    const updateResult = await pool.query(
      `UPDATE inventory_items SET
        status = 'Available',
        destination_job_id = NULL,
        claimed_by = NULL,
        claimed_at = NULL,
        updated_at = NOW()
      WHERE id = $1 AND status = 'Claimed'
      RETURNING id`,
      [req.params.id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or not claimed' });
    }

    const result = await pool.query(
      `SELECT ${SELECT_FIELDS} ${FROM_JOINS} WHERE i.id = $1`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error unclaiming item:', error);
    res.status(500).json({ error: 'Failed to unclaim item' });
  }
});

module.exports = router;
