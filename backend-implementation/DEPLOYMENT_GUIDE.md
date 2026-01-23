# Backend Deployment Guide - Secure Authentication

## Overview
This guide walks you through deploying the new secure authentication system to your AWS Lightsail server.

**CRITICAL:** This is a breaking change. All users will need to log in again after deployment.

## Pre-Deployment Checklist

- [ ] Backup current database
- [ ] Backup current backend code on Lightsail
- [ ] Test deployment in a staging environment (if available)
- [ ] Notify users of brief downtime (5-10 minutes)
- [ ] Have rollback plan ready

## Step 1: Backup Existing System

### Backup Database
```bash
# SSH into Lightsail
ssh ubuntu@44.238.21.97

# Create database backup
pg_dump -h your-db-endpoint -U kh_admin -d kh_jobs > /home/ubuntu/backups/db_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Backup Backend Code
```bash
# On Lightsail server
cd /home/ubuntu
cp -r kh-jobs-api kh-jobs-api.backup.$(date +%Y%m%d_%H%M%S)
```

## Step 2: Generate JWT Secrets

On your local machine or Lightsail server:

```bash
# Generate access token secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate refresh token secret (run again for a different value)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Save these secrets securely - you'll need them for the `.env` file.

## Step 3: Upload New Backend Code

### Option A: Manual File Upload

1. **Copy files to Lightsail:**
   ```bash
   # From your local machine, inside backend-implementation directory
   scp -r * ubuntu@44.238.21.97:/home/ubuntu/kh-jobs-api-new/
   ```

2. **SSH into Lightsail:**
   ```bash
   ssh ubuntu@44.238.21.97
   ```

3. **Install new dependencies:**
   ```bash
   cd /home/ubuntu/kh-jobs-api-new
   npm install
   ```

### Option B: Git Deployment (Recommended)

If you have the backend in a separate Git repository:

```bash
# SSH into Lightsail
ssh ubuntu@44.238.21.97

cd /home/ubuntu/kh-jobs-api
git pull origin main
npm install
```

## Step 4: Configure Environment Variables

Edit `/home/ubuntu/kh-jobs-api/.env`:

```bash
cd /home/ubuntu/kh-jobs-api
nano .env
```

Add these new variables (keep existing DB and S3 config):

```env
# JWT Configuration
JWT_ACCESS_SECRET=<paste-first-generated-secret-here>
JWT_REFRESH_SECRET=<paste-second-generated-secret-here>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Server Configuration
NODE_ENV=production
FRONTEND_URL=https://jobs.kellihomes.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOGIN_RATE_LIMIT_MAX=5
```

Save and exit (Ctrl+O, Enter, Ctrl+X).

## Step 5: Update Server.js

Your existing `server.js` needs to be updated to include:

1. **New imports at the top:**
```javascript
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('./middleware/auth');
const { sanitizeInput } = require('./middleware/sanitize');
const authRoutes = require('./routes/auth');
```

2. **Update CORS configuration:**
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // CRITICAL: Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
```

3. **Add new middleware before routes:**
```javascript
app.use(helmet());
app.use(cookieParser());
app.use(sanitizeInput);
```

4. **Add auth routes:**
```javascript
app.use('/auth', authRoutes);
```

5. **Protect existing routes:**
```javascript
// Add authenticateToken middleware to all protected routes
app.use('/jobs', authenticateToken, jobsRouter);
app.use('/documents', authenticateToken, documentsRouter);
// etc.
```

**See `server.js` in this directory for a complete example.**

## Step 6: Setup Database Users Table

```bash
# On Lightsail server
cd /home/ubuntu/kh-jobs-api
node scripts/setup-users.js
```

Expected output:
```
Starting database setup...
Creating users table...
✓ Users table created
Creating initial users...
✓ Created user: arne
✓ Created user: raquel
✓ Created user: justin

✅ Database setup complete!
```

## Step 7: Test Backend Locally (on Lightsail)

Before restarting PM2, test that the server starts:

```bash
cd /home/ubuntu/kh-jobs-api
node server.js
```

You should see:
```
✅ Kelli Homes API Server running on port 3000
   Environment: production
   Frontend URL: https://jobs.kellihomes.com
```

If you see errors, fix them before proceeding.

Press Ctrl+C to stop the test server.

## Step 8: Restart PM2

```bash
# Stop current process
pm2 stop kh-jobs-api

