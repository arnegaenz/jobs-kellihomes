# Deploy Line Items Job Costing Upgrade

## Overview
This upgrade adds enhanced job costing capabilities to line items:
- Budget change tracking (original + increases with reasons)
- Schedule tracking (start/end dates)
- Notes field for each line item
- Automatic variance calculations

## Prerequisites
- SSH access to AWS Lightsail backend server
- PostgreSQL admin access
- PM2 access to restart API server

## Deployment Steps

### 1. Backup Database
```bash
# SSH into Lightsail server
ssh ubuntu@api.jobs.kellihomes.com

# Backup the database
pg_dump -U kh_admin -d kh_jobs > ~/backup_before_line_items_upgrade_$(date +%Y%m%d).sql
```

### 2. Run Database Migration
```bash
# Copy migration file to server (from your local machine)
scp backend-implementation/migrations/001_line_items_job_costing.sql ubuntu@api.jobs.kellihomes.com:~/

# SSH into server
ssh ubuntu@api.jobs.kellihomes.com

# Run migration
psql -U kh_admin -d kh_jobs -f ~/001_line_items_job_costing.sql

# Verify migration
psql -U kh_admin -d kh_jobs -c "\d line_items"
```

Expected output should show:
- `budget` and `actual` as `numeric(10,2)`
- `budget_history` as `jsonb`
- `schedule` as `jsonb`
- `notes_text` as `text`

### 3. Deploy Backend Code

```bash
# On your local machine, copy the new route file
scp backend-implementation/routes/lineItems.js ubuntu@api.jobs.kellihomes.com:/home/ubuntu/kh-jobs-api/routes/

# SSH into server
ssh ubuntu@api.jobs.kellihomes.com

# Navigate to API directory
cd /home/ubuntu/kh-jobs-api

# Update server.js to include line items route
# Add this line after other route imports:
# const lineItemsRoutes = require('./routes/lineItems');

# Add this line in the protected routes section:
# app.use('/jobs/:jobId/line-items', authenticateToken, lineItemsRoutes);

# Restart API with PM2
pm2 restart kh-jobs-api

# Check logs
pm2 logs kh-jobs-api --lines 50
```

### 4. Deploy Frontend Code

Frontend changes will be deployed separately via GitHub Pages auto-deploy when pushed to main.

### 5. Verify Deployment

**Test API endpoint:**
```bash
# From your local machine
curl -X GET https://api.jobs.kellihomes.com/health

# Should return: {"status":"ok","timestamp":"..."}
```

**Test line items endpoint (requires authentication):**
- Log into https://jobs.kellihomes.com
- Open a job detail page
- Check browser DevTools Network tab for:
  - `GET /jobs/{jobId}/line-items` - should return 200
  - Line items should load correctly

## Rollback Plan

If something goes wrong:

```bash
# SSH into server
ssh ubuntu@api.jobs.kellihomes.com

# Restore database from backup
psql -U kh_admin -d kh_jobs < ~/backup_before_line_items_upgrade_YYYYMMDD.sql

# Revert code changes
cd /home/ubuntu/kh-jobs-api
git checkout HEAD -- routes/lineItems.js

# Restart API
pm2 restart kh-jobs-api
```

## Testing Checklist

- [ ] Database migration ran successfully
- [ ] No errors in `pm2 logs`
- [ ] Health check endpoint returns 200
- [ ] Can log into frontend
- [ ] Can view existing jobs
- [ ] Line items load on job detail page
- [ ] Can add new line items
- [ ] Can save line items
- [ ] Budget calculations work correctly
- [ ] Schedule dates save correctly
- [ ] Notes field saves correctly

## Files Modified

### Backend
- `/home/ubuntu/kh-jobs-api/routes/lineItems.js` - NEW FILE
- `/home/ubuntu/kh-jobs-api/server.js` - MODIFIED (add route import)

### Database
- `line_items` table - MODIFIED (4 new columns, 2 type changes)

### Frontend
- `main.js` - TO BE MODIFIED (next step)
- `job.html` - TO BE MODIFIED (next step)

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs kh-jobs-api`
2. Check PostgreSQL logs: `sudo journalctl -u postgresql -n 100`
3. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`

## Next Steps

After backend deployment is complete:
1. Update frontend code in `main.js`
2. Push to GitHub to trigger auto-deploy
3. Test end-to-end flow
