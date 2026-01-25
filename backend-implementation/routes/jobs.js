/**
 * Jobs Routes for Kelli Homes Job Management
 * Handles job CRUD operations with authentication
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

/**
 * GET /jobs
 * Fetch all jobs for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        location,
        client,
        client_email AS "clientEmail",
        client_phone AS "clientPhone",
        stage,
        type,
        start_date AS "startDate",
        target_completion AS "targetCompletion",
        actual_completion AS "actualCompletion",
        primary_contact AS "primaryContact",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM jobs
      ORDER BY updated_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({
      error: 'Failed to fetch jobs',
      message: error.message
    });
  }
});

/**
 * GET /jobs/:jobId
 * Fetch a single job by ID
 */
router.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        location,
        client,
        client_email AS "clientEmail",
        client_phone AS "clientPhone",
        stage,
        type,
        start_date AS "startDate",
        target_completion AS "targetCompletion",
        actual_completion AS "actualCompletion",
        primary_contact AS "primaryContact",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM jobs
      WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Job not found'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({
      error: 'Failed to fetch job',
      message: error.message
    });
  }
});

/**
 * POST /jobs
 * Create a new job
 */
router.post('/', async (req, res) => {
  const {
    name,
    location,
    client,
    clientEmail,
    clientPhone,
    stage,
    type,
    startDate,
    targetCompletion,
    actualCompletion,
    primaryContact,
    notes
  } = req.body;

  // Validate required fields
  if (!name || !location) {
    return res.status(400).json({
      error: 'Missing required fields: name, location'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO jobs (
        name,
        location,
        client,
        client_email,
        client_phone,
        stage,
        type,
        start_date,
        target_completion,
        actual_completion,
        primary_contact,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id,
        name,
        location,
        client,
        client_email AS "clientEmail",
        client_phone AS "clientPhone",
        stage,
        type,
        start_date AS "startDate",
        target_completion AS "targetCompletion",
        actual_completion AS "actualCompletion",
        primary_contact AS "primaryContact",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        name,
        location,
        client || null,
        clientEmail || null,
        clientPhone || null,
        stage || 'Preconstruction',
        type || 'Other',
        startDate || null,
        targetCompletion || null,
        actualCompletion || null,
        primaryContact || null,
        notes || ''
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      error: 'Failed to create job',
      message: error.message
    });
  }
});

/**
 * PUT /jobs/:jobId
 * Update an existing job
 */
router.put('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const {
    name,
    location,
    client,
    clientEmail,
    clientPhone,
    stage,
    type,
    startDate,
    targetCompletion,
    actualCompletion,
    primaryContact,
    notes
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE jobs SET
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        client = COALESCE($3, client),
        client_email = COALESCE($4, client_email),
        client_phone = COALESCE($5, client_phone),
        stage = COALESCE($6, stage),
        type = COALESCE($7, type),
        start_date = COALESCE($8, start_date),
        target_completion = COALESCE($9, target_completion),
        actual_completion = $10,
        primary_contact = COALESCE($11, primary_contact),
        notes = COALESCE($12, notes),
        updated_at = NOW()
      WHERE id = $13
      RETURNING
        id,
        name,
        location,
        client,
        client_email AS "clientEmail",
        client_phone AS "clientPhone",
        stage,
        type,
        start_date AS "startDate",
        target_completion AS "targetCompletion",
        actual_completion AS "actualCompletion",
        primary_contact AS "primaryContact",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        name,
        location,
        client,
        clientEmail,
        clientPhone,
        stage,
        type,
        startDate,
        targetCompletion,
        actualCompletion, // Can be null
        primaryContact,
        notes,
        jobId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Job not found'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({
      error: 'Failed to update job',
      message: error.message
    });
  }
});

/**
 * DELETE /jobs/:jobId
 * Delete a job
 */
router.delete('/:jobId', async (req, res) => {
  const { jobId } = req.params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete related records first (cascading delete)
    await client.query('DELETE FROM line_items WHERE job_id = $1', [jobId]);
    // Add other related tables as needed (documents, milestones, etc.)

    // Delete the job
    const result = await client.query(
      'DELETE FROM jobs WHERE id = $1 RETURNING id',
      [jobId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Job not found'
      });
    }

    await client.query('COMMIT');

    res.json({
      message: 'Job deleted successfully',
      jobId: result.rows[0].id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting job:', error);
    res.status(500).json({
      error: 'Failed to delete job',
      message: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
