const Question = require('../models/Question');
const Vote = require('../models/Vote');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Create new question
const createQuestion = catchAsync(async (req, res, next) => {
  const { optionA, optionB, category, tags, difficulty } = req.body;

  const question = await Question.create({
    createdBy: req.user.id,
    optionA,
    optionB,
    category,
    tags: tags || [],
    difficulty: difficulty || 3,
    type: 'user'
  });

  // Update user stats
  await User.findByIdAndUpdate(req.user.id, {
    $inc: { 
      'stats.questionsCreated': 1,
      'stats.points': 50 // Points for creating a question
    }
  });

  await question.populate('createdBy', 'username profile.avatar profile.firstName profile.lastName');

  res.status(201).json({
    status: 'success',
    data: {
      question
    }
  });
});

// Get all questions with pagination and filtering
const getQuestions = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Build filter object
  const filter = {
    isActive: true,
    'moderation.status': 'approved'
  };

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.query.search) {
    filter.$or = [
      { optionA: { $regex: req.query.search, $options: 'i' } },
      { optionB: { $regex: req.query.search, $options: 'i' } },
      { tags: { $in: [new RegExp(req.query.search, 'i')] } }
    ];
  }

  if (req.query.difficulty) {
    filter.difficulty = parseInt(req.query.difficulty);
  }

  if (req.query.type) {
    filter.type = req.query.type;
  }

  // Build sort object
  let sort = {};
  switch (req.query.sort) {
    case 'newest':
      sort = { createdAt: -1 };
      break;
    case 'oldest':
      sort = { createdAt: 1 };
      break;
    case 'popular':
      sort = { 'stats.totalVotes': -1 };
      break;
    case 'trending':
      // Custom trending algorithm
      sort = { 'stats.engagementRate': -1, createdAt: -1 };
      break;
    default:
      sort = { createdAt: -1 };
  }

  const questions = await Question.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'username profile.avatar profile.firstName profile.lastName stats.level')
    .lean();

  // Add user vote status if authenticated
  if (req.user) {
    for (let question of questions) {
      question._currentUserId = req.user._id;
      const userVote = question.votes.optionA.find(vote => 
        vote.userId.toString() === req.user._id.toString()
      ) ? 'optionA' : question.votes.optionB.find(vote => 
        vote.userId.toString() === req.user._id.toString()
      ) ? 'optionB' : null;
      
      question.userVote = userVote;
    }
  }

  const total = await Question.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: questions.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: {
      questions
    }
  });
});

// Get single question by ID
const getQuestion = catchAsync(async (req, res, next) => {
  const question = await Question.findById(req.params.id)
    .populate('createdBy', 'username profile.avatar profile.firstName profile.lastName stats.level')
    .populate({
      path: 'votes.optionA.userId votes.optionB.userId',
      select: 'username profile.avatar profile.firstName profile.lastName'
    });

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  if (!question.isActive || question.moderation.status !== 'approved') {
    return next(new AppError('Question is not available', 404));
  }

  // Increment view count
  question.incrementViews();
  await question.save({ validateBeforeSave: false });

  // Add user vote status if authenticated
  if (req.user) {
    question._currentUserId = req.user._id;
  }

  res.status(200).json({
    status: 'success',
    data: {
      question
    }
  });
});

// Update question (author or admin only)
const updateQuestion = catchAsync(async (req, res, next) => {
  const { optionA, optionB, category, tags, difficulty } = req.body;

  const question = await Question.findById(req.params.id);

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  // Check ownership or admin rights
  if (question.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only edit your own questions', 403));
  }

  // Don't allow editing if question has votes (unless admin)
  if (question.stats.totalVotes > 0 && req.user.role !== 'admin') {
    return next(new AppError('Cannot edit question that already has votes', 400));
  }

  const updates = {};
  if (optionA) updates.optionA = optionA;
  if (optionB) updates.optionB = optionB;
  if (category) updates.category = category;
  if (tags) updates.tags = tags;
  if (difficulty) updates.difficulty = difficulty;

  const updatedQuestion = await Question.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  ).populate('createdBy', 'username profile.avatar profile.firstName profile.lastName');

  res.status(200).json({
    status: 'success',
    data: {
      question: updatedQuestion
    }
  });
});

