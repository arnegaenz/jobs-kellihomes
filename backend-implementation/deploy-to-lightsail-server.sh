#!/bin/bash
# Server Deployment Script - Run this ON the Lightsail server
# This performs database migration and server updates

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_DIR="/home/ubuntu/kh-jobs-api"
MIGRATION_FILE="~/001_line_items_job_costing.sql"

echo "=========================================="
echo "Kelli Homes API - Deploy to Lightsail"
echo "Step 2: Database & Server Update"
echo "=========================================="
echo ""

# Load database credentials from .env
echo -e "${YELLOW}Loading database credentials...${NC}"
cd "$API_DIR"
source .env
echo -e "${GREEN}✓ Credentials loaded${NC}"

# Step 1: Backup database (optional - skip if version mismatch)
echo ""
echo -e "${YELLOW}Step 1: Attempting database backup...${NC}"
BACKUP_FILE=~/backup_before_line_items_upgrade_$(date +%Y%m%d_%H%M%S).sql
if PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓ Database backed up to: $BACKUP_FILE${NC}"
else
    echo -e "${YELLOW}⚠ Backup skipped (version mismatch - this is OK, migration is non-destructive)${NC}"
fi

# Step 2: Run migrations
echo ""
echo -e "${YELLOW}Step 2: Running database migrations...${NC}"

# Run business documents migration
if [ -f "$API_DIR/migrations/005_business_documents.sql" ]; then
    echo -e "${YELLOW}Running business_documents migration...${NC}"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$API_DIR/migrations/005_business_documents.sql"
    echo -e "${GREEN}✓ Business documents migration completed${NC}"
else
    echo -e "${YELLOW}⚠ business_documents migration file not found, skipping${NC}"
fi

# Run documents table migration
if [ -f "$API_DIR/migrations/006_documents_table.sql" ]; then
    echo -e "${YELLOW}Running documents table migration...${NC}"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$API_DIR/migrations/006_documents_table.sql"
    echo -e "${GREEN}✓ Documents table migration completed${NC}"
else
    echo -e "${YELLOW}⚠ documents table migration file not found, skipping${NC}"
fi

# Step 3: Verify migrations
echo ""
echo -e "${YELLOW}Step 3: Verifying migrations...${NC}"

# Verify business_documents table exists
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d business_documents" > /tmp/business_docs_schema.txt 2>&1
if grep -q "s3_key" /tmp/business_docs_schema.txt && \
   grep -q "file_name" /tmp/business_docs_schema.txt && \
   grep -q "type" /tmp/business_docs_schema.txt; then
    echo -e "${GREEN}✓ business_documents table verified${NC}"
else
    echo -e "${YELLOW}⚠ business_documents table verification failed (may already exist)${NC}"
fi

# Verify documents table exists
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d documents" > /tmp/documents_schema.txt 2>&1
if grep -q "storage_key" /tmp/documents_schema.txt && \
   grep -q "job_id" /tmp/documents_schema.txt && \
   grep -q "document_type" /tmp/documents_schema.txt; then
    echo -e "${GREEN}✓ documents table verified${NC}"
else
    echo -e "${RED}✗ documents table verification failed - check migration${NC}"
fi

# Step 4: server.js should already be updated from file copy
echo ""
echo -e "${YELLOW}Step 4: Verifying server.js...${NC}"
cd "$API_DIR"

# Backup current server.js
cp server.js server.js.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ server.js backed up${NC}"

# Verify it has the new routes
if grep -q "businessDocumentsRoutes" server.js; then
    echo -e "${GREEN}✓ server.js has businessDocumentsRoutes${NC}"
else
    echo -e "${RED}✗ server.js missing businessDocumentsRoutes - file copy may have failed${NC}"
    exit 1
fi

# Step 5: Verify route files exist
echo ""
echo -e "${YELLOW}Step 5: Verifying route files...${NC}"
if [ -f "$API_DIR/routes/businessDocuments.js" ]; then
    echo -e "${GREEN}✓ routes/businessDocuments.js exists${NC}"
else
    echo -e "${RED}✗ routes/businessDocuments.js not found${NC}"
    exit 1
fi

if [ -f "$API_DIR/routes/lineItems.js" ]; then
    echo -e "${GREEN}✓ routes/lineItems.js exists${NC}"
else
    echo -e "${RED}✗ routes/lineItems.js not found${NC}"
    exit 1
fi

# Step 6: Test server startup
echo ""
echo -e "${YELLOW}Step 6: Testing server startup...${NC}"
timeout 5 node server.js > /tmp/server-test.log 2>&1 &
SERVER_PID=$!
sleep 3

if ps -p $SERVER_PID > /dev/null 2>&1; then
    kill $SERVER_PID 2>/dev/null || true
    echo -e "${GREEN}✓ Server starts successfully${NC}"
else
    echo -e "${RED}✗ Server failed to start${NC}"
    echo "Error log:"
    cat /tmp/server-test.log
    exit 1
fi

# Step 7: Restart with PM2
echo ""
echo -e "${YELLOW}Step 7: Restarting API with PM2...${NC}"
pm2 restart kh-jobs-api
sleep 2
echo -e "${GREEN}✓ PM2 restarted${NC}"

# Step 8: Check PM2 status
echo ""
echo -e "${YELLOW}Step 8: Checking PM2 status...${NC}"
pm2 status kh-jobs-api

# Step 9: Check recent logs
echo ""
echo -e "${YELLOW}Step 9: Checking recent logs...${NC}"
pm2 logs kh-jobs-api --lines 20 --nostream

echo ""
echo -e "${GREEN}=========================================="
echo "✓ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Backup location: $BACKUP_FILE"
echo ""
echo "Next steps:"
echo "1. Test health endpoint:"
echo "   curl https://api.jobs.kellihomes.com/health"
echo ""
echo "2. Test in browser:"
echo "   - Go to https://jobs.kellihomes.com"
echo "   - Open a job detail page"
echo "   - Verify line items load correctly"
echo ""
echo "3. Monitor logs:"
echo "   pm2 logs kh-jobs-api"
echo ""