# Start with new code
pm2 start server.js --name kh-jobs-api

# Save PM2 configuration
pm2 save

# Check status
pm2 status

# View logs to verify it started correctly
pm2 logs kh-jobs-api --lines 50
```

## Step 9: Test Authentication Endpoints

From your local machine or using curl on Lightsail:

### Test login:
```bash
curl -X POST https://api.jobs.kellihomes.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"arne","password":"$yd3JAC9"}' \
  -c cookies.txt \
  -v
```

Expected response:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "arne",
    "fullName": "Arne Gaenz",
    "email": "arne@kellihomes.com"
  }
}
```

Check that `Set-Cookie` headers are present in response.

### Test protected route:
```bash
curl https://api.jobs.kellihomes.com/jobs \
  -b cookies.txt \
  -v
```

Should return jobs data (if route is protected correctly).

### Test without cookies:
```bash
curl https://api.jobs.kellihomes.com/jobs
```

Should return:
```json
{
  "error": "Authentication required",
  "code": "NO_TOKEN"
}
```

## Step 10: Deploy Frontend Changes

After backend is working, deploy the updated frontend (see FRONTEND_DEPLOYMENT_GUIDE.md).

## Verification Checklist

After deployment, verify:

- [ ] Backend server is running (pm2 status)
- [ ] No errors in logs (pm2 logs)
- [ ] Login endpoint works
- [ ] Protected routes require authentication
- [ ] Invalid credentials are rejected
- [ ] Tokens expire correctly
- [ ] Users can log out
- [ ] Frontend can authenticate users

## Troubleshooting

### Error: "Cannot find module 'bcrypt'"
```bash
cd /home/ubuntu/kh-jobs-api
npm install
pm2 restart kh-jobs-api
```

### Error: "JWT_ACCESS_SECRET is not defined"
Check `.env` file exists and has the JWT secrets:
```bash
cat /home/ubuntu/kh-jobs-api/.env | grep JWT
```

### Error: "CORS policy blocked"
Verify CORS configuration in server.js includes `credentials: true`.

### Users can't log in
Check database:
```bash
psql -h your-db-endpoint -U kh_admin -d kh_jobs -c "SELECT username FROM users;"
```

If table doesn't exist, run setup script again:
```bash
node scripts/setup-users.js
```

### Tokens not being sent
Ensure:
1. Backend sets cookies with httpOnly, secure (in production), sameSite flags
2. Frontend API calls include `credentials: 'include'`
3. CORS allows credentials

### Check PM2 logs
```bash
pm2 logs kh-jobs-api --lines 100
```

## Rollback Procedure

If critical issues arise:

1. **Stop current process:**
   ```bash
   pm2 stop kh-jobs-api
   ```

2. **Restore backup:**
   ```bash
   cd /home/ubuntu
   rm -rf kh-jobs-api
   cp -r kh-jobs-api.backup.YYYYMMDD_HHMMSS kh-jobs-api
   ```

3. **Restart old version:**
   ```bash
   cd kh-jobs-api
   pm2 start server.js --name kh-jobs-api
   pm2 save
   ```

4. **Restore database (if users table was created):**
   ```bash
   psql -h your-db-endpoint -U kh_admin -d kh_jobs -c "DROP TABLE IF EXISTS users;"
   ```

5. **Redeploy old frontend** from previous Git commit

## Post-Deployment

1. **Monitor logs** for the first hour:
   ```bash
   pm2 logs kh-jobs-api --lines 50
   ```

2. **Test all major features:**
   - Create a job
   - Edit a job
   - Upload a document
   - Save line items

3. **Get user feedback** - ensure login works for all three users

4. **Document any issues** and create follow-up tasks

## Security Best Practices

After successful deployment:

1. **Change default passwords** - Have all users change their passwords
2. **Implement password change endpoint** (future task)
3. **Enable SSL on PostgreSQL** connection if not already enabled
4. **Monitor for suspicious login attempts**
5. **Set up automated backups** for database
6. **Consider adding 2FA** in the future

## Support

If you encounter issues during deployment:
- Check PM2 logs: `pm2 logs kh-jobs-api`
- Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Check PostgreSQL: Ensure connections are working
- Review this guide step-by-step

For urgent issues, rollback and investigate offline.
