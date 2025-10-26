const express = require('express');
const userController = require('../controllers/userController');
const { protect, restrictTo, verifyOwnershipOrAdmin } = require('../middleware/auth');
const { validate, updateProfileSchema, objectIdSchema, paginationSchema } = require('../middleware/validation');

const router = express.Router();

// Public routes
router.get('/search', validate(paginationSchema, 'query'), userController.searchUsers);
router.get('/leaderboard', validate(paginationSchema, 'query'), userController.getLeaderboard);

// Protected routes
router.use(protect);

// Current user routes
router.get('/me', userController.getMe);
router.patch('/me', 
  userController.uploadAvatar,
  userController.resizeAvatar,
  validate(updateProfileSchema),
  userController.updateMe
);
router.delete('/me', userController.deleteMe);

// User profile routes
router.get('/:id', validate(objectIdSchema, 'params'), userController.getUser);
router.get('/:id/stats', 
  validate(objectIdSchema, 'params'),
  verifyOwnershipOrAdmin('id'),
  userController.getUserStats
);

// Social features
router.post('/:id/follow', 
  validate(objectIdSchema, 'params'),
  userController.followUser
);

// Admin only routes
router.use(restrictTo('admin'));

router.get('/', validate(paginationSchema, 'query'), userController.getAllUsers);
router.patch('/:id/role', 
  validate(objectIdSchema, 'params'),
  userController.updateUserRole
);
router.patch('/:id/ban', 
  validate(objectIdSchema, 'params'),
  userController.banUser
);

module.exports = router;