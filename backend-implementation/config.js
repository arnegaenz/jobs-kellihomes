/**
 * Environment Configuration and Validation
 *
 * Validates all required environment variables at startup.
 * Fails fast if critical configuration is missing.
 */

require('dotenv').config();

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET'
];

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_ENV_VARS = {
  NODE_ENV: 'development',
  PORT: '3000',
  FRONTEND_URL: 'http://localhost:5500',
  JWT_ACCESS_EXPIRY: '15m',
  JWT_REFRESH_EXPIRY: '7d',
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  LOGIN_RATE_LIMIT_MAX: '5'
};

/**
 * Validate that all required environment variables are set
 * @throws {Error} If any required variable is missing
 */
function validateEnvironment() {
  const missing = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  - ${missing.join('\n  - ')}\n\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }

  // Set defaults for optional variables
  for (const [varName, defaultValue] of Object.entries(OPTIONAL_ENV_VARS)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
    }
  }
}

/**
 * Get validated configuration object
 * @returns {Object} Configuration object
 */
function getConfig() {
  return {
    // Server
    nodeEnv: process.env.NODE_ENV,
    port: parseInt(process.env.PORT, 10),
    frontendUrl: process.env.FRONTEND_URL,

    // Database
    database: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    },

    // JWT
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      accessExpiry: process.env.JWT_ACCESS_EXPIRY,
      refreshExpiry: process.env.JWT_REFRESH_EXPIRY
    },

    // AWS (optional)
    aws: {
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3Bucket: process.env.S3_BUCKET
    },

    // Rate Limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
      loginMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10)
    }
  };
}

module.exports = {
  validateEnvironment,
  getConfig
};
