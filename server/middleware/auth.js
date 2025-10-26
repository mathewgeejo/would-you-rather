const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  try {
    // 1) Check if token exists
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'You are not logged in. Please log in to access this resource.'
      });
    }
    
    // 2) Verify token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id).select('+password');
    if (!currentUser) {
      return res.status(401).json({
        status: 'fail',
        message: 'The user belonging to this token no longer exists.'
      });
    }
    
    // 4) Check if user is active
    if (!currentUser.isActive) {
      return res.status(401).json({
        status: 'fail',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }
    
    // 5) Check if account is locked
    if (currentUser.isLocked) {
      return res.status(423).json({
        status: 'fail',
        message: 'Account is temporarily locked due to multiple failed login attempts.'
      });
    }
    
    // Grant access to protected route
    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid token. Please log in again.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Your token has expired. Please log in again.'
      });
    }
    
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong during authentication.'
    });
  }
};

// Restrict access to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action.'
      });
    }
    next();
  };
};

// Verify email token
const verifyEmailToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email verification token is required.'
      });
    }
    
    // Find user with this verification token
    const user = await User.findOne({
      verificationToken: token,
      isVerified: false
    });
    
    if (!user) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or expired verification token.'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong during email verification.'
    });
  }
};

// Optional authentication (user might or might not be logged in)
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (token) {
      try {
        const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);
        
        if (currentUser && currentUser.isActive && !currentUser.isLocked) {
          req.user = currentUser;
        }
      } catch (error) {
        // Invalid token, but continue without user
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

// Rate limiting for authentication routes
const authRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    status: 'fail',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for password reset confirmations
    return req.path.includes('/reset-password/');
  }
});

// Check if user owns resource
const checkOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    const resourceUserId = req.body[resourceField] || req.params[resourceField];
    
    if (!resourceUserId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Resource ownership cannot be determined.'
      });
    }
    
    if (req.user._id.toString() !== resourceUserId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'You can only access your own resources.'
      });
    }
    
    next();
  };
};

// Verify account ownership or admin
const verifyOwnershipOrAdmin = (userIdField = 'userId') => {
  return async (req, res, next) => {
    try {
      let targetUserId;
      
      // Get user ID from params, body, or resource
      if (req.params[userIdField]) {
        targetUserId = req.params[userIdField];
      } else if (req.body[userIdField]) {
        targetUserId = req.body[userIdField];
      } else if (req.params.id) {
        // For routes like /users/:id, check if :id matches current user
        targetUserId = req.params.id;
      }
      
      if (!targetUserId) {
        return res.status(400).json({
          status: 'fail',
          message: 'User ID is required.'
        });
      }
      
      // Allow if user is admin or accessing their own resource
      if (req.user.role === 'admin' || req.user._id.toString() === targetUserId.toString()) {
        return next();
      }
      
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied. You can only access your own resources.'
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Error verifying resource ownership.'
      });
    }
  };
};

module.exports = {
  protect,
  restrictTo,
  verifyEmailToken,
  optionalAuth,
  authRateLimit,
  checkOwnership,
  verifyOwnershipOrAdmin
};