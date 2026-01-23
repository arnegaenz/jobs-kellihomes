# 🚀 Deployment Checklist - Phase 1 Security

## Status

✅ **Frontend:** Deployed to GitHub Pages (committed & pushed)
⏳ **Backend:** Ready to deploy (awaiting your server access)

---

## What's Already Done

✅ JWT secrets generated
✅ All backend code created
✅ All frontend code created and deployed
✅ Git committed and pushed to GitHub
✅ Documentation complete

---

## What You Need to Do Now

### Step 1: Deploy Backend (15 minutes)

**SSH into your Lightsail server:**
```bash
ssh ubuntu@44.238.21.97
```

**Then run this ONE command:**
```bash
curl -o deploy.sh https://raw.githubusercontent.com/arnegaenz/jobs-kellihomes/main/DEPLOY_NOW.sh && chmod +x deploy.sh && ./deploy.sh
```

OR manually copy the DEPLOY_NOW.sh script content and run it.

The script will:
1. ✅ Backup current code
2. ✅ Install new dependencies
3. ✅ Create all auth files
4. ✅ Setup users database table
5. ✅ Update .env with JWT secrets
6. ⏸️  Pause for you to update server.js
7. ✅ Restart PM2

### Step 2: Update server.js (5 minutes)

When the script pauses, you need to edit `/home/ubuntu/kh-jobs-api/server.js`:

**Find your existing server.js and add these sections:**

#### At the top (with other requires):
```javascript
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { authenticateToken } = require('./middleware/auth');
const { sanitizeInput } = require('./middleware/sanitize');
const authRoutes = require('./routes/auth');
```

#### Update CORS configuration:
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://jobs.kellihomes.com',
  credentials: true, // CRITICAL!
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
```

#### Add middleware (after body parsing, before routes):
```javascript
app.use(helmet());
app.use(cookieParser());
app.use(sanitizeInput);
```

#### Add auth routes (before your existing routes):
```javascript
// Public routes
app.use('/auth', authRoutes);
```

#### Protect existing routes:
```javascript
// Protected routes - add authenticateToken middleware
app.use('/jobs', authenticateToken, jobsRouter);
app.use('/documents', authenticateToken, documentsRouter);
// ... repeat for all existing routes
```

**Then press Enter in the deployment script to continue.**

### Step 3: Verify Everything Works (5 minutes)

#### Test Backend:
```bash
# Check PM2 is running
pm2 status

# View logs
pm2 logs kh-jobs-api --lines 50

# Test login endpoint
curl -X POST https://api.jobs.kellihomes.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"arne","password":"$yd3JAC9"}' \
  -c cookies.txt -v
```

Should see `Set-Cookie` headers and user data response.

#### Test Frontend:
1. Open https://jobs.kellihomes.com
2. Should see login page
3. Login with: **arne** / **$yd3JAC9**
4. Should see dashboard
5. Check "Signed in as arne" in header
6. Click a job - should work
7. Create/edit job - should work
8. Upload document - should work
9. Click "Logout" - should return to login
10. Refresh page - should stay logged in

#### Test All Users:
- [ ] arne / $yd3JAC9
- [ ] raquel / elizabeth1
- [ ] justin / Aryna2026

---

## User Credentials (For Your Reference)

All users keep their existing passwords:

| Username | Password | Email |
|----------|----------|-------|
| arne | $yd3JAC9 | arne@kellihomes.com |
| raquel | elizabeth1 | raquel@kellihomes.com |
| justin | Aryna2026 | justin@kellihomes.com |

**Sessions last 7 days** - users stay logged in across browser sessions.

---

## What Changed for Users

✅ **Same login credentials** (username/password unchanged)
✅ **Same UI and functionality**
✅ **Better security** (invisible to users)
⚠️ **One-time login required** after deployment
✅ **New logout button** in header
✅ **Sessions last 7 days** (vs forever before)

---

## Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs kh-jobs-api --lines 100

# Common issues:
# - Missing .env values
# - Syntax error in server.js
# - Missing dependencies
```

### Login doesn't work
```bash
# Check users table exists
ssh ubuntu@44.238.21.97
cd /home/ubuntu/kh-jobs-api
node -e "require('dotenv').config(); const {Pool} = require('pg'); const pool = new Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: {rejectUnauthorized: false}}); pool.query('SELECT username FROM users', (err, res) => {console.log(err || res.rows); pool.end();});"

# If empty, run setup again:
node scripts/setup-users.js
```

### Frontend shows "Authentication required"
- Verify backend is running: `pm2 status`
- Check CORS includes `credentials: true`
- Clear browser cache (Cmd+Shift+R)

### API calls fail with 401
- Check cookies in browser DevTools
- Verify tokens are being set
- Check backend logs for errors

---

## Rollback (If Needed)

### Backend:
```bash
ssh ubuntu@44.238.21.97
pm2 stop kh-jobs-api
cd /home/ubuntu
rm -rf kh-jobs-api
cp -r kh-jobs-api.backup.* kh-jobs-api
cd kh-jobs-api
pm2 start server.js --name kh-jobs-api
```

### Frontend:
```bash
cd /Users/arg/development/jobs-kellihomes
git revert HEAD
git push origin main
```

---

## Files Location Summary

### On Your Local Machine:
- `/Users/arg/development/jobs-kellihomes/` - Git repository
- `DEPLOY_NOW.sh` - Server deployment script
- `backend-implementation/` - All backend code
- `PHASE_1_SECURITY_COMPLETE.md` - Full documentation

### On Lightsail Server:
- `/home/ubuntu/kh-jobs-api/` - API server directory
- `/home/ubuntu/kh-jobs-api.backup.*` - Backup created by script
- Routes: `routes/auth.js`
- Middleware: `middleware/auth.js`, `middleware/sanitize.js`
- Scripts: `scripts/setup-users.js`

### On GitHub Pages:
- https://jobs.kellihomes.com - Live frontend
- Deployed automatically from `main` branch

---

## Quick Commands Reference

```bash
# SSH to server
ssh ubuntu@44.238.21.97

# Check PM2 status
pm2 status

# View logs
pm2 logs kh-jobs-api

# Restart PM2
pm2 restart kh-jobs-api

# Test login
curl -X POST https://api.jobs.kellihomes.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"arne","password":"$yd3JAC9"}' -v
```

---

## Support

### If you get stuck:

1. **Check PM2 logs first:** `pm2 logs kh-jobs-api --lines 100`
2. **Verify users exist:** See "Login doesn't work" above
3. **Check server.js syntax:** Look for missing commas, brackets
4. **Review deployment script output:** Any error messages?

### Everything working?

✅ Phase 1 Security is **COMPLETE**!
✅ All critical vulnerabilities **FIXED**!
✅ System is now **PRODUCTION READY**!

---

## Next Steps After Deployment

1. **Monitor for 24 hours** - Check logs, user feedback
2. **Notify users** - "Please log in again after our security update"
3. **Test all features** - Create jobs, upload docs, save line items
4. **Plan Phase 2** - Additional improvements (see PHASE_1_SECURITY_COMPLETE.md)

---

**Total deployment time:** ~25 minutes
**Downtime:** ~5-10 minutes

You're ready to deploy! 🚀

Start with: `ssh ubuntu@44.238.21.97`
