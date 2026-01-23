# Server.js Upgrade Instructions

This document shows the changes needed to integrate Phase 2 improvements into server.js.

## Changes Required

### 1. Add New Requires at Top

Replace this section:
```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
```

With:
```javascript
const path = require('path');

// Phase 2: Config validation
const { validateEnvironment, getConfig } = require('./config');
validateEnvironment(); // Validate env vars before anything else
const config = getConfig();

// Phase 2: Database and logging
const { initializePool, testConnection, closePool } = require('./db');
const logger = require('./logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
```

### 2. Initialize Database Pool (After middleware setup, before routes)

Add after all `app.use()` middleware and before route definitions:
```javascript
// Initialize database pool
initializePool();

// Test database connection on startup
testConnection()
  .then(() => logger.info('Database connection verified'))
  .catch((err) => {
    logger.error('Failed to connect to database', { error: err.message });
    process.exit(1);
  });
```

### 3. Update Route Requires

Replace:
```javascript
const authRoutes = require('./routes/auth');
const passwordRoutes = require('./routes/password');
```

With:
```javascript
// Use updated routes with new error handling
const authRoutes = require('./routes/auth-updated');
const passwordRoutes = require('./routes/password-updated');
```

### 4. Add Request Logging Middleware

Replace the simple logging middleware:
```javascript
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});
```

With:
```javascript
// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });

  next();
});
```

### 5. Add Error Handling Middleware (At the very end, after all routes)

Add before `app.listen()`:
```javascript
// 404 handler - must be after all other routes
app.use(notFoundHandler);

// Error handler - must be last
app.use(errorHandler);
```

### 6. Update Graceful Shutdown

Replace:
```javascript
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Closing server gracefully...');
  process.exit(0);
});
```

With:
```javascript
// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  try {
    // Close database pool
    await closePool();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 7. Update app.listen() callback

Replace:
```javascript
app.listen(PORT, () => {
  console.log(`✅ KH Jobs API listening on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL}`);
});
```

With:
```javascript
app.listen(config.port, () => {
  logger.info('Server started', {
    port: config.port,
    environment: config.nodeEnv,
    frontendUrl: config.frontendUrl
  });
  console.log(`✅ KH Jobs API listening on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});
```

## Files to Copy to Server

1. `config.js` - Environment validation
2. `db.js` - Centralized database pool
3. `logger.js` - Structured logging
4. `middleware/errorHandler.js` - Error handling
5. `routes/auth-updated.js` - Updated auth route
6. `routes/password-updated.js` - Updated password route

## Deployment Steps

1. Copy all new files to server
2. Rename `routes/auth.js` to `routes/auth-old.js` (backup)
3. Rename `routes/password.js` to `routes/password-old.js` (backup)
4. Rename `routes/auth-updated.js` to `routes/auth.js`
5. Rename `routes/password-updated.js` to `routes/password.js`
6. Update server.js with changes above
7. Restart PM2
8. Test login functionality

