# Authentication Architecture for Kelli Homes Job Management

## Overview
This document describes the secure authentication implementation to replace the current client-side only authentication with credentials exposed in source code.

## Security Goals
1. Remove hardcoded credentials from frontend
2. Implement server-side authentication validation
3. Protect all API routes with authentication middleware
4. Use industry-standard JWT tokens with refresh tokens
5. Store tokens securely in httpOnly cookies
6. Add input sanitization to prevent injection attacks

## Architecture

### Current (INSECURE)
```
Browser → Check hardcoded credentials in JS → Store username in localStorage → Call API (no auth)
```

### New (SECURE)
```
Browser → POST /auth/login → Backend validates → Returns JWT in httpOnly cookie → All API calls include cookie → Backend validates JWT
```

## Components

### 1. User Storage
- Users stored in PostgreSQL `users` table (not in frontend code)
- Passwords hashed with bcrypt (minimum 12 rounds)
- Schema:
  ```sql
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
  );
  ```

### 2. JWT Tokens
- **Access Token**: Short-lived (15 minutes), used for API calls
- **Refresh Token**: Long-lived (7 days), used to get new access tokens
- Both stored in httpOnly cookies (cannot be accessed by JavaScript)
- Signed with secret key stored in environment variables

### 3. Authentication Endpoints
- `POST /auth/login` - Authenticate user, return tokens
- `POST /auth/logout` - Clear tokens
- `POST /auth/refresh` - Get new access token using refresh token
- `GET /auth/me` - Get current user info

### 4. Protected Routes
All existing API routes will require authentication:
- `/jobs/*`
- `/documents/*`
- `/line-items/*`

### 5. Middleware
- `authenticateToken` - Validates JWT on every protected route
- `sanitizeInput` - Cleans user input to prevent injection

## Security Features

### Password Security
- Passwords hashed with bcrypt (cost factor 12)
- Never stored or logged in plain text
- Password requirements: min 8 characters, mix of letters/numbers

### Token Security
- JWTs stored in httpOnly cookies (XSS protection)
- SameSite=Strict (CSRF protection)
- Secure flag in production (HTTPS only)
- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Tokens include user ID and username only

### Input Sanitization
- All user input trimmed and validated
- HTML/script tags stripped
- SQL injection prevention via parameterized queries
- Max length limits on all fields

### Rate Limiting
- Login endpoint: 5 attempts per 15 minutes per IP
- All endpoints: 100 requests per 15 minutes per user

## Migration Plan

### Initial Setup
1. Create `users` table in database
2. Hash existing user passwords and insert into table
3. Generate strong JWT secret key
4. Update `.env` with new secrets

### Deployment
1. Deploy backend changes to Lightsail
2. Test authentication endpoints
3. Deploy frontend changes to GitHub Pages
4. Verify login flow works
5. Monitor for issues

### User Impact
- Users will need to log in again (localStorage cleared)
- Login credentials remain the same (username/password)
- Session stays active for 7 days unless they log out

## Environment Variables

Add to `/home/ubuntu/kh-jobs-api/.env`:
```
JWT_ACCESS_SECRET=<generated-secret-256-bits>
JWT_REFRESH_SECRET=<generated-secret-256-bits>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NODE_ENV=production
FRONTEND_URL=https://jobs.kellihomes.com
```

## Testing Checklist

- [ ] Login with valid credentials succeeds
- [ ] Login with invalid credentials fails
- [ ] Access token expires after 15 minutes
- [ ] Refresh token works to get new access token
- [ ] Protected routes return 401 without token
- [ ] Logout clears tokens
- [ ] httpOnly cookies cannot be accessed via JavaScript
- [ ] Rate limiting works
- [ ] Input sanitization prevents XSS
- [ ] SQL injection attempts blocked

## Rollback Plan

If issues arise:
1. Redeploy previous backend version
2. Redeploy previous frontend version
3. Users can still access with localStorage credentials
4. Investigate and fix issues
5. Retry deployment

## Support

For questions or issues:
- Check logs: `pm2 logs kh-jobs-api`
- Check database: Connect to PostgreSQL and query `users` table
- Test endpoints: Use Postman or curl with credentials
