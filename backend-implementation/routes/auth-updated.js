const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getPool } = require('../db');
const { getConfig } = require('../config');
const logger = require('../logger');
const {
  AuthenticationError,
  DatabaseError,
  ValidationError
} = require('../middleware/errorHandler');
const { authenticateRefreshToken } = require('../middleware/auth');
const { sanitizeInput, validateRequired } = require('../middleware/sanitize');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const config = getConfig();

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.loginMaxRequests,
  message: {
    error: 'Too many login attempts, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Generate JWT access token
 */
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry }
  );
}

/**
 * Generate JWT refresh token
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiry }
  );
}

/**
 * Set authentication cookies
 */
function setTokenCookies(res, accessToken, refreshToken) {
  const isProduction = config.nodeEnv === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

/**
 * POST /auth/login - Authenticate user and issue tokens
 */
router.post('/login', loginLimiter, sanitizeInput, validateRequired(['username', 'password']), async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const pool = getPool();

    // Find user by username
    const result = await pool.query(
      'SELECT id, username, password_hash, full_name, email FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      logger.warn('Login attempt for non-existent user', { username });
      throw new AuthenticationError('Invalid username or password');
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn('Login attempt with invalid password', { username });
      throw new AuthenticationError('Invalid username or password');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    logger.info('User logged in successfully', { username, userId: user.id });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/refresh - Refresh access token using refresh token
 */
router.post('/refresh', authenticateRefreshToken, async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.userId;

    // Get fresh user data
    const result = await pool.query(
      'SELECT id, username, full_name, email FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('User not found');
    }

    const user = result.rows[0];

    // Generate new access token
    const accessToken = generateAccessToken(user);

    // Set new access token cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    logger.debug('Access token refreshed', { username: user.username });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout - Clear authentication cookies
 */
router.post('/logout', (req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  logger.info('User logged out');

  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /auth/me - Get current user info
 */
router.get('/me', async (req, res, next) => {
  try {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      throw new AuthenticationError('Not authenticated');
    }

    // Verify access token
    const decoded = jwt.verify(accessToken, config.jwt.accessSecret);

    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, full_name, email FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('User not found');
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
