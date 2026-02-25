const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { authenticateRefreshToken } = require('../middleware/auth');
const { sanitizeInput, validateRequired } = require('../middleware/sanitize');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  message: { error: 'Too many login attempts, please try again later', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
}

function setTokenCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

router.post('/login', loginLimiter, sanitizeInput, validateRequired(['username', 'password']), async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      'SELECT id, username, password_hash, full_name, email FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    setTokenCookies(res, accessToken, refreshToken);
    res.json({
      success: true,
      user: { id: user.id, username: user.username, fullName: user.full_name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

router.post('/refresh', authenticateRefreshToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'User no longer exists' });
    }
    const user = result.rows[0];
    const accessToken = generateAccessToken(user);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000
    });
    res.json({ success: true, message: 'Access token refreshed' });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'An error occurred while refreshing token' });
  }
});

router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, full_name, email FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({ user: { id: user.id, username: user.username, fullName: user.full_name, email: user.email } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'An error occurred while fetching user info' });
  }
});

module.exports = router;
