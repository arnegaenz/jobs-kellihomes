/**
 * Tasks Routes for Kelli Homes Job Management
 * Full CRUD for tasks with multi-assignee support
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

/**
 * GET /tasks
 * List tasks with optional filters: ?jobId, ?status, ?assignee, ?priority
 */
router.get('/', async (req, res) => {
  const { jobId, status, assignee, priority } = req.query;

  try {
    const pool = getPool();

    let query = `
      SELECT
        t.id,
        t.title,
        t.description,
        t.job_id AS "jobId",
        j.name AS "jobName",
        t.priority,
        t.status,
        t.start_date AS "startDate",
        t.end_date AS "endDate",
        t.created_by AS "createdBy",
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt",
        COALESCE(array_agg(ta.username) FILTER (WHERE ta.username IS NOT NULL), '{}') AS assignees
      FROM tasks t
      LEFT JOIN jobs j ON t.job_id = j.id
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
    `;

    const conditions = [];
    const params = [];

    if (jobId) {
      params.push(jobId);
      conditions.push(`t.job_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (priority) {
      params.push(priority);
      conditions.push(`t.priority = $${params.length}`);
    }

    if (assignee) {
      params.push(assignee);
      conditions.push(`EXISTS (SELECT 1 FROM task_assignees ta2 WHERE ta2.task_id = t.id AND ta2.username = $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY t.id, j.name ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * GET /tasks/:taskId
 * Get single task with assignees
 */
router.get('/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.job_id AS "jobId",
        j.name AS "jobName",
        t.priority,
        t.status,
        t.start_date AS "startDate",
        t.end_date AS "endDate",
        t.created_by AS "createdBy",
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt",
        COALESCE(array_agg(ta.username) FILTER (WHERE ta.username IS NOT NULL), '{}') AS assignees
      FROM tasks t
      LEFT JOIN jobs j ON t.job_id = j.id
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.id = $1
      GROUP BY t.id, j.name
    `, [taskId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

/**
 * POST /tasks
 * Create task with assignees (transaction)
 * Body: { title, description, jobId, priority, status, startDate, endDate, assignees: [username] }
 */
router.post('/', async (req, res) => {
  const { title, description, jobId, priority, status, startDate, endDate, assignees } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const taskResult = await client.query(`
      INSERT INTO tasks (title, description, job_id, priority, status, start_date, end_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      title.trim(),
      description || '',
      jobId || null,
      priority || 'Medium',
      status || 'Not Started',
      startDate || null,
      endDate || null,
      req.user?.username || null
    ]);

    const taskId = taskResult.rows[0].id;

    if (Array.isArray(assignees) && assignees.length > 0) {
      const insertPromises = assignees.map(username =>
        client.query(
          'INSERT INTO task_assignees (task_id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [taskId, username]
        )
      );
      await Promise.all(insertPromises);
    }

    await client.query('COMMIT');

    // Fetch the created task with assignees
    const result = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.job_id AS "jobId",
        j.name AS "jobName",
        t.priority,
        t.status,
        t.start_date AS "startDate",
        t.end_date AS "endDate",
        t.created_by AS "createdBy",
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt",
        COALESCE(array_agg(ta.username) FILTER (WHERE ta.username IS NOT NULL), '{}') AS assignees
      FROM tasks t
      LEFT JOIN jobs j ON t.job_id = j.id
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.id = $1
      GROUP BY t.id, j.name
    `, [taskId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  } finally {
    client.release();
  }
});

/**
 * PUT /tasks/:taskId
 * Update task and replace assignees (transaction)
 */
router.put('/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { title, description, jobId, priority, status, startDate, endDate, assignees } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateResult = await client.query(`
      UPDATE tasks SET
        title = $1,
        description = $2,
        job_id = $3,
        priority = $4,
        status = $5,
        start_date = $6,
        end_date = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING id
    `, [
      title.trim(),
      description || '',
      jobId || null,
      priority || 'Medium',
      status || 'Not Started',
      startDate || null,
      endDate || null,
      taskId
    ]);

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }

    // Replace assignees
    await client.query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);

    if (Array.isArray(assignees) && assignees.length > 0) {
      const insertPromises = assignees.map(username =>
        client.query(
          'INSERT INTO task_assignees (task_id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [taskId, username]
        )
      );
      await Promise.all(insertPromises);
    }

    await client.query('COMMIT');

    // Fetch updated task
    const result = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.job_id AS "jobId",
        j.name AS "jobName",
        t.priority,
        t.status,
        t.start_date AS "startDate",
        t.end_date AS "endDate",
        t.created_by AS "createdBy",
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt",
        COALESCE(array_agg(ta.username) FILTER (WHERE ta.username IS NOT NULL), '{}') AS assignees
      FROM tasks t
      LEFT JOIN jobs j ON t.job_id = j.id
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.id = $1
      GROUP BY t.id, j.name
    `, [taskId]);

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /tasks/:taskId
 * Delete task (cascades to assignees)
 */
router.delete('/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
