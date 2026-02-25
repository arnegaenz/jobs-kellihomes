#!/bin/bash
# Local Deployment Script - Run this from your Mac
# This copies files to the Lightsail server

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SERVER="ubuntu@api.jobs.kellihomes.com"
SSH_KEY="$HOME/.ssh/LightsailDefaultKey-us-west-2.pem"
LOCAL_DIR="/Users/arg/development/jobs-kellihomes/backend-implementation"

echo "=========================================="
echo "Kelli Homes API - Deploy to Lightsail"
echo "Step 1: Copy Files (Local)"
echo "=========================================="
echo ""

echo -e "${YELLOW}Copying all backend files...${NC}"

# Copy all routes
scp -i "$SSH_KEY" "$LOCAL_DIR/routes/"*.js $SERVER:/home/ubuntu/kh-jobs-api/routes/
echo -e "${GREEN}✓ Route files copied${NC}"

# Copy services
ssh -i "$SSH_KEY" $SERVER "mkdir -p /home/ubuntu/kh-jobs-api/services"
scp -i "$SSH_KEY" "$LOCAL_DIR/services/"*.js $SERVER:/home/ubuntu/kh-jobs-api/services/
echo -e "${GREEN}✓ Service files copied${NC}"

# Copy scripts
scp -i "$SSH_KEY" "$LOCAL_DIR/scripts/"*.js $SERVER:/home/ubuntu/kh-jobs-api/scripts/
echo -e "${GREEN}✓ Script files copied${NC}"

# Copy server.js and package.json
scp -i "$SSH_KEY" "$LOCAL_DIR/server.js" $SERVER:/home/ubuntu/kh-jobs-api/
scp -i "$SSH_KEY" "$LOCAL_DIR/package.json" $SERVER:/home/ubuntu/kh-jobs-api/
echo -e "${GREEN}✓ server.js and package.json copied${NC}"

# Copy all migration files
scp -i "$SSH_KEY" "$LOCAL_DIR/migrations/"*.sql $SERVER:/home/ubuntu/kh-jobs-api/migrations/
echo -e "${GREEN}✓ Migration files copied${NC}"

echo ""
echo -e "${YELLOW}Copying server deployment script...${NC}"
scp -i "$SSH_KEY" "$LOCAL_DIR/deploy-to-lightsail-server.sh" $SERVER:~/
ssh -i "$SSH_KEY" $SERVER "chmod +x ~/deploy-to-lightsail-server.sh"
echo -e "${GREEN}✓ Server script copied and made executable${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo "✓ Files Copied Successfully!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. SSH into server: ssh -i $SSH_KEY $SERVER"
echo "2. Run the deployment script: ./deploy-to-lightsail-server.sh"
echo ""
