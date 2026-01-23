#!/bin/bash
# Phase 2: Code Quality & Maintainability Deployment
# Deploys centralized DB, error handling, logging, and config validation

set -e  # Exit on any error

echo "==========================================="
echo "Phase 2 Deployment - Code Quality"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

API_DIR="/home/ubuntu/kh-jobs-api"

echo -e "${YELLOW}Step 1: Checking directory...${NC}"
if [ ! -d "$API_DIR" ]; then
    echo -e "${RED}✗ API directory not found at $API_DIR${NC}"
    exit 1
fi
cd "$API_DIR"
echo -e "${GREEN}✓ API directory found${NC}"

echo ""
echo -e "${YELLOW}Step 2: Creating backup...${NC}"
BACKUP_DIR="/home/ubuntu/kh-jobs-api.backup.phase2.$(date +%Y%m%d_%H%M%S)"
cp -r "$API_DIR" "$BACKUP_DIR"
echo -e "${GREEN}✓ Backup created at $BACKUP_DIR${NC}"

echo ""
echo -e "${YELLOW}Step 3: Creating new infrastructure files...${NC}"

# Create db.js
cat > db.js << 'EOF'
[DB.JS CONTENT WILL BE INSERTED HERE]
EOF

# Create config.js
cat > config.js << 'EOF'
[CONFIG.JS CONTENT WILL BE INSERTED HERE]
EOF

# Create logger.js
cat > logger.js << 'EOF'
[LOGGER.JS CONTENT WILL BE INSERTED HERE]
EOF

# Create errorHandler.js
cat > middleware/errorHandler.js << 'EOF'
[ERRORHANDLER.JS CONTENT WILL BE INSERTED HERE]
EOF

echo -e "${GREEN}✓ Infrastructure files created${NC}"

echo ""
echo -e "${YELLOW}Step 4: Backing up and updating route files...${NC}"
mv routes/auth.js routes/auth-old.js
mv routes/password.js routes/password-old.js

# Copy updated route files (content will be pasted here during deployment)
echo -e "${GREEN}✓ Route files backed up${NC}"

echo ""
echo -e "${YELLOW}Step 5: Testing configuration...${NC}"
node -e "const {validateEnvironment} = require('./config'); validateEnvironment(); console.log('✓ Environment validated');"
echo -e "${GREEN}✓ Configuration valid${NC}"

echo ""
echo -e "${YELLOW}Step 6: Restarting PM2...${NC}"
pm2 restart kh-jobs-api
sleep 3
echo -e "${GREEN}✓ PM2 restarted${NC}"

echo ""
echo -e "${YELLOW}Step 7: Checking logs for errors...${NC}"
pm2 logs kh-jobs-api --lines 20 --nostream

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✓ Phase 2 Deployment Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "Improvements deployed:"
echo "  ✓ Centralized database pool (3 pools → 1 pool)"
echo "  ✓ Environment validation at startup"
echo "  ✓ Structured logging (JSON format)"
echo "  ✓ Centralized error handling"
echo "  ✓ Graceful shutdown with connection cleanup"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Monitor logs: pm2 logs kh-jobs-api"
echo "Check status: pm2 status"
echo ""
