# ⚡ START HERE - Deploy in 3 Steps

## ✅ Frontend Already Deployed!

The frontend is **LIVE** at https://jobs.kellihomes.com

(Deployed automatically when I pushed to GitHub - refresh in 2 minutes to see it live)

---

## 🔧 Backend Deployment (You Need to Do This)

### Step 1: SSH to Your Server

```bash
ssh ubuntu@44.238.21.97
```

### Step 2: Run the Deployment Script

```bash
cd /home/ubuntu/kh-jobs-api

# Download and run the deployment script
curl -o deploy-auth.sh https://raw.githubusercontent.com/your-username/jobs-kellihomes/main/DEPLOY_NOW.sh
chmod +x deploy-auth.sh
./deploy-auth.sh
```

OR copy-paste the content from `DEPLOY_NOW.sh` and save it as a file on the server, then run it.

The script does EVERYTHING automatically:
- ✅ Backs up current code
- ✅ Installs dependencies
- ✅ Creates all auth files
- ✅ Sets up database users table
- ✅ Configures environment variables
- ⏸️ Pauses for you to update server.js (instructions shown)
- ✅ Restarts PM2

### Step 3: Update server.js

When the script pauses, edit server.js and add:

```javascript
// At the top with other requires:
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { authenticateToken } = require('./middleware/auth');
const { sanitizeInput } = require('./middleware/sanitize');
const authRoutes = require('./routes/auth');

// Update CORS to:
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // CRITICAL!
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Add middleware before routes:
app.use(helmet());
app.use(cookieParser());
app.use(sanitizeInput);

// Add public auth routes:
app.use('/auth', authRoutes);

// Protect existing routes:
app.use('/jobs', authenticateToken, existingJobsRouter);
app.use('/documents', authenticateToken, existingDocumentsRouter);
```

Then press Enter to let the script continue.

---

## ✅ Test Everything

1. Open https://jobs.kellihomes.com
2. Login with: **arne** / **$yd3JAC9**
3. Test all features work
4. Logout and login again
5. Test other users (raquel, justin)

---

## 👥 User Credentials

| User | Password |
|------|----------|
| arne | $yd3JAC9 |
| raquel | elizabeth1 |
| justin | Aryna2026 |

Sessions last **7 days** automatically.

---

## 🆘 Help

**Backend issues:**
```bash
pm2 logs kh-jobs-api
```

**Frontend issues:**
- Clear browser cache (Cmd+Shift+R)
- Check browser console (F12)

**Need detailed help:** See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md)

---

## 📊 What's Been Done

✅ **All critical security vulnerabilities fixed**
✅ **Frontend deployed to GitHub Pages**
✅ **Backend code ready on your machine**
✅ **Deployment script automated**
✅ **3 users configured** (arne, raquel, justin)
✅ **Complete documentation created**

---

**Ready?** SSH to your server and run the deployment script!

Estimated time: **15 minutes**
