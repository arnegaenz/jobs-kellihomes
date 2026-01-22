/**
 * Client-side input sanitization to prevent XSS attacks
 */

/**
 * Strips HTML tags and dangerous characters from string input
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  return str
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>]/g, ''); // Remove < and > characters
}

/**
 * Recursively sanitizes all string values in an object
 */
export function sanitizeObject(obj) {
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
