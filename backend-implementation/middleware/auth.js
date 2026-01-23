const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate JWT access tokens from httpOnly cookies
 */
function authenticateToken(req, res, next) {
  const accessToken = req.cookies.accessToken;

  if (!accessToken) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(403).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
}

/**
 * Middleware to validate refresh tokens
 */
function authenticateRefreshToken(req, res, next) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      error: 'Refresh token required',
      code: 'NO_REFRESH_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
}

module.exports = {
  authenticateToken,
  authenticateRefreshToken
};
