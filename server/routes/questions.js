const express = require('express');
const questionController = require('../controllers/questionController');
const { protect, restrictTo, optionalAuth } = require('../middleware/auth');
const { 
  validate, 
  createQuestionSchema, 
  objectIdSchema, 
  paginationSchema 
} = require('../middleware/validation');

const router = express.Router();

// Public routes (with optional authentication)
router.get('/', 
  optionalAuth,
  validate(paginationSchema, 'query'),
  questionController.getQuestions
);

router.get('/trending', 
  validate(paginationSchema, 'query'),
  questionController.getTrendingQuestions
);

router.get('/random', 
  optionalAuth,
  validate(paginationSchema, 'query'),
  questionController.getRandomQuestions
);

router.get('/:id', 
  validate(objectIdSchema, 'params'),
  optionalAuth,
  questionController.getQuestion
);

// Protected routes
router.use(protect);

// Question CRUD
router.post('/', 
  validate(createQuestionSchema),
  questionController.createQuestion
);

router.patch('/:id', 
  validate(objectIdSchema, 'params'),
  validate(createQuestionSchema),
  questionController.updateQuestion
);

router.delete('/:id', 
  validate(objectIdSchema, 'params'),
  questionController.deleteQuestion
);

// Question actions
router.post('/:id/share', 
  validate(objectIdSchema, 'params'),
  questionController.shareQuestion
);

router.post('/:id/report', 
  validate(objectIdSchema, 'params'),
  questionController.reportQuestion
);

// User's questions
router.get('/user/my-questions', questionController.getUserQuestions);
router.get('/user/:userId', 
  validate(objectIdSchema, 'params'),
  questionController.getUserQuestions
);

// Analytics
router.get('/:id/analytics', 
  validate(objectIdSchema, 'params'),
  questionController.getQuestionAnalytics
);

// Admin routes
router.use(restrictTo('admin', 'moderator'));

router.patch('/:id/moderate', 
  validate(objectIdSchema, 'params'),
  questionController.moderateQuestion
);

module.exports = router;