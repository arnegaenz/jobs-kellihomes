#!/bin/bash
# ONE-COMMAND DEPLOYMENT SCRIPT
# Copy this entire file and run it on your Lightsail server

set -e

echo "🚀 Starting Kelli Homes Security Deployment..."
echo ""

# Step 1: Backup
echo "📦 Creating backup..."
cd /home/ubuntu
cp -r kh-jobs-api kh-jobs-api.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backup complete"

# Step 2: Create directories
echo "📁 Creating directories..."
cd kh-jobs-api
mkdir -p routes middleware scripts
echo "✅ Directories created"

# Step 3: Install dependencies
echo "📥 Installing dependencies..."
npm install bcrypt jsonwebtoken express-rate-limit helmet cookie-parser express-validator
echo "✅ Dependencies installed"

# Step 4: Create auth route
echo "📝 Creating routes/auth.js..."
cat > routes/auth.js << 'AUTHROUTE'
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
AUTHROUTE
echo "✅ routes/auth.js created"

# Step 5: Create auth middleware
echo "📝 Creating middleware/auth.js..."
cat > middleware/auth.js << 'AUTHMW'
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const accessToken = req.cookies.accessToken;
  if (!accessToken) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }
  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

function authenticateRefreshToken(req, res, next) {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required', code: 'NO_REFRESH_TOKEN' });
  }
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
  }
}

module.exports = { authenticateToken, authenticateRefreshToken };
AUTHMW
echo "✅ middleware/auth.js created"

# Step 6: Create sanitize middleware
echo "📝 Creating middleware/sanitize.js..."
cat > middleware/sanitize.js << 'SANMW'
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];
    for (const field of fields) {
      if (!req.body[field] || (typeof req.body[field] === 'string' && !req.body[field].trim())) {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing required fields', fields: missing });
    }
    next();
  };
}

function isValidEmail(email) {
  if (!email) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  if (!phone) return true;
  const phoneRegex = /^[0-9+().\-\s]*$/;
  const digits = phone.replace(/\D/g, '');
  return phoneRegex.test(phone) && digits.length >= 7;
}

function validateJobData(req, res, next) {
  const { clientEmail, clientPhone } = req.body;
  if (clientEmail && !isValidEmail(clientEmail)) {
    return res.status(400).json({ error: 'Invalid email format', field: 'clientEmail' });
  }
  if (clientPhone && !isValidPhone(clientPhone)) {
    return res.status(400).json({ error: 'Invalid phone format. Must contain at least 7 digits.', field: 'clientPhone' });
  }
  next();
}

module.exports = {
  sanitizeInput,
  sanitizeString,
  sanitizeObject,
  validateRequired,
  validateJobData,
  isValidEmail,
  isValidPhone
};
SANMW
echo "✅ middleware/sanitize.js created"

# Step 7: Create database setup script
echo "📝 Creating scripts/setup-users.js..."
cat > scripts/setup-users.js << 'SETUPUSERS'
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('Creating users table...');
    await client.query(\`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    \`);
    console.log('✓ Users table created');

    const existingUsers = await client.query('SELECT COUNT(*) FROM users');
    if (existingUsers.rows[0].count > 0) {
      console.log('⚠ Users already exist. Skipping user creation.');
      return;
    }

    console.log('Creating initial users...');
    const users = [
      { username: 'arne', password: '$yd3JAC9', fullName: 'Arne Gaenz', email: 'arne@kellihomes.com' },
      { username: 'raquel', password: 'elizabeth1', fullName: 'Raquel', email: 'raquel@kellihomes.com' },
      { username: 'justin', password: 'Aryna2026', fullName: 'Justin', email: 'justin@kellihomes.com' }
    ];

    const SALT_ROUNDS = 12;
    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      await client.query(
        \`INSERT INTO users (username, password_hash, full_name, email) VALUES ($1, $2, $3, $4)\`,
        [user.username.toLowerCase(), passwordHash, user.fullName, user.email]
      );
      console.log(\`✓ Created user: \${user.username}\`);
    }

    console.log('\\n✅ Database setup complete!');
    console.log('\\nInitial users:');
    users.forEach(u => console.log(\`  - \${u.username} / \${u.password}\`));
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase()
  .then(() => process.exit(0))
  .catch(error => { console.error(error.message); process.exit(1); });
SETUPUSERS
echo "✅ scripts/setup-users.js created"

# Step 8: Update .env
echo "🔧 Updating .env file..."
cat >> .env << 'ENVVARS'

# JWT Configuration (Added by deployment script)
JWT_ACCESS_SECRET=b758855fc550246c461e98fa5ed848d0fd9aa6afa8bb0b227fec7cc09f68fa59416363e4d651a0a99f1086c80de0c97d14b23bb0b9e0e760c0b9460bb7a0d909
JWT_REFRESH_SECRET=47177e5a5fae24c421fc3640e5380f488b79bddacbe4bd2d9e2002e6a0e951836ec6dee112201c4e936112e9b6894eee109fd2f30e32bd95d68bf14c33f4978f
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NODE_ENV=production
FRONTEND_URL=https://jobs.kellihomes.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOGIN_RATE_LIMIT_MAX=5
ENVVARS
echo "✅ .env updated"

# Step 9: Setup database
echo "💾 Setting up users database table..."
node scripts/setup-users.js
echo "✅ Database setup complete"

# Step 10: Show server.js update instructions
echo ""
echo "⚠️  IMPORTANT: You need to update server.js manually"
echo ""
echo "Add these lines to the top of server.js:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "const helmet = require('helmet');"
echo "const cookieParser = require('cookie-parser');"
echo "const { authenticateToken } = require('./middleware/auth');"
echo "const { sanitizeInput } = require('./middleware/sanitize');"
echo "const authRoutes = require('./routes/auth');"
echo ""
echo "Update CORS to:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "app.use(cors({"
echo "  origin: process.env.FRONTEND_URL,"
echo "  credentials: true,"
echo "  methods: ['GET', 'POST', 'PUT', 'DELETE'],"
echo "  allowedHeaders: ['Content-Type']"
echo "}));"
echo ""
echo "Add middleware before routes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "app.use(helmet());"
echo "app.use(cookieParser());"
echo "app.use(sanitizeInput);"
echo ""
echo "Add auth routes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "app.use('/auth', authRoutes);"
echo ""
echo "Protect existing routes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "app.use('/jobs', authenticateToken, jobsRouter);"
echo "app.use('/documents', authenticateToken, documentsRouter);"
echo ""
echo "Press Enter after you've updated server.js to continue..."
read

# Step 11: Restart PM2
echo "🔄 Restarting PM2..."
pm2 stop kh-jobs-api || true
pm2 delete kh-jobs-api || true
pm2 start server.js --name kh-jobs-api
pm2 save
echo "✅ PM2 restarted"

# Step 12: Check status
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Backend Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next: Deploy frontend by running this on your local machine:"
echo "  cd /Users/arg/development/jobs-kellihomes"
echo "  git add ."
echo "  git commit -m 'Implement secure authentication'"
echo "  git push origin main"
echo ""
