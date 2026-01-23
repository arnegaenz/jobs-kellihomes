const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { getPool } = require('../db');
const logger = require('../logger');
const {
  ValidationError,
  AuthenticationError,
  NotFoundError
} = require('../middleware/errorHandler');

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

// POST /password/change - Change password for authenticated user
router.post('/change', validatePasswordChange, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ValidationError(errors.array()[0].msg));
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId; // From authenticateToken middleware

  try {
    const pool = getPool();

    // Get current password hash
    const userResult = await pool.query(
      'SELECT username, password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      logger.warn('Password change attempt with incorrect current password', {
        username: user.username,
        userId
      });
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    logger.info('Password changed successfully', {
      username: user.username,
      userId
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
