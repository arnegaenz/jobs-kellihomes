#!/bin/bash
# Automated Backend Deployment Script for Kelli Homes API
# This script does everything needed to deploy the secure authentication system

set -e  # Exit on any error

echo "=========================================="
echo "Kelli Homes API - Security Deployment"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_DIR="/home/ubuntu/kh-jobs-api"
BACKUP_DIR="/home/ubuntu/kh-jobs-api.backup.$(date +%Y%m%d_%H%M%S)"

echo -e "${YELLOW}Step 1: Creating backup...${NC}"
if [ -d "$API_DIR" ]; then
    cp -r "$API_DIR" "$BACKUP_DIR"
    echo -e "${GREEN}✓ Backup created at: $BACKUP_DIR${NC}"
else
    echo -e "${RED}✗ API directory not found at $API_DIR${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Creating new directories...${NC}"
mkdir -p "$API_DIR/routes"
mkdir -p "$API_DIR/middleware"
mkdir -p "$API_DIR/scripts"
echo -e "${GREEN}✓ Directories created${NC}"

echo ""
echo -e "${YELLOW}Step 3: Installing new dependencies...${NC}"
cd "$API_DIR"
npm install bcrypt jsonwebtoken express-rate-limit helmet cookie-parser express-validator
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}Step 4: Reading existing .env configuration...${NC}"
if [ -f "$API_DIR/.env" ]; then
    echo -e "${GREEN}✓ Found existing .env file${NC}"

    # Read existing values
    source "$API_DIR/.env"

    # Append new JWT secrets to .env
    echo "" >> "$API_DIR/.env"
    echo "# JWT Configuration (Added $(date))" >> "$API_DIR/.env"
    echo "JWT_ACCESS_SECRET=b758855fc550246c461e98fa5ed848d0fd9aa6afa8bb0b227fec7cc09f68fa59416363e4d651a0a99f1086c80de0c97d14b23bb0b9e0e760c0b9460bb7a0d909" >> "$API_DIR/.env"
    echo "JWT_REFRESH_SECRET=47177e5a5fae24c421fc3640e5380f488b79bddacbe4bd2d9e2002e6a0e951836ec6dee112201c4e936112e9b6894eee109fd2f30e32bd95d68bf14c33f4978f" >> "$API_DIR/.env"
    echo "JWT_ACCESS_EXPIRY=15m" >> "$API_DIR/.env"
    echo "JWT_REFRESH_EXPIRY=7d" >> "$API_DIR/.env"
    echo "" >> "$API_DIR/.env"
    echo "# Server Configuration" >> "$API_DIR/.env"
    echo "NODE_ENV=production" >> "$API_DIR/.env"
    echo "FRONTEND_URL=https://jobs.kellihomes.com" >> "$API_DIR/.env"
    echo "" >> "$API_DIR/.env"
    echo "# Rate Limiting" >> "$API_DIR/.env"
    echo "RATE_LIMIT_WINDOW_MS=900000" >> "$API_DIR/.env"
    echo "RATE_LIMIT_MAX_REQUESTS=100" >> "$API_DIR/.env"
    echo "LOGIN_RATE_LIMIT_MAX=5" >> "$API_DIR/.env"

    echo -e "${GREEN}✓ .env updated with JWT secrets${NC}"
else
    echo -e "${RED}✗ No .env file found. Please create one with DB and AWS credentials.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 5: Copying new route files...${NC}"
echo "Please ensure routes/auth.js, middleware/auth.js, middleware/sanitize.js, and scripts/setup-users.js are in the current directory"
echo "Press Enter when files are ready, or Ctrl+C to cancel..."
read

if [ -f "routes/auth.js" ]; then
    cp routes/auth.js "$API_DIR/routes/"
    echo -e "${GREEN}✓ Copied routes/auth.js${NC}"
else
    echo -e "${RED}✗ routes/auth.js not found${NC}"
fi

if [ -f "middleware/auth.js" ]; then
    cp middleware/auth.js "$API_DIR/middleware/"
    echo -e "${GREEN}✓ Copied middleware/auth.js${NC}"
else
    echo -e "${RED}✗ middleware/auth.js not found${NC}"
fi

if [ -f "middleware/sanitize.js" ]; then
    cp middleware/sanitize.js "$API_DIR/middleware/"
    echo -e "${GREEN}✓ Copied middleware/sanitize.js${NC}"
else
    echo -e "${RED}✗ middleware/sanitize.js not found${NC}"
fi

if [ -f "scripts/setup-users.js" ]; then
    cp scripts/setup-users.js "$API_DIR/scripts/"
    echo -e "${GREEN}✓ Copied scripts/setup-users.js${NC}"
else
    echo -e "${RED}✗ scripts/setup-users.js not found${NC}"
fi

echo ""
echo -e "${YELLOW}Step 6: Setting up database users table...${NC}"
cd "$API_DIR"
node scripts/setup-users.js
echo -e "${GREEN}✓ Database setup complete${NC}"

echo ""
echo -e "${YELLOW}Step 7: Testing server startup...${NC}"
timeout 5 node server.js > /tmp/server-test.log 2>&1 &
SERVER_PID=$!
sleep 3

if ps -p $SERVER_PID > /dev/null; then
    kill $SERVER_PID
    echo -e "${GREEN}✓ Server starts successfully${NC}"
else
    echo -e "${RED}✗ Server failed to start. Check /tmp/server-test.log${NC}"
    cat /tmp/server-test.log
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 8: Restarting with PM2...${NC}"
pm2 stop kh-jobs-api || true
pm2 delete kh-jobs-api || true
pm2 start server.js --name kh-jobs-api
pm2 save
echo -e "${GREEN}✓ PM2 restarted${NC}"

echo ""
echo -e "${YELLOW}Step 9: Verifying PM2 status...${NC}"
pm2 status

echo ""
echo -e "${GREEN}=========================================="
echo "✓ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Check logs: pm2 logs kh-jobs-api"
echo "2. Test login endpoint:"
echo "   curl -X POST https://api.jobs.kellihomes.com/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"arne\",\"password\":\"\$yd3JAC9\"}' \\"
echo "     -v"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
