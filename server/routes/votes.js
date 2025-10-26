const express = require('express');
const voteController = require('../controllers/voteController');
const { protect, restrictTo } = require('../middleware/auth');
const { validate, voteSchema, objectIdSchema, paginationSchema } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Submit and manage votes
router.post('/:questionId', 
  validate(objectIdSchema, 'params'),
  validate(voteSchema),
  voteController.submitVote
);

router.patch('/:questionId', 
  validate(objectIdSchema, 'params'),
  validate(voteSchema),
  voteController.changeVote
);

// Voting history and analytics
router.get('/history/me', 
  validate(paginationSchema, 'query'),
  voteController.getVotingHistory
);

router.get('/history/:userId', 
  validate(objectIdSchema, 'params'),
  validate(paginationSchema, 'query'),
  voteController.getVotingHistory
);

// Question vote details
router.get('/question/:questionId', 
  validate(objectIdSchema, 'params'),
  voteController.getQuestionVotes
);

// User voting analytics
router.get('/patterns/me', voteController.getUserVotingPatterns);
router.get('/patterns/:userId', 
  validate(objectIdSchema, 'params'),
  voteController.getUserVotingPatterns
);

router.get('/preferences/me', voteController.getCategoryPreferences);
router.get('/preferences/:userId', 
  validate(objectIdSchema, 'params'),
  voteController.getCategoryPreferences
);

router.get('/streak/me', voteController.getVoteStreak);
router.get('/streak/:userId', 
  validate(objectIdSchema, 'params'),
  voteController.getVoteStreak
);

// Platform analytics (admin only)
router.get('/trends', 
  restrictTo('admin', 'moderator'),
  validate(paginationSchema, 'query'),
  voteController.getVotingTrends
);

// Admin routes
router.use(restrictTo('admin'));

router.delete('/:voteId', 
  validate(objectIdSchema, 'params'),
  voteController.deleteVote
);

module.exports = router;