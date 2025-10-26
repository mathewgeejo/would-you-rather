const Vote = require('../models/Vote');
const Question = require('../models/Question');
const User = require('../models/User');
const Badge = require('../models/Badge');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Submit a vote
const submitVote = catchAsync(async (req, res, next) => {
  const { choice, decisionTime, confidence } = req.body;
  const questionId = req.params.questionId;
  const userId = req.user.id;

  // Check if question exists
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new AppError('Question not found', 404));
  }

  if (!question.isActive || question.moderation.status !== 'approved') {
    return next(new AppError('Question is not available for voting', 400));
  }

  // Check if user already voted
  const existingVote = await Vote.findOne({ userId, questionId });
  if (existingVote) {
    return next(new AppError('You have already voted on this question', 400));
  }

  // Create new vote
  const vote = await Vote.create({
    userId,
    questionId,
    choice,
    decisionTime: decisionTime || 0,
    confidence: confidence || 3,
    sessionId: req.sessionID,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    metadata: {
      platform: req.query.platform || 'web',
      device: req.query.device || 'desktop',
      browser: req.get('User-Agent'),
      referrer: req.get('Referrer')
    }
  });

  // Update question with vote
  question.addVote(userId, choice, decisionTime);
  await question.save();

  // Update user stats
  const user = await User.findById(userId);
  user.stats.votesCount += 1;
  
  // Add points for voting
  const pointsEarned = user.addPoints(10);
  
  // Update streak
  const newStreak = user.updateStreak();
  
  await user.save();

  // Check for badge achievements
  const badges = await Badge.find({ isActive: true });
  const earnedBadges = [];
  
  for (const badge of badges) {
    const qualifies = await Badge.checkUserQualification(userId, badge._id);
    if (qualifies) {
      const awarded = await Badge.awardToUser(userId, badge._id);
      if (awarded) {
        earnedBadges.push(badge);
      }
    }
  }

  // Emit real-time vote update via Socket.IO
  const io = req.app.get('io');
  io.to(`question_${questionId}`).emit('vote_update', {
    questionId,
    choice,
    totalVotes: question.stats.totalVotes,
    optionAPercentage: question.stats.optionAPercentage,
    optionBPercentage: question.stats.optionBPercentage,
    voter: {
      username: user.username,
      avatar: user.profile.avatar
    }
  });

  // Send notifications for earned badges
  if (earnedBadges.length > 0) {
    io.to(`user_${userId}`).emit('badges_earned', earnedBadges);
  }

  res.status(201).json({
    status: 'success',
    data: {
      vote,
      pointsEarned: pointsEarned.levelUp ? pointsEarned : { points: 10 },
      streak: newStreak,
      earnedBadges
    }
  });
});

// Change vote (if allowed)
const changeVote = catchAsync(async (req, res, next) => {
  const { choice } = req.body;
  const questionId = req.params.questionId;
  const userId = req.user.id;

  // Find existing vote
  const existingVote = await Vote.findOne({ userId, questionId });
  if (!existingVote) {
    return next(new AppError('No vote found to change', 404));
  }

  // Check if vote changing is allowed (within time limit)
  const voteAge = Date.now() - existingVote.createdAt.getTime();
  const CHANGE_LIMIT = 5 * 60 * 1000; // 5 minutes

  if (voteAge > CHANGE_LIMIT) {
    return next(new AppError('Vote can only be changed within 5 minutes', 400));
  }

  // Get question
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new AppError('Question not found', 404));
  }

  // Remove old vote from question
  question.removeVote(userId);
  
  // Add new vote to question
  question.addVote(userId, choice);
  await question.save();

  // Update vote record
  existingVote.choice = choice;
  existingVote.decisionTime = req.body.decisionTime || existingVote.decisionTime;
  await existingVote.save();

  // Emit real-time update
  const io = req.app.get('io');
  io.to(`question_${questionId}`).emit('vote_update', {
    questionId,
    choice,
    totalVotes: question.stats.totalVotes,
    optionAPercentage: question.stats.optionAPercentage,
    optionBPercentage: question.stats.optionBPercentage,
    type: 'change'
  });

  res.status(200).json({
    status: 'success',
    data: {
      vote: existingVote
    }
  });
});

// Get user's voting history
const getVotingHistory = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Check access permissions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view your own voting history', 403));
  }

  const votingHistory = await Vote.getUserVotingHistory(userId, limit, skip);
  const total = await Vote.countDocuments({ userId });

  res.status(200).json({
    status: 'success',
    results: votingHistory.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: {
      votes: votingHistory
    }
  });
});

// Get question vote details
const getQuestionVotes = catchAsync(async (req, res, next) => {
  const questionId = req.params.questionId;
  
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new AppError('Question not found', 404));
  }

  // Get vote analytics
  const analytics = await Vote.getQuestionAnalytics(questionId);
  
  // Get recent voters (if public)
  const recentVotes = await Vote.find({ questionId })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('userId', 'username profile.avatar profile.firstName profile.lastName')
    .select('choice createdAt userId');

  res.status(200).json({
    status: 'success',
    data: {
      analytics: analytics[0] || {},
      recentVotes,
      totalVotes: question.stats.totalVotes,
      percentages: {
        optionA: question.stats.optionAPercentage,
        optionB: question.stats.optionBPercentage
      }
    }
  });
});

// Get voting trends
const getVotingTrends = catchAsync(async (req, res, next) => {
  const timeframe = req.query.timeframe || 'daily';
  const limit = parseInt(req.query.limit) || 30;

  const trends = await Vote.getVotingTrends(timeframe, limit);

  res.status(200).json({
    status: 'success',
    data: {
      trends,
      timeframe
    }
  });
});

// Get user voting patterns
const getUserVotingPatterns = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.user.id;

  // Check access permissions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view your own voting patterns', 403));
  }

  const patterns = await Vote.getUserVotingPatterns(userId);

  res.status(200).json({
    status: 'success',
    data: {
      patterns: patterns[0] || {}
    }
  });
});

// Get category preferences
const getCategoryPreferences = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.user.id;

  // Check access permissions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view your own preferences', 403));
  }

  const preferences = await Vote.getCategoryPreferences(userId);

  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
});

// Get vote streak information
const getVoteStreak = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.user.id;

  // Check access permissions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view your own streak', 403));
  }

  const streakData = await Vote.calculateVoteStreak(userId);
  const user = await User.findById(userId).select('stats.currentStreak stats.longestStreak');

  res.status(200).json({
    status: 'success',
    data: {
      currentStreak: user.stats.currentStreak,
      longestStreak: user.stats.longestStreak,
      streakHistory: streakData[0] || {}
    }
  });
});

// Delete vote (admin only, for moderation)
const deleteVote = catchAsync(async (req, res, next) => {
  const voteId = req.params.voteId;

  const vote = await Vote.findById(voteId);
  if (!vote) {
    return next(new AppError('Vote not found', 404));
  }

  // Remove vote from question
  const question = await Question.findById(vote.questionId);
  if (question) {
    question.removeVote(vote.userId);
    await question.save();
  }

  // Update user stats
  await User.findByIdAndUpdate(vote.userId, {
    $inc: { 
      'stats.votesCount': -1,
      'stats.points': -10
    }
  });

  // Delete vote
  await Vote.findByIdAndDelete(voteId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

module.exports = {
  submitVote,
  changeVote,
  getVotingHistory,
  getQuestionVotes,
  getVotingTrends,
  getUserVotingPatterns,
  getCategoryPreferences,
  getVoteStreak,
  deleteVote
};