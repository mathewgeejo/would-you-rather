const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error Stack:', err.stack);
  console.error('Error Details:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    let message = 'Duplicate field value entered';
    
    // Extract field name from error
    const field = Object.keys(err.keyValue)[0];
    if (field) {
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    }
    
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again.';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired. Please log in again.';
    error = { message, statusCode: 401 };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large. Please upload a smaller file.';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field. Please check your upload.';
    error = { message, statusCode: 400 };
  }

  // Rate limiting errors
  if (err.status === 429) {
    const message = 'Too many requests. Please try again later.';
    error = { message, statusCode: 429 };
  }

  // Database connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    const message = 'Database connection error. Please try again later.';
    error = { message, statusCode: 503 };
  }

  // Redis connection errors
  if (err.code === 'ECONNREFUSED' && err.address && err.port) {
    const message = 'Cache service unavailable. Please try again later.';
    error = { message, statusCode: 503 };
  }

  // OpenAI API errors
  if (err.response && err.response.status) {
    if (err.response.status === 429) {
      const message = 'AI service is temporarily overloaded. Please try again later.';
      error = { message, statusCode: 503 };
    } else if (err.response.status === 401) {
      const message = 'AI service authentication failed.';
      error = { message, statusCode: 500 };
    } else {
      const message = 'AI service is temporarily unavailable.';
      error = { message, statusCode: 503 };
    }
  }

  // Socket.IO errors
  if (err.type === 'entity.parse.failed') {
    const message = 'Invalid JSON format in request body.';
    error = { message, statusCode: 400 };
  }

  // Default error response
  const statusCode = error.statusCode || err.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Different error responses for different environments
  let errorResponse = {
    status: statusCode >= 400 && statusCode < 500 ? 'fail' : 'error',
    message
  };

  // Add additional details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse = {
      ...errorResponse,
      error: err,
      stack: err.stack,
      details: {
        name: err.name,
        code: err.code,
        statusCode: err.statusCode
      }
    };
  }

  // Add request ID for tracking
  if (req.id) {
    errorResponse.requestId = req.id;
  }

  // Log critical errors
  if (statusCode >= 500) {
    console.error(`CRITICAL ERROR [${new Date().toISOString()}]:`, {
      message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user._id : 'anonymous'
    });
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;