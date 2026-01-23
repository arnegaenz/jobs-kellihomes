/**
 * Structured Logging Module
 *
 * Provides consistent logging across the application with levels,
 * timestamps, and structured data.
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Format log message with timestamp and level
 */
function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...meta
  };

  return JSON.stringify(logEntry);
}

/**
 * Check if log level should be output
 */
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
}

/**
 * Log debug message
 */
function debug(message, meta) {
  if (shouldLog('debug')) {
    console.log(formatLog('debug', message, meta));
  }
}

/**
 * Log info message
 */
function info(message, meta) {
  if (shouldLog('info')) {
    console.log(formatLog('info', message, meta));
  }
}

/**
 * Log warning message
 */
function warn(message, meta) {
  if (shouldLog('warn')) {
    console.warn(formatLog('warn', message, meta));
  }
}

/**
 * Log error message
 */
function error(message, meta) {
  if (shouldLog('error')) {
    console.error(formatLog('error', message, meta));
  }
}

/**
 * Log HTTP request
 */
function logRequest(req, res, duration) {
  info('HTTP Request', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    userAgent: req.get('user-agent'),
    ip: req.ip
  });
}

module.exports = {
  debug,
  info,
  warn,
  error,
  logRequest
};
