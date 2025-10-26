const express = require('express');
const { protect } = require('../middleware/auth');
const { 
  generateAIQuestion, 
  getAIStats, 
  getAILimits, 
  batchGenerate,
  aiRateLimit 
} = require('../services/aiService');
const { validate, aiQuestionSchema } = require('../middleware/validation');

const router = express.Router();

// All AI routes require authentication
router.use(protect);

/**
 * @route   POST /api/ai/generate
 * @desc    Generate AI question
 * @access  Private
 */
router.post('/generate', aiRateLimit, validate(aiQuestionSchema), generateAIQuestion);

/**
 * @route   GET /api/ai/stats
 * @desc    Get AI generation statistics
 * @access  Private
 */
router.get('/stats', getAIStats);

/**
 * @route   GET /api/ai/limits
 * @desc    Get AI usage limits for user
 * @access  Private
 */
router.get('/limits', getAILimits);

/**
 * @route   POST /api/ai/batch
 * @desc    Batch generate questions (admin only)
 * @access  Private (Admin)
 */
router.post('/batch', 
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied. Admin privileges required.'
      });
    }
    next();
  },
  batchGenerate
);

module.exports = router;