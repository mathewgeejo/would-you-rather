const User = require('../models/User');
const Vote = require('../models/Vote');
const Question = require('../models/Question');
const ChatMessage = require('../models/ChatMessage');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

// Multer configuration for avatar upload
const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload avatar middleware
const uploadAvatar = upload.single('avatar');

// Resize and save avatar
const resizeAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(300, 300)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`uploads/avatars/${req.file.filename}`);

  next();
});

// Filter object helper
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// Get current user profile
const getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).populate('stats.badges');
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// Update current user profile
const updateMe = catchAsync(async (req, res, next) => {
  // Create error if user POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /update-password.',
        400
      )
    );
  }

  // Filter out unwanted field names that are not allowed to be updated
  const filteredBody = filterObj(
    req.body,
    'profile.firstName',
    'profile.lastName',
    'profile.bio',
    'profile.socialLinks',
    'profile.preferences'
  );

  // Handle nested profile updates
  if (req.body.profile) {
    const profileUpdates = filterObj(
      req.body.profile,
      'firstName',
      'lastName',
      'bio',
      'socialLinks',
      'preferences'
    );
    
    Object.keys(profileUpdates).forEach(key => {
      filteredBody[`profile.${key}`] = profileUpdates[key];
    });
    delete filteredBody.profile;
  }

  // Add avatar if uploaded
  if (req.file) {
    filteredBody['profile.avatar'] = `/uploads/avatars/${req.file.filename}`;
  }

  // Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true
  }).populate('stats.badges');

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    }
  });
});

// Delete current user account (soft delete)
const deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { isActive: false });

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get user by ID
const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id).populate('stats.badges');
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  // Check if profile is public or if user is viewing their own profile
  if (!user.profile.preferences.publicProfile && req.user.id !== user.id) {
    return next(new AppError('This profile is private', 403));
  }

  // Remove sensitive information for other users
  if (req.user.id !== user.id) {
    user.email = undefined;
    user.loginAttempts = undefined;
    user.lockUntil = undefined;
    user.verificationToken = undefined;
    user.passwordResetToken = undefined;
    user.refreshToken = undefined;
  }

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// Get all users (admin only)
const getAllUsers = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = { isActive: true };
  if (req.query.search) {
    filter.$or = [
      { username: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
      { 'profile.firstName': { $regex: req.query.search, $options: 'i' } },
      { 'profile.lastName': { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const users = await User.find(filter)
    .select('-password -refreshToken -verificationToken -passwordResetToken')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('stats.badges');

  const total = await User.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: users.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: {
      users
    }
  });
});

// Get user statistics
const getUserStats = catchAsync(async (req, res, next) => {
  const userId = req.params.id || req.user.id;
  
  const user = await User.findById(userId);
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  // Get detailed statistics
  const [
    totalVotes,
    totalQuestions,
    votingHistory,
    categoryPreferences,
    recentActivity
  ] = await Promise.all([
    Vote.countDocuments({ userId }),
    Question.countDocuments({ createdBy: userId }),
    Vote.getUserVotingHistory(userId, 10),
    Vote.getCategoryPreferences(userId),
    Vote.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('questionId', 'optionA optionB category')
  ]);

  const stats = {
    overview: {
      totalVotes,
      totalQuestions,
      points: user.stats.points,
      level: user.stats.level,
      currentStreak: user.stats.currentStreak,
      longestStreak: user.stats.longestStreak,
      badges: user.stats.badges.length
    },
    votingHistory,
    categoryPreferences,
    recentActivity
  };

  res.status(200).json({
    status: 'success',
    data: {
      stats
    }
  });
});

// Get leaderboard
const getLeaderboard = catchAsync(async (req, res, next) => {
  const period = req.query.period || 'all'; // all, monthly, weekly, daily
  const limit = parseInt(req.query.limit) || 10;
  const category = req.query.category; // points, questions, votes, streak

  let sortField = 'stats.points';
  
  switch (category) {
    case 'questions':
      sortField = 'stats.questionsCreated';
      break;
    case 'votes':
      sortField = 'stats.votesCount';
      break;
    case 'streak':
      sortField = 'stats.longestStreak';
      break;
    default:
      sortField = 'stats.points';
  }

  const leaderboard = await User.getLeaderboard(limit, period);

  res.status(200).json({
    status: 'success',
    data: {
      leaderboard,
      period,
      category: category || 'points'
    }
  });
});

// Search users
const searchUsers = catchAsync(async (req, res, next) => {
  const { q } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!q) {
    return next(new AppError('Search query is required', 400));
  }

  const searchRegex = new RegExp(q, 'i');
  
  const users = await User.find({
    isActive: true,
    'profile.preferences.publicProfile': true,
    $or: [
      { username: searchRegex },
      { 'profile.firstName': searchRegex },
      { 'profile.lastName': searchRegex }
    ]
  })
  .select('username profile.firstName profile.lastName profile.avatar stats.level stats.points')
  .sort({ 'stats.points': -1 })
  .skip(skip)
  .limit(limit);

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users
    }
  });
});

// Follow/Unfollow user (if implementing social features)
const followUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  if (id === req.user.id) {
    return next(new AppError('You cannot follow yourself', 400));
  }

  const userToFollow = await User.findById(id);
  if (!userToFollow) {
    return next(new AppError('User not found', 404));
  }

  // This would require adding followers/following fields to User model
  // For now, just return success
  res.status(200).json({
    status: 'success',
    message: 'User followed successfully'
  });
});

// Admin: Update user role
const updateUserRole = catchAsync(async (req, res, next) => {
  const { role } = req.body;
  const { id } = req.params;

  if (!['user', 'moderator', 'admin'].includes(role)) {
    return next(new AppError('Invalid role', 400));
  }

  const user = await User.findByIdAndUpdate(
    id,
    { role },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// Admin: Ban/Unban user
const banUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { banned } = req.body;

  const user = await User.findByIdAndUpdate(
    id,
    { isActive: !banned },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: banned ? 'User banned successfully' : 'User unbanned successfully',
    data: {
      user
    }
  });
});

module.exports = {
  uploadAvatar,
  resizeAvatar,
  getMe,
  updateMe,
  deleteMe,
  getUser,
  getAllUsers,
  getUserStats,
  getLeaderboard,
  searchUsers,
  followUser,
  updateUserRole,
  banUser
};