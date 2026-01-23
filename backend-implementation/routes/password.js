const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

const SALT_ROUNDS = 12;

// Validation middleware
const validatePasswordChange = [
  body('currentPassword').trim().notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .trim()
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    .notEmpty().withMessage('New password is required'),
  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Password confirmation is required')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match')
];

// POST /api/password/change - Change password for authenticated user
router.post('/change', validatePasswordChange, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      code: 'VALIDATION_ERROR'
    });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId; // From authenticateToken middleware

  try {
    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;
