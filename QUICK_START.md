# Quick Start - Phase 1 Security Deployment

## TL;DR

Phase 1 security implementation is complete. This guide gets you deployed in under an hour.

---

## Pre-Flight Checklist

- [ ] Backend code on Lightsail is backed up
- [ ] Database is backed up
- [ ] You have SSH access to Lightsail (44.238.21.97)
- [ ] You have access to push to GitHub repo
- [ ] Users are notified of 10-minute downtime

---

## Step 1: Generate Secrets (5 minutes)

On your local machine or Lightsail:

```bash
# Generate JWT access secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT refresh secret (run again for different value)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Save both secrets somewhere secure - you'll need them in Step 3.

---

## Step 2: Upload Backend Code (10 minutes)

### Option A: Manual Upload

```bash
# From your local machine, in backend-implementation directory
cd /Users/arg/development/jobs-kellihomes/backend-implementation
scp -r * ubuntu@44.238.21.97:/home/ubuntu/kh-jobs-api-new/
```

### Option B: Copy Files on Server

```bash
# SSH into Lightsail
ssh ubuntu@44.238.21.97

# Create backup
cd /home/ubuntu
cp -r kh-jobs-api kh-jobs-api.backup.$(date +%Y%m%d_%H%M%S)

# Copy new files to existing directory
# (You'll need to manually copy routes/, middleware/, scripts/ folders)
```

---

## Step 3: Configure Backend (5 minutes)

```bash
# SSH into Lightsail
ssh ubuntu@44.238.21.97

# Navigate to API directory
cd /home/ubuntu/kh-jobs-api

# Install new dependencies
npm install

# Edit .env file
nano .env
```

**Add these lines to .env** (keep existing DB and S3 config):

```env
# JWT Configuration
JWT_ACCESS_SECRET=<paste-first-secret-from-step-1>
JWT_REFRESH_SECRET=<paste-second-secret-from-step-1>
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

Save (Ctrl+O, Enter, Ctrl+X).

---

## Step 4: Update Server.js (10 minutes)

Your existing `server.js` needs auth integration. Key changes:

1. **Add imports:**
```javascript
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { authenticateToken } = require('./middleware/auth');
const { sanitizeInput } = require('./middleware/sanitize');
const authRoutes = require('./routes/auth');
```

2. **Update CORS:**
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // CRITICAL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
```

3. **Add middleware:**
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
app.use('/jobs', authenticateToken, jobsRouter);
app.use('/documents', authenticateToken, documentsRouter);
```

**See `backend-implementation/server.js` for complete example.**

---

## Step 5: Setup Database (2 minutes)

```bash
# On Lightsail
cd /home/ubuntu/kh-jobs-api
node scripts/setup-users.js
```

Expected output:
```
✅ Database setup complete!
Initial users:
  - arne / $yd3JAC9
  - raquel / elizabeth1
  - justin / Aryna2026
```

---

## Step 6: Test Backend (5 minutes)

```bash
# Test server starts
cd /home/ubuntu/kh-jobs-api
node server.js
```

Should see:
```
✅ Kelli Homes API Server running on port 3000
```

Press Ctrl+C.

```bash
# Restart with PM2
pm2 stop kh-jobs-api
pm2 start server.js --name kh-jobs-api
pm2 save

# Check status
pm2 status

# View logs
pm2 logs kh-jobs-api --lines 50
```

**Test login endpoint:**
```bash
curl -X POST https://api.jobs.kellihomes.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"arne","password":"$yd3JAC9"}' \
  -v
```

Should return user data and Set-Cookie headers.

---

## Step 7: Deploy Frontend (5 minutes)

```bash
# On your local machine
cd /Users/arg/development/jobs-kellihomes

# Check what will be committed
git status

# Should show:
# - auth.js (new)
# - utils/sanitize.js (new)
# - config.js (modified)
# - api.js (modified)
# - main.js (modified)
# - index.html (modified)
# - job.html (modified)
# - documents.html (modified)

# Commit changes
git add auth.js utils/sanitize.js config.js api.js main.js index.html job.html documents.html

git commit -m "Implement secure authentication with JWT tokens

- Add backend JWT authentication with httpOnly cookies
- Remove hardcoded credentials from frontend
- Add input sanitization on client and server
- Implement automatic token refresh
- Add logout functionality to all pages"

# Push to GitHub (triggers auto-deploy)
git push origin main
```

GitHub Pages will deploy in 1-2 minutes.

---

## Step 8: Verify Everything Works (10 minutes)

### Backend Verification
- [ ] `pm2 status` shows running
- [ ] `pm2 logs` shows no errors
- [ ] Login endpoint returns cookies

### Frontend Verification
1. **Open https://jobs.kellihomes.com**
2. **Should see login page**
3. **Login with:** arne / $yd3JAC9
4. **Should see dashboard**
5. **Check header shows:** "Signed in as arne"
6. **Click a job** - should load
7. **Create a job** - should work
8. **Upload a document** - should work
9. **Click Logout** - should return to login
10. **Refresh page** - should stay logged in (if within 7 days)

### Test All Users
- [ ] arne / $yd3JAC9
- [ ] raquel / elizabeth1
- [ ] justin / Aryna2026

---

## Troubleshooting

### "Authentication required" immediately
```bash
# Check backend logs
pm2 logs kh-jobs-api --lines 100

# Check CORS config includes credentials: true
```

### Login doesn't work
```bash
# Check users exist in database
ssh ubuntu@44.238.21.97
psql -h your-db-endpoint -U kh_admin -d kh_jobs -c "SELECT username FROM users;"

# If empty, run setup again
node scripts/setup-users.js
```

### API calls fail
```bash
# Verify PM2 is running
pm2 status

# Check recent logs
pm2 logs kh-jobs-api --lines 50
```

### Frontend shows old version
- Clear browser cache (Cmd+Shift+R)
- Check GitHub Pages deployed (GitHub repo → Settings → Pages)
- Wait 2-3 minutes for CDN cache

---

## Rollback (If Needed)

### Backend
```bash
ssh ubuntu@44.238.21.97
pm2 stop kh-jobs-api
cd /home/ubuntu
rm -rf kh-jobs-api
cp -r kh-jobs-api.backup.* kh-jobs-api
cd kh-jobs-api
pm2 start server.js --name kh-jobs-api
```

### Frontend
```bash
git revert HEAD
git push origin main
```

---

## Success! 🎉

If all tests pass, you're done! The system now has secure authentication.

**What changed for users:**
- Same username/password
- Need to log in again (one time)
- Can now logout
- Session lasts 7 days

**What changed under the hood:**
- JWT tokens in httpOnly cookies
- Server-side auth validation
- Input sanitization
- Rate limiting
- No more credentials in code

---

## Next Steps

1. **Monitor for 24 hours** - Check logs, collect user feedback
2. **Read full documentation** - See PHASE_1_SECURITY_COMPLETE.md
3. **Plan Phase 2** - Additional improvements (password reset, audit logs, etc.)

---

## Need Help?

- **Backend issues:** Check `pm2 logs kh-jobs-api`
- **Frontend issues:** Check browser console (F12)
- **Database issues:** Connect to PostgreSQL and verify users table
- **Full guides:** See DEPLOYMENT_GUIDE.md and FRONTEND_MIGRATION_GUIDE.md

**Total time:** ~45-60 minutes
**Downtime:** ~5-10 minutes

You've got this! 🚀
