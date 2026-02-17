/**
 * Users Routes for Kelli Homes Job Management
 * Provides user list for assignee picker
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

/**
 * GET /users
 * List all usernames (for assignee selection)
 */
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT username FROM users ORDER BY username ASC'
    );
    res.json(result.rows.map(row => row.username));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
