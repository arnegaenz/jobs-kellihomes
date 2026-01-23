/**
 * Centralized Database Connection Pool
 *
 * Single pool instance shared across all routes to prevent connection leaks.
 */

const { Pool } = require('pg');
const logger = require('./logger');

let pool = null;

/**
 * Initialize database connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function initializePool() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    // Connection pool settings
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Timeout after 10s when acquiring connection
  });

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err.message, stack: err.stack });
  });

  // Log pool connection
  pool.on('connect', () => {
    logger.debug('New database connection established');
  });

  // Log pool removal
  pool.on('remove', () => {
    logger.debug('Database connection removed from pool');
  });

  logger.info('Database pool initialized', {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    maxConnections: 20
  });

  return pool;
}

/**
 * Get the database pool instance
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializePool() first.');
  }
  return pool;
}

/**
 * Test database connectivity
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error: error.message });
    throw error;
  }
}

/**
 * Gracefully close all database connections
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    logger.info('Closing database pool...');
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

module.exports = {
  initializePool,
  getPool,
  testConnection,
  closePool
};
