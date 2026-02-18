/**
 * Kelli Homes Job Management API Server
 * WITH SECURE AUTHENTICATION
 *
 * This file shows how to integrate the new authentication into your existing server.
 * Your actual server.js on Lightsail will have additional routes for jobs, documents, etc.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Database
const { initializePool, testConnection, closePool } = require('./db');

// Middleware
const { authenticateToken } = require('./middleware/auth');
const { sanitizeInput } = require('./middleware/sanitize');

// Routes
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');
const lineItemsRoutes = require('./routes/lineItems');
const passwordRoutes = require('./routes/password');
const documentsRoutes = require('./routes/documents');
const businessDocumentsRoutes = require('./routes/businessDocuments');
const tasksRoutes = require('./routes/tasks');
const usersRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration - allow frontend to send cookies
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://jobs.kellihomes.com',
  credentials: true, // CRITICAL: Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing
app.use(cookieParser());

// Global rate limiting - DISABLED FOR TESTING
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => true // TEMP: Skip rate limiting entirely
});
app.use(limiter);

// Global input sanitization
app.use(sanitizeInput);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Initialize database pool
initializePool();
testConnection()
  .then(() => console.log('Database connection verified'))
  .catch((err) => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });

// PUBLIC ROUTES (no authentication required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication routes (public)
app.use('/auth', authRoutes);

// PROTECTED ROUTES (authentication required)
// All routes below this line require a valid JWT token

app.use('/jobs', authenticateToken, jobsRoutes);
app.use('/jobs/:jobId/line-items', authenticateToken, lineItemsRoutes);
app.use('/password', authenticateToken, passwordRoutes);
app.use('/documents', authenticateToken, documentsRoutes);
app.use('/business-documents', authenticateToken, businessDocumentsRoutes);
app.use('/tasks', authenticateToken, tasksRoutes);
app.use('/users', authenticateToken, usersRoutes);
app.use('/inventory', authenticateToken, inventoryRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Kelli Homes API Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});
