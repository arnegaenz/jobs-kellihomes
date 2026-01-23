#!/bin/bash
# Deployment script for password change feature
# Run this on your Lightsail server

set -e  # Exit on any error

echo "==========================================="
echo "Password Change Feature Deployment"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_DIR="/home/ubuntu/kh-jobs-api"

echo -e "${YELLOW}Step 1: Checking directory...${NC}"
if [ ! -d "$API_DIR" ]; then
    echo -e "${RED}✗ API directory not found at $API_DIR${NC}"
    exit 1
fi
echo -e "${GREEN}✓ API directory found${NC}"

echo ""
echo -e "${YELLOW}Step 2: Creating password route file...${NC}"
cd "$API_DIR"

cat > routes/password.js << 'EOF'
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
EOF

echo -e "${GREEN}✓ Password route file created${NC}"

echo ""
echo -e "${YELLOW}Step 3: Updating server.js...${NC}"

# Check if password route is already added
if grep -q "passwordRoutes" server.js; then
    echo -e "${GREEN}✓ Password route already configured in server.js${NC}"
else
    # Backup server.js
    cp server.js server.js.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✓ Backed up server.js${NC}"

    # Add the require statement after authRoutes require
    if grep -q "const authRoutes = require('./routes/auth');" server.js; then
        sed -i "/const authRoutes = require('\.\/routes\/auth');/a const passwordRoutes = require('./routes/password');" server.js
        echo -e "${GREEN}✓ Added passwordRoutes require${NC}"
    else
        echo -e "${RED}✗ Could not find authRoutes require line${NC}"
        echo "Please manually add this line to server.js after the authRoutes require:"
        echo "const passwordRoutes = require('./routes/password');"
    fi

    # Add the route after auth routes
    if grep -q "app.use('/auth', authRoutes);" server.js; then
        sed -i "/app\.use('\/auth', authRoutes);/a \\\n// Protected password change route\napp.use('/password', authenticateToken, passwordRoutes);" server.js
        echo -e "${GREEN}✓ Added password route${NC}"
    else
        echo -e "${RED}✗ Could not find auth route line${NC}"
        echo "Please manually add these lines to server.js after app.use('/auth', authRoutes):"
        echo "// Protected password change route"
        echo "app.use('/password', authenticateToken, passwordRoutes);"
    fi
fi

echo ""
echo -e "${YELLOW}Step 4: Restarting PM2...${NC}"
pm2 restart kh-jobs-api
echo -e "${GREEN}✓ PM2 restarted${NC}"

echo ""
echo -e "${YELLOW}Step 5: Checking PM2 status...${NC}"
pm2 status kh-jobs-api

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "Test the password change feature:"
echo "1. Go to https://jobs.kellihomes.com/change-password.html"
echo "2. Login if needed"
echo "3. Enter current password and new password"
echo "4. Test changing password for user 'arne'"
echo ""
echo "Check logs with: pm2 logs kh-jobs-api"
echo ""
