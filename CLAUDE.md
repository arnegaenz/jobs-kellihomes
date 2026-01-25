# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kelli Homes Job Management System - A web application for construction project tracking with job costing, document management, and authentication.

**Architecture:**
- **Frontend:** Vanilla JavaScript SPA served via GitHub Pages (https://jobs.kellihomes.com)
- **Backend:** Express.js REST API on AWS Lightsail (https://api.jobs.kellihomes.com)
- **Database:** PostgreSQL on AWS RDS
- **Storage:** AWS S3 for document uploads
- **Deployment:**
  - Frontend auto-deploys to GitHub Pages on push to main
  - Backend deployed via PM2 on Lightsail (manual deployment)

## Development Commands

### Backend Development

```bash
cd backend-implementation

# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Start production server
npm start

# Setup database users (creates initial user accounts)
npm run setup-db
```

### Testing & Verification

```bash
# Check backend health
curl https://api.jobs.kellihomes.com/health

# Check PM2 status on Lightsail
ssh ubuntu@44.238.21.97
pm2 status
pm2 logs kh-jobs-api --lines 50

# Test login endpoint
curl -X POST https://api.jobs.kellihomes.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"arne","password":"$yd3JAC9"}' \
  -v
```

### Database Operations

```bash
# SSH to Lightsail first
ssh ubuntu@44.238.21.97

# Connect to database
psql -h <db-endpoint> -U kh_admin -d kh_jobs

# Run migrations
cd /home/ubuntu/kh-jobs-api
psql -h <db-endpoint> -U kh_admin -d kh_jobs -f migrations/001_line_items_job_costing.sql

# Backup database
pg_dump -h <db-endpoint> -U kh_admin -d kh_jobs > backup_$(date +%Y%m%d).sql
```

### Deployment

**Frontend (automatic):**
```bash
git add .
git commit -m "Your commit message"
git push origin main
# GitHub Pages auto-deploys in ~2 minutes
```

**Backend (manual):**
```bash
# Use the deployment scripts
./backend-implementation/deploy-to-lightsail-local.sh  # Copies files from local
./backend-implementation/deploy-to-lightsail-server.sh # Runs on server after copy

# Or deploy manually
scp -r backend-implementation/* ubuntu@44.238.21.97:/home/ubuntu/kh-jobs-api/
ssh ubuntu@44.238.21.97
cd /home/ubuntu/kh-jobs-api
npm install
pm2 restart kh-jobs-api
```

## Architecture & Code Organization

### Frontend Structure

**Core files in root:**
- `index.html` - Dashboard with job list and filters
- `job.html` - Job detail page with three-tab layout (Summary/Details/Documents)
- `documents.html` - Document management page
- `change-password.html` - Password change interface
- `main.js` - Primary application logic (400+ lines)
- `api.js` - API client with retry, timeout, and deduplication
- `auth.js` - Authentication utilities (login, logout, token refresh)
- `config.js` - Configuration (API base URL)
- `styles.css` - All application styles

**Utilities:**
- `utils/sanitize.js` - Client-side input sanitization

### Backend Structure (`backend-implementation/`)

```
backend-implementation/
├── server.js              # Main Express server with security middleware
├── db.js                  # PostgreSQL connection pool
├── config.js              # Server configuration
├── logger.js              # Logging utilities
├── routes/
│   ├── auth.js            # POST /auth/login, /auth/logout, /auth/refresh
│   ├── jobs.js            # Full CRUD for jobs
│   ├── lineItems.js       # GET/PUT /jobs/:jobId/line-items
│   └── password.js        # Password change functionality
├── middleware/
│   ├── auth.js            # JWT token verification middleware
│   ├── sanitize.js        # Input sanitization middleware
│   └── errorHandler.js    # Centralized error handling
├── scripts/
│   └── setup-users.js     # Creates initial user accounts
└── migrations/
    ├── 001_line_items_job_costing.sql    # Budget tracking, schedule, notes
    ├── 002_job_notes_and_dates.sql       # Job-level notes and actual_completion
    └── 003_line_item_actual_dates.sql    # actualEndDate in schedule JSONB
```

### Database Schema

**jobs table:**
- Core fields: id, name, location, client, clientEmail, clientPhone
- Workflow: stage, type, status, health
- Dates: startDate, targetCompletion, actualCompletion
- Metadata: primaryContact, notes, createdAt, updatedAt

**line_items table:**
- Identification: job_id, code, name
- Costing: budget (NUMERIC), actual (NUMERIC), budget_history (JSONB)
- Tracking: schedule (JSONB), notes_text (TEXT), status, vendor

**users table:**
- Authentication: username, password_hash
- Metadata: created_at

**documents table:**
- Links to S3: s3_key, file_name, file_type, file_size
- Organization: job_id, type (Contract, Invoice, etc.)
- Soft delete: deleted_at
- Metadata: uploaded_at, uploaded_by

### Three-Tab Job Detail Page

The job detail page (`job.html`) uses a three-tab layout:

1. **Summary Tab** - High-level job overview and line items
   - Job health, timeline, and key metrics
   - Line items table with budget tracking
   - Add/remove line items functionality
   - Budget increase tracking with history

2. **Details Tab** - Editable form with all job fields
   - Client information
   - Dates and timeline
   - Stage, type, status
   - Job-level notes

3. **Documents Tab** - Document management
   - Upload documents with type categorization
   - Filter by document type
   - View/delete documents
   - S3 presigned URLs for file access

Tabs managed via `data-tab` attributes and JavaScript in `main.js`.

### Authentication Flow

**JWT-based authentication with httpOnly cookies:**
1. User submits credentials to POST /auth/login
2. Backend validates bcrypt password hash
3. Server returns accessToken (15m) and refreshToken (7d) as httpOnly cookies
4. Frontend includes credentials on all API calls
5. Middleware `authenticateToken` verifies JWT on protected routes
6. Access token expires → automatic refresh via /auth/refresh
7. Refresh token expires → redirect to login page

**Protected routes pattern:**
```javascript
app.use('/jobs', authenticateToken, jobsRoutes);
app.use('/documents', authenticateToken, documentsRoutes);
```

### Line Items & Job Costing System

**Key features:**
- Dynamic line item selection from 75+ predefined catalog items (defined in `main.js`)
- Original budget tracking with historical budget increase records
- Real-time variance calculations (currentBudget - actual)
- Schedule tracking with start/end dates and actualEndDate support
- Color-coded variance display (green = under budget, red = over budget)

**Data format in database:**
- `budget` column stores current total budget (NUMERIC)
- `budget_history` stores array of increases: `[{amount, date, reason}]` (JSONB)
- `schedule` stores dates: `{startDate, endDate, actualEndDate}` (JSONB)
- `actual` stores actual costs (NUMERIC)
- Frontend calculates variance and currentBudget from these fields

**API pattern:**
- GET /jobs/:jobId/line-items - Returns line items with calculated fields
- PUT /jobs/:jobId/line-items - Replaces all line items (DELETE + INSERT in transaction)

### API Client Features (`api.js`)

**Reliability:**
- Automatic retry with exponential backoff (3 attempts, 1s/2s/3s delays)
- 30-second timeout on all requests
- Automatic token refresh on 401 with TOKEN_EXPIRED code
- Network error detection and meaningful error messages

**Performance:**
- Request deduplication via in-flight cache (prevents duplicate GET requests)
- Credentials always included (`credentials: "include"`)

**All API functions:**
- Jobs: `fetchJobs()`, `fetchJobById(id)`, `createJob(data)`, `updateJob(id, data)`, `deleteJob(id)`
- Line Items: `fetchJobLineItems(jobId)`, `saveJobLineItems(jobId, items)`
- Documents: `fetchJobDocuments(jobId)`, `fetchDocuments()`, `requestDocumentUpload(jobId, file, type)`, `deleteDocument(id)`, `restoreDocument(id)`, `updateDocumentType(id, type)`

## Environment Variables

Backend requires `.env` file in `backend-implementation/`:

```env
# Database (PostgreSQL on RDS)
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=kh_jobs
DB_USER=kh_admin
DB_PASSWORD=<secure-password>

# AWS S3 for documents
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
S3_BUCKET=kh-jobs-documents-807940873467

# JWT secrets (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_ACCESS_SECRET=<256-bit-hex-secret>
JWT_REFRESH_SECRET=<different-256-bit-hex-secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Server config
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://jobs.kellihomes.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOGIN_RATE_LIMIT_MAX=5
```

See `backend-implementation/.env.example` for template.

## Security Implementation

**Backend security middleware stack (in order):**
1. `helmet()` - Security headers
2. `cors()` with `credentials: true` - CRITICAL for cookie auth
3. `express.json()` - Body parsing with 10mb limit
4. `cookieParser()` - Parse httpOnly cookies
5. `rateLimit()` - Global rate limiting
6. `sanitizeInput` - Strip HTML/SQL injection attempts

**Authentication middleware:**
- `authenticateToken` - Verify JWT from httpOnly cookie, attach req.user

**Input sanitization:**
- Backend: Strips `<script>`, SQL keywords, control characters
- Frontend: Uses `utils/sanitize.js` before sending data

## Key Design Patterns

### Error Handling
- Backend: Try-catch with centralized error handler, meaningful error messages
- Frontend: `handleError()` utility with network status awareness
- All async operations wrapped in try-catch

### Database Transactions
Used for multi-step operations:
- Line items save (DELETE + INSERT)
- Job deletion (cascade delete line_items)

### Modal System
Reusable modal pattern for:
- Adding line items from catalog
- Adding budget increases with reason tracking
- Built with `.kh-modal` CSS classes

### State Management
- No framework - direct DOM manipulation
- State stored in database, fetched on page load
- Forms populated from API responses
- Tab state managed via `data-tab` attributes and `.is-active` class

## Common Workflows

### Adding a New API Endpoint

1. Create route handler in `backend-implementation/routes/<resource>.js`
2. Import and mount in `server.js` with `authenticateToken` middleware if protected
3. Add corresponding function in frontend `api.js`
4. Call from `main.js` or other page scripts
5. Test with curl before frontend integration

### Adding a New Database Field

1. Create migration file in `backend-implementation/migrations/`
2. Run migration on Lightsail: `psql -U kh_admin -d kh_jobs -f migrations/<file>.sql`
3. Update backend route to SELECT/INSERT new field
4. Update frontend form HTML to include input
5. Update frontend data collection to include field
6. Test full round-trip (create → read → update)

### Debugging Failed API Calls

1. Check browser console for error messages
2. Check Network tab for response status/body
3. SSH to Lightsail and check PM2 logs: `pm2 logs kh-jobs-api`
4. Verify user is authenticated (check for httpOnly cookies in DevTools)
5. Test API endpoint directly with curl to isolate frontend vs backend issue

### Making Frontend Changes

1. Edit HTML/JS/CSS files in root directory
2. Test locally by opening HTML files in browser (limited - CORS will block API calls)
3. Commit and push to GitHub: `git push origin main`
4. Wait 2 minutes for GitHub Pages deployment
5. Test at https://jobs.kellihomes.com
6. Clear browser cache if changes don't appear (Cmd+Shift+R)

## Important Technical Constraints

- **No build process:** Frontend is vanilla JS/HTML/CSS, no bundler
- **ES6 modules:** Use `import/export` syntax in JS files
- **CORS requirements:** Backend must have `credentials: true` in CORS config
- **Cookie security:** All auth tokens in httpOnly cookies, never localStorage
- **S3 presigned URLs:** Documents accessed via temporary URLs, not direct S3 access
- **PM2 management:** Backend runs as PM2 process `kh-jobs-api`
- **Database migrations:** Manual execution via psql (no migration framework)

## User Accounts

Default users (created via `scripts/setup-users.js`):
- **arne** / `$yd3JAC9` (admin)
- **raquel** / `elizabeth1`
- **justin** / `Aryna2026`

Sessions last 7 days (refresh token expiry).

## Deployment Infrastructure

**Frontend:**
- Hosted on GitHub Pages
- Auto-deploys on push to main branch
- URL: https://jobs.kellihomes.com
- No environment variables needed

**Backend:**
- AWS Lightsail instance: 44.238.21.97
- Running on PM2: `pm2 list` shows `kh-jobs-api`
- Located at: `/home/ubuntu/kh-jobs-api/`
- Deployment scripts: `deploy-to-lightsail-local.sh` (copy files) + `deploy-to-lightsail-server.sh` (run on server)

**Database:**
- PostgreSQL on AWS RDS
- Schema managed via SQL migration files
- Run migrations manually after connecting via SSH

## Line Item Catalog

The system includes 75+ predefined construction line items organized by groups:
- 01.00 Site Work (demolition, excavation, utilities)
- 02.00 Foundation (footings, walls, drainage)
- 03.00 Structural (framing, trusses, lumber)
- And more...

Catalog defined in `main.js` as `LINE_ITEM_CATALOG` array. Each item has: code, group, name, description.

Users select items from catalog via modal, only adding relevant items to each job.

## Critical Implementation Details

### Budget Tracking System
- **originalBudget:** Initial budget set once
- **budgetHistory:** Array of increases with amount, date, reason
- **currentBudget:** Calculated as originalBudget + sum(budgetHistory)
- **actual:** Actual costs incurred
- **variance:** currentBudget - actual (positive = under budget, negative = over budget)

Backend stores `currentBudget` in the `budget` column. Frontend sends `originalBudget` and `budgetHistory`, backend calculates and stores total.

### Schedule Tracking
Stored in JSONB `schedule` column:
```json
{
  "startDate": "2026-01-15",
  "endDate": "2026-02-28",
  "actualEndDate": "2026-03-02"
}
```

### Security Considerations
- Never commit `.env` files (only `.env.example`)
- JWT secrets must be 256-bit random hex (generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- Passwords hashed with bcrypt (10 rounds)
- All inputs sanitized on both client and server
- Rate limiting applied globally and on login endpoint
- CORS restricted to FRONTEND_URL only

### Transaction Pattern for Data Integrity
Line items use DELETE + INSERT pattern wrapped in transaction:
```javascript
await client.query('BEGIN');
await client.query('DELETE FROM line_items WHERE job_id = $1', [jobId]);
// Insert new items
await client.query('COMMIT');
```

This ensures line items are always in sync with frontend state (no partial updates).

## Troubleshooting

**Authentication issues:**
- Check `credentials: true` in CORS config
- Verify JWT secrets are set in `.env`
- Check httpOnly cookies in browser DevTools
- Check PM2 logs for JWT verification errors

**Line items not saving:**
- Verify migration 001 ran successfully
- Check columns are NUMERIC not TEXT: `\d line_items`
- Ensure budgetHistory and schedule are valid JSON
- Check PM2 logs for JSON parsing errors

**Documents not uploading:**
- Verify S3 bucket permissions
- Check AWS credentials in `.env`
- Ensure file size under 10mb (Express body limit)
- Check S3 bucket name matches: `kh-jobs-documents-807940873467`

**Frontend shows old version:**
- Clear browser cache (Cmd+Shift+R)
- Check GitHub Pages deployment status (repo → Settings → Pages)
- Wait 2-3 minutes for CDN cache to clear

**PM2 issues:**
- Check process status: `pm2 status`
- View logs: `pm2 logs kh-jobs-api`
- Restart process: `pm2 restart kh-jobs-api`
- Save PM2 config: `pm2 save`
