/**
 * Centralized Error Handling Middleware
 *
 * Provides consistent error responses and logging across the application.
 */

const logger = require('../logger');

/**
 * Custom Error Classes
 */

class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * Error Handler Middleware
 *
 * Catches all errors and sends consistent responses
 */
function errorHandler(err, req, res, next) {
  // Default to 500 server error
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  }

  // Handle PostgreSQL errors
  if (err.code && err.code.startsWith('23')) {
    statusCode = 409;
    code = 'DATABASE_CONSTRAINT_ERROR';

    if (err.code === '23505') {
      message = 'Record already exists';
      code = 'DUPLICATE_ENTRY';
    } else if (err.code === '23503') {
      message = 'Referenced record not found';
      code = 'FOREIGN_KEY_VIOLATION';
    }
  }

  // Log error (don't log 4xx as errors, they're client mistakes)
  if (statusCode >= 500) {
    logger.error('Server error', {
      message: err.message,
      code,
      statusCode,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  } else {
    logger.warn('Client error', {
      message,
      code,
      statusCode,
      path: req.path,
      method: req.method
    });
  }

  // Send error response
  res.status(statusCode).json({
    error: message,
    code,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404 Not Found Handler
 *
 * Catches requests to undefined routes
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError('Route');
  error.message = `Route ${req.method} ${req.path} not found`;
  next(error);
}

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,

  // Middleware
  errorHandler,
  notFoundHandler
};
