const express = require('express');
const chatController = require('../controllers/chatController');
const { protect, restrictTo } = require('../middleware/auth');
const { 
  validate, 
  chatMessageSchema, 
  reactionSchema, 
  objectIdSchema, 
  paginationSchema 
} = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get messages for a question
router.get('/:questionId', 
  validate(objectIdSchema, 'params'),
  validate(paginationSchema, 'query'),
  chatController.getMessages
);

// Send message
router.post('/:questionId', 
  validate(objectIdSchema, 'params'),
  validate(chatMessageSchema),
  chatController.sendMessage
);

// Message actions
router.patch('/message/:messageId', 
  validate(objectIdSchema, 'params'),
  validate(chatMessageSchema),
  chatController.editMessage
);

router.delete('/message/:messageId', 
  validate(objectIdSchema, 'params'),
  chatController.deleteMessage
);

// Reactions
router.post('/message/:messageId/reaction', 
  validate(objectIdSchema, 'params'),
  validate(reactionSchema),
  chatController.addReaction
);

router.delete('/message/:messageId/reaction', 
  validate(objectIdSchema, 'params'),
  validate(reactionSchema),
  chatController.removeReaction
);

// Flag message
router.post('/message/:messageId/flag', 
  validate(objectIdSchema, 'params'),
  chatController.flagMessage
);

// User message history
router.get('/user/me', 
  validate(paginationSchema, 'query'),
  chatController.getUserMessages
);

router.get('/user/:userId', 
  validate(objectIdSchema, 'params'),
  validate(paginationSchema, 'query'),
  chatController.getUserMessages
);

// Moderator/Admin routes
router.use(restrictTo('moderator', 'admin'));

// Pin/unpin message
router.patch('/message/:messageId/pin', 
  validate(objectIdSchema, 'params'),
  chatController.pinMessage
);

// Chat statistics
router.get('/stats', 
  validate(paginationSchema, 'query'),
  chatController.getChatStats
);

module.exports = router;