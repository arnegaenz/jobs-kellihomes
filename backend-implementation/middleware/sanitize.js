/**
 * Sanitization middleware to prevent XSS and injection attacks
 */

/**
 * Strips HTML tags and trims whitespace from string input
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  return str
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>]/g, ''); // Remove < and > characters
}

/**
 * Recursively sanitizes all string values in an object
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}

/**
 * Middleware to sanitize request body
 */
function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
}

/**
 * Validates that required fields are present
 */
function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];

    for (const field of fields) {
      if (!req.body[field] || (typeof req.body[field] === 'string' && !req.body[field].trim())) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missing
      });
    }

    next();
  };
}

/**
 * Validates email format
 */
function isValidEmail(email) {
  if (!email) return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates phone format (digits, spaces, +, (), -, .)
 */
function isValidPhone(phone) {
  if (!phone) return true; // Optional field
  const phoneRegex = /^[0-9+().\-\s]*$/;
  const digits = phone.replace(/\D/g, '');
  return phoneRegex.test(phone) && digits.length >= 7;
}

/**
 * Middleware to validate job data
 */
function validateJobData(req, res, next) {
  const { clientEmail, clientPhone } = req.body;

  if (clientEmail && !isValidEmail(clientEmail)) {
    return res.status(400).json({
      error: 'Invalid email format',
      field: 'clientEmail'
    });
  }

  if (clientPhone && !isValidPhone(clientPhone)) {
    return res.status(400).json({
      error: 'Invalid phone format. Must contain at least 7 digits.',
      field: 'clientPhone'
    });
  }

  next();
}

module.exports = {
  sanitizeInput,
  sanitizeString,
  sanitizeObject,
  validateRequired,
  validateJobData,
  isValidEmail,
  isValidPhone
};
