const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

// Helper function to sign JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// Helper function to create refresh token
const createRefreshToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Helper function to send token response
const createSendToken = (user, statusCode, res, message = 'Success') => {
  const token = signToken(user._id);
  const refreshToken = createRefreshToken();
  
  // Set refresh token in database
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  user.lastLogin = new Date();
  user.save({ validateBeforeSave: false });
  
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.cookie('jwt', token, cookieOptions);
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  // Remove password from output
  user.password = undefined;
  user.refreshToken = undefined;

  res.status(statusCode).json({
    status: 'success',
    message,
    token,
    refreshToken,
    data: {
      user
    }
  });
};

// Register new user
const signup = catchAsync(async (req, res, next) => {
  const { email, username, password, firstName, lastName } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    if (existingUser.email === email) {
      return next(new AppError('Email already registered', 400));
    }
    if (existingUser.username === username) {
      return next(new AppError('Username already taken', 400));
    }
  }

  // Create verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Create new user
  const newUser = await User.create({
    email,
    username,
    password,
    profile: {
      firstName,
      lastName
    },
    verificationToken,
    isVerified: false
  });

  // Send verification email
  try {
    const verifyURL = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    await new Email(newUser, verifyURL).sendWelcome();
  } catch (err) {
    console.error('Email sending failed:', err);
    // Don't fail registration if email fails
  }

  createSendToken(newUser, 201, res, 'User registered successfully. Please check your email to verify your account.');
});

// Login user
const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Find user by email and include password
  const user = await User.findOne({ email }).select('+password');

  // Check if user exists and password is correct
  if (!user || !(await user.correctPassword(password, user.password))) {
    // Increment login attempts for existing user
    if (user) {
      await user.incLoginAttempts();
    }
    return next(new AppError('Incorrect email or password', 401));
  }

  // Check if account is locked
  if (user.isLocked) {
    return next(new AppError('Account is temporarily locked due to multiple failed login attempts', 423));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }

  // Reset login attempts on successful login
  if (user.loginAttempts > 0) {
    await user.resetLoginAttempts();
  }

  createSendToken(user, 200, res, 'Logged in successfully');
});

// Logout user
const logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.cookie('refreshToken', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({ 
    status: 'success',
    message: 'Logged out successfully'
  });
};

// Refresh token
const refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body || req.cookies;

  if (!refreshToken) {
    return next(new AppError('Refresh token is required', 401));
  }

  // Find user with this refresh token
  const user = await User.findOne({
    refreshToken,
    refreshTokenExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Invalid or expired refresh token', 401));
  }

  // Create new tokens
  createSendToken(user, 200, res, 'Token refreshed successfully');
});

// Verify email
const verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  // Find user with this verification token
  const user = await User.findOne({
    verificationToken: token,
    isVerified: false
  });

  if (!user) {
    return next(new AppError('Invalid or expired verification token', 400));
  }

  // Verify user
  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully'
  });
});

// Forgot password
const forgotPassword = catchAsync(async (req, res, next) => {
  // Get user based on email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with that email address', 404));
  }

  // Generate random reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  user.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save({ validateBeforeSave: false });

  // Send password reset email
  try {
    const resetURL = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Password reset token sent to email'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later.', 500)
    );
  }
});

// Reset password
const resetPassword = catchAsync(async (req, res, next) => {
  // Get user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  // If token has not expired and there is user, set new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Log user in with new password
  createSendToken(user, 200, res, 'Password reset successfully');
});

// Update password for logged in user
const updatePassword = catchAsync(async (req, res, next) => {
  // Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // Check if current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is incorrect', 401));
  }

  // Update password
  user.password = req.body.password;
  await user.save();

  // Log user in with new password
  createSendToken(user, 200, res, 'Password updated successfully');
});

// Check authentication status
const checkAuth = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'fail',
      message: 'Not authenticated'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

// OAuth success callback
const oauthSuccess = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }

  createSendToken(req.user, 200, res, 'OAuth login successful');
});

// OAuth failure callback
const oauthFailure = (req, res) => {
  res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
};

module.exports = {
  signup,
  login,
  logout,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  updatePassword,
  checkAuth,
  oauthSuccess,
  oauthFailure
};