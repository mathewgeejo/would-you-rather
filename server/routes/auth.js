const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const { protect, authRateLimit } = require('../middleware/auth');
const { 
  validate, 
  registerSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting to all auth routes
router.use(authRateLimit);

// Public routes
router.post('/register', validate(registerSchema), authController.signup);
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);

// Email verification
router.get('/verify-email/:token', authController.verifyEmail);

// Password reset
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.patch('/reset-password/:token', validate(resetPasswordSchema), authController.resetPassword);

// Protected routes
router.use(protect); // All routes after this middleware are protected

router.get('/me', authController.checkAuth);
router.patch('/update-password', 
  validate(resetPasswordSchema), 
  authController.updatePassword
);

// OAuth routes
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/api/auth/oauth/failure',
    session: false 
  }),
  authController.oauthSuccess
);

router.get('/github',
  passport.authenticate('github', { 
    scope: ['user:email'] 
  })
);

router.get('/github/callback',
  passport.authenticate('github', { 
    failureRedirect: '/api/auth/oauth/failure',
    session: false 
  }),
  authController.oauthSuccess
);

router.get('/oauth/failure', authController.oauthFailure);

module.exports = router;