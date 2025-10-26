const ChatMessage = require('../models/ChatMessage');
const Question = require('../models/Question');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const xss = require('xss');

// Send message
const sendMessage = catchAsync(async (req, res, next) => {
  const { message, parentId } = req.body;
  const questionId = req.params.questionId;
  const userId = req.user.id;

  // Check if question exists
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new AppError('Question not found', 404));
  }

  // Sanitize message content
  const sanitizedMessage = xss(message, {
    allowedTags: [],
    allowedAttributes: {}
  });

  // Create message
  const chatMessage = await ChatMessage.create({
    questionId,
    userId,
    message: sanitizedMessage,
    parentId: parentId || null,
    type: 'message'
  });

  await chatMessage.populate('userId', 'username profile.avatar profile.firstName profile.lastName stats.level');

  // Update question comment count
  await Question.findByIdAndUpdate(questionId, {
    $inc: { 'stats.comments': 1 }
  });

  // Emit real-time message via Socket.IO
  const io = req.app.get('io');
  io.to(`question_${questionId}`).emit('new_message', {
    message: chatMessage,
    questionId
  });

  // If it's a reply, notify the parent message author
  if (parentId) {
    const parentMessage = await ChatMessage.findById(parentId).populate('userId');
    if (parentMessage && parentMessage.userId._id.toString() !== userId) {
      io.to(`user_${parentMessage.userId._id}`).emit('message_reply', {
        message: chatMessage,
        parentMessage,
        questionId
      });
    }
  }

  res.status(201).json({
    status: 'success',
    data: {
      message: chatMessage
    }
  });
});

// Get messages for a question
const getMessages = catchAsync(async (req, res, next) => {
  const questionId = req.params.questionId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const includeReplies = req.query.includeReplies !== 'false';

  // Check if question exists
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new AppError('Question not found', 404));
  }

  const messages = await ChatMessage.getMessagesForQuestion(
    questionId, 
    limit, 
    skip, 
    includeReplies
  );

  const total = await ChatMessage.countDocuments({
    questionId,
    isDeleted: false,
    'moderation.status': 'approved',
    parentId: null // Only count top-level messages for pagination
  });

  res.status(200).json({
    status: 'success',
    results: messages.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: {
      messages
    }
  });
});

// Edit message
const editMessage = catchAsync(async (req, res, next) => {
  const { message } = req.body;
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const chatMessage = await ChatMessage.findById(messageId);
  
  if (!chatMessage) {
    return next(new AppError('Message not found', 404));
  }

  // Check ownership
  if (chatMessage.userId.toString() !== userId) {
    return next(new AppError('You can only edit your own messages', 403));
  }

  // Check if message is too old to edit (30 minutes)
  const messageAge = Date.now() - chatMessage.createdAt.getTime();
  const EDIT_LIMIT = 30 * 60 * 1000; // 30 minutes

  if (messageAge > EDIT_LIMIT) {
    return next(new AppError('Message can only be edited within 30 minutes', 400));
  }

  // Sanitize message
  const sanitizedMessage = xss(message, {
    allowedTags: [],
    allowedAttributes: {}
  });

  // Edit message
  chatMessage.editMessage(sanitizedMessage, userId);
  await chatMessage.save();

  // Emit real-time update
  const io = req.app.get('io');
  io.to(`question_${chatMessage.questionId}`).emit('message_edited', {
    messageId,
    message: sanitizedMessage,
    editedAt: new Date()
  });

  res.status(200).json({
    status: 'success',
    data: {
      message: chatMessage
    }
  });
});

// Delete message
const deleteMessage = catchAsync(async (req, res, next) => {
  const messageId = req.params.messageId;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

  const chatMessage = await ChatMessage.findById(messageId);
  
  if (!chatMessage) {
    return next(new AppError('Message not found', 404));
  }

  // Check ownership or admin rights
  if (chatMessage.userId.toString() !== userId && !isAdmin) {
    return next(new AppError('You can only delete your own messages', 403));
  }

  // Soft delete message
  chatMessage.deleteMessage(userId, isAdmin);
  await chatMessage.save();

  // Update question comment count
  await Question.findByIdAndUpdate(chatMessage.questionId, {
    $inc: { 'stats.comments': -1 }
  });

  // Emit real-time update
  const io = req.app.get('io');
  io.to(`question_${chatMessage.questionId}`).emit('message_deleted', {
    messageId,
    deletedBy: isAdmin ? 'moderator' : 'author'
  });

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Add reaction to message
const addReaction = catchAsync(async (req, res, next) => {
  const { type } = req.body;
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const chatMessage = await ChatMessage.findById(messageId);
  
  if (!chatMessage) {
    return next(new AppError('Message not found', 404));
  }

  if (chatMessage.isDeleted) {
    return next(new AppError('Cannot react to deleted message', 400));
  }

  // Add or update reaction
  chatMessage.addReaction(userId, type);
  await chatMessage.save();

  // Get updated reaction summary
  const reactionSummary = chatMessage.reactionSummary;

  // Emit real-time update
  const io = req.app.get('io');
  io.to(`question_${chatMessage.questionId}`).emit('reaction_updated', {
    messageId,
    reactions: reactionSummary,
    userId,
    type
  });

  res.status(200).json({
    status: 'success',
    data: {
      reactions: reactionSummary
    }
  });
});

// Remove reaction from message
const removeReaction = catchAsync(async (req, res, next) => {
  const { type } = req.body;
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const chatMessage = await ChatMessage.findById(messageId);
  
  if (!chatMessage) {
    return next(new AppError('Message not found', 404));
  }

  // Remove reaction
  chatMessage.removeReaction(userId, type);
  await chatMessage.save();

  // Get updated reaction summary
  const reactionSummary = chatMessage.reactionSummary;

  // Emit real-time update
  const io = req.app.get('io');
  io.to(`question_${chatMessage.questionId}`).emit('reaction_updated', {
    messageId,
    reactions: reactionSummary,
    userId,
    type: null
  });

  res.status(200).json({
    status: 'success',
    data: {
      reactions: reactionSummary
    }
  });
});

// Flag message
const flagMessage = catchAsync(async (req, res, next) => {
  const { reason, description } = req.body;
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const chatMessage = await ChatMessage.findById(messageId);
  
  if (!chatMessage) {
    return next(new AppError('Message not found', 404));
  }

  if (chatMessage.userId.toString() === userId) {
    return next(new AppError('You cannot flag your own message', 400));
  }

  // Add flag
  try {
    chatMessage.addFlag(userId, reason, description);
    await chatMessage.save();

    res.status(200).json({
      status: 'success',
      message: 'Message flagged successfully'
    });
  } catch (error) {
    return next(new AppError(error.message, 400));
  }
});

// Get user's message history
const getUserMessages = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Check access permissions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You can only view your own messages', 403));
  }

  const messages = await ChatMessage.getUserMessageHistory(userId, limit, skip);
  const total = await ChatMessage.countDocuments({ userId, isDeleted: false });

  res.status(200).json({
    status: 'success',
    results: messages.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: {
      messages
    }
  });
});

// Get chat statistics
const getChatStats = catchAsync(async (req, res, next) => {
  const timeframe = req.query.timeframe || 'daily';
  
  const stats = await ChatMessage.getMessageStats(timeframe);

  res.status(200).json({
    status: 'success',
    data: {
      stats,
      timeframe
    }
  });
});

// Pin message (moderator/admin only)
const pinMessage = catchAsync(async (req, res, next) => {
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const chatMessage = await ChatMessage.findById(messageId);
  
  if (!chatMessage) {
    return next(new AppError('Message not found', 404));
  }

  chatMessage.isPinned = !chatMessage.isPinned;
  if (chatMessage.isPinned) {
    chatMessage.pinnedBy = userId;
    chatMessage.pinnedAt = new Date();
  } else {
    chatMessage.pinnedBy = undefined;
    chatMessage.pinnedAt = undefined;
  }

  await chatMessage.save();

  // Emit real-time update
  const io = req.app.get('io');
  io.to(`question_${chatMessage.questionId}`).emit('message_pinned', {
    messageId,
    isPinned: chatMessage.isPinned
  });

  res.status(200).json({
    status: 'success',
    data: {
      message: chatMessage
    }
  });
});

module.exports = {
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  flagMessage,
  getUserMessages,
  getChatStats,
  pinMessage
};