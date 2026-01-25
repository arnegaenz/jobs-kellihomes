# Deployment: Remove Status and Health Fields + Mapbox Autocomplete

**Date:** 2026-01-25
**Changes:** Remove redundant Status and Health fields, add Mapbox address verification

## Summary of Changes

### What Was Removed
- **Status field** - Redundant with Stage (both tracked workflow progress)
- **Health field** - Can be calculated from line items (budget variance + schedule delays)

### What Was Added
- **Mapbox address autocomplete** - Address verification and autocomplete dropdown
- Powered by Mapbox Geocoding API (100k requests/month free tier)

## Frontend Changes (Auto-Deployed)

✅ **Already deployed to GitHub Pages** (commit 93ed784)

**Files modified:**
- [config.js](config.js) - Added Mapbox API token
- [index.html](index.html) - Removed Status/Health from create form, added address autocomplete
- [job.html](job.html) - Removed Status/Health from edit form, added address autocomplete
- [main.js](main.js) - Removed Status/Health rendering, added Mapbox autocomplete logic
- [styles.css](styles.css) - Added address suggestions dropdown styling

**Impact:**
- Dashboard table: 7 columns → 6 columns (removed Health)
- Create job form: 12 fields → 9 fields (removed Status and Health)
- Edit job form: 13 fields → 10 fields (removed Status and Health)
- Address field now has autocomplete dropdown with US addresses

## Backend Changes (Manual Deployment Required)

### Step 1: Backup Database

```bash
ssh ubuntu@44.238.21.97
cd /home/ubuntu/kh-jobs-api

# Backup current database
pg_dump -h <db-endpoint> -U kh_admin -d kh_jobs > backup_remove_status_health_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Migration

```bash
# Still on Lightsail server
psql -h <db-endpoint> -U kh_admin -d kh_jobs -f migrations/004_remove_status_and_health.sql
```

**Migration SQL:**
```sql
ALTER TABLE jobs
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS health;
```

### Step 3: Deploy Backend Code

```bash
# From local machine
cd /Users/arg/development/jobs-kellihomes
./backend-implementation/deploy-to-lightsail-local.sh
```

**Or manually:**
```bash
# Copy updated routes
scp backend-implementation/routes/jobs.js ubuntu@44.238.21.97:/home/ubuntu/kh-jobs-api/routes/

# SSH and restart
ssh ubuntu@44.238.21.97
cd /home/ubuntu/kh-jobs-api
pm2 restart kh-jobs-api
```

### Step 4: Verify Backend

```bash
# Check PM2 logs
pm2 logs kh-jobs-api --lines 50

# Test health endpoint
curl https://api.jobs.kellihomes.com/health

# Test jobs endpoint (should not return status or health fields)
curl https://api.jobs.kellihomes.com/jobs \
  -H "Cookie: accessToken=<your-token>" \
  -s | jq '.[0]' | grep -E "(status|health)"
# Should return nothing (fields removed)
```

## Testing Checklist

After deployment, test the following:

### Dashboard
- [ ] Dashboard loads without errors
- [ ] Jobs table shows 6 columns (not 7)
- [ ] Click "Create New Job" button
- [ ] Create job form shows 9 fields (no Status, no Health)
- [ ] Type address in "Job address" field
- [ ] Autocomplete dropdown appears after 3 characters
- [ ] Select address from dropdown - field populates correctly
- [ ] Submit form - job creates successfully

### Job Detail Page
- [ ] Open any existing job
- [ ] Summary tab shows job overview (no health field)
- [ ] Click "Edit" button
- [ ] Edit form shows 10 fields (no Status, no Health)
- [ ] Address field has autocomplete working
- [ ] Save changes - job updates successfully

### API Testing
- [ ] GET /jobs - Returns jobs without status or health fields
- [ ] POST /jobs - Creates job without requiring status or health
- [ ] PUT /jobs/:id - Updates job without status or health

## Rollback Plan

If issues occur:

### Rollback Frontend
```bash
git revert 93ed784
git push origin main
# Wait 2 minutes for GitHub Pages to redeploy
```

### Rollback Backend
```bash
# Restore database backup
ssh ubuntu@44.238.21.97
cd /home/ubuntu/kh-jobs-api
psql -h <db-endpoint> -U kh_admin -d kh_jobs < backup_remove_status_health_<timestamp>.sql

# Revert code changes (copy old version from git history)
git show HEAD~1:backend-implementation/routes/jobs.js > routes/jobs.js
pm2 restart kh-jobs-api
```

## Data Migration Notes

### Existing Jobs
- **No data loss** - Status and Health columns simply dropped
- Existing jobs will continue to work normally
- Stage field preserves all workflow information

### New Jobs
- Frontend no longer sends status or health
- Backend no longer expects or stores these fields
- Default values removed from INSERT statements

### API Compatibility
- **Breaking change** - Status and Health no longer returned in API responses
- Frontend already updated to not expect these fields
- No external API consumers to worry about

## Mapbox Configuration

### API Token
- **Token:** pk.eyJ1Ijoia2VsbGlob21lcyIsImEiOiJjbWt1OWV2Z3kxeTdyM2dxODM5MW5xMmttIn0.UZVFite5tNNwrIOXJgBcYQ
- **Account:** kellihomes
- **Free tier:** 100,000 requests/month
- **Current usage:** ~0-10 requests/month (very low volume)

### Geocoding API
- **Endpoint:** `https://api.mapbox.com/geocoding/v5/mapbox.places/`
- **Search scope:** US addresses only (`country=US`)
- **Result type:** `address` (not POIs or regions)
- **Limit:** 5 suggestions per search

### Autocomplete Behavior
- Activates after 3 characters typed
- Debounced 300ms to reduce API calls
- Keyboard navigation (arrows, Enter, Escape)
- Click outside to close dropdown

## Benefits

### Simplified Data Model
- Removed 2 redundant fields (Status, Health)
- Stage field is sufficient for workflow tracking
- Cleaner forms with fewer fields to maintain

### Better Address Data
- Standardized address formatting
- Validation via Mapbox geocoding
- Reduces typos and inconsistent formatting
- Autocomplete improves UX

### Reduced Maintenance
- Fewer fields to validate
- Less manual data entry (Status/Health)
- Potential for auto-calculating health in future from line items

## Future Enhancements

### Auto-Calculate Health (Optional)
Could bring back Health as a calculated field based on:
- Budget variance from line items (over/under budget)
- Schedule delays (actual vs target dates)
- Color-coded indicator (green/yellow/red)
- Read-only display, not manually entered

Example calculation:
```javascript
function calculateJobHealth(lineItems, targetCompletion) {
  const budgetVariance = calculateTotalVariance(lineItems);
  const scheduleDelay = calculateScheduleDelay(targetCompletion);

  if (budgetVariance < -10% || scheduleDelay > 7 days) return 'At Risk';
  if (budgetVariance < 0 || scheduleDelay > 2 days) return 'Watch';
  return 'On Track';
}
```

## Contact

**Deployment performed by:** [Your name]
**Questions/Issues:** Check PM2 logs or GitHub Issues

---

**Status:** Ready for backend deployment ⏳
**Frontend:** Deployed ✅
**Backend:** Pending ⏳
**Migration:** Pending ⏳