// Delete question (author or admin only)
const deleteQuestion = catchAsync(async (req, res, next) => {
  const question = await Question.findById(req.params.id);

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  // Check ownership or admin rights
  if (question.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only delete your own questions', 403));
  }

  // Soft delete
  question.isActive = false;
  await question.save({ validateBeforeSave: false });

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get trending questions
const getTrendingQuestions = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 10;
  const timeframe = parseInt(req.query.timeframe) || 24; // hours

  const trendingQuestions = await Question.getTrending(limit, timeframe);

  res.status(200).json({
    status: 'success',
    results: trendingQuestions.length,
    data: {
      questions: trendingQuestions
    }
  });
});

// Get random questions
const getRandomQuestions = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 1;
  const category = req.query.category;
  const excludeIds = req.query.exclude ? req.query.exclude.split(',') : [];

  // Get user's voted questions to exclude
  let userVotedQuestions = [];
  if (req.user) {
    const userVotes = await Vote.find({ userId: req.user.id }).select('questionId');
    userVotedQuestions = userVotes.map(vote => vote.questionId);
  }

  const allExcludeIds = [...excludeIds, ...userVotedQuestions];

  const randomQuestions = await Question.getRandomQuestions(limit, category, allExcludeIds);

  res.status(200).json({
    status: 'success',
    results: randomQuestions.length,
    data: {
      questions: randomQuestions
    }
  });
});

// Get user's questions
const getUserQuestions = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const userId = req.params.userId || req.user.id;

  // Check if user can access these questions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view your own questions', 403));
  }

  const filter = {
    createdBy: userId,
    isActive: true
  };

  const questions = await Question.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'username profile.avatar profile.firstName profile.lastName');

  const total = await Question.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: questions.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: {
      questions
    }
  });
});

// Get question analytics (author or admin only)
const getQuestionAnalytics = catchAsync(async (req, res, next) => {
  const question = await Question.findById(req.params.id);

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  // Check ownership or admin rights
  if (question.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view analytics for your own questions', 403));
  }

  const analytics = await Vote.getQuestionAnalytics(req.params.id);

  res.status(200).json({
    status: 'success',
    data: {
      analytics: analytics[0] || {}
    }
  });
});

// Share question
const shareQuestion = catchAsync(async (req, res, next) => {
  const question = await Question.findById(req.params.id);

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  // Increment share count
  question.incrementShares();
  await question.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Question shared successfully'
  });
});

// Report question
const reportQuestion = catchAsync(async (req, res, next) => {
  const { reason, description } = req.body;
  const question = await Question.findById(req.params.id);

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  // Add flag to moderation
  if (!question.moderation.flags) {
    question.moderation.flags = [];
  }

  question.moderation.flags.push(reason);

  // If multiple reports, mark for review
  if (question.moderation.flags.length >= 3) {
    question.moderation.status = 'pending';
  }

  await question.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Question reported successfully'
  });
});

// Admin: Moderate question
const moderateQuestion = catchAsync(async (req, res, next) => {
  const { status, reason } = req.body;
  const question = await Question.findById(req.params.id);

  if (!question) {
    return next(new AppError('No question found with that ID', 404));
  }

  question.moderation.status = status;
  question.moderation.moderatedBy = req.user.id;
  question.moderation.moderatedAt = new Date();
  if (reason) question.moderation.reason = reason;

  if (status === 'rejected') {
    question.isActive = false;
  }

  await question.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      question
    }
  });
});

module.exports = {
  createQuestion,
  getQuestions,
  getQuestion,
  updateQuestion,
  deleteQuestion,
  getTrendingQuestions,
  getRandomQuestions,
  getUserQuestions,
  getQuestionAnalytics,
  shareQuestion,
  reportQuestion,
  moderateQuestion
};