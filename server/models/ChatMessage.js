const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    minlength: [1, 'Message cannot be empty'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage',
    default: null // null for top-level messages, ObjectId for replies
  },
  type: {
    type: String,
    enum: ['message', 'reaction', 'system'],
    default: 'message'
  },
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  mentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    position: Number // character position in message
  }],
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'gif', 'link'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    metadata: {
      title: String,
      description: String,
      thumbnail: String,
      size: Number,
      mimeType: String
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  pinnedAt: Date,
  flags: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['spam', 'inappropriate', 'harassment', 'misinformation', 'other']
    },
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  moderation: {
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected', 'hidden'],
      default: 'approved'
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    moderatedAt: Date,
    reason: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
chatMessageSchema.index({ questionId: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1 });
chatMessageSchema.index({ parentId: 1 });
chatMessageSchema.index({ isDeleted: 1 });
chatMessageSchema.index({ isPinned: 1 });
chatMessageSchema.index({ 'moderation.status': 1 });

// Compound indexes
chatMessageSchema.index({ questionId: 1, isDeleted: 1, 'moderation.status': 1 });
chatMessageSchema.index({ questionId: 1, parentId: 1, createdAt: -1 });

// Virtual for reply count
chatMessageSchema.virtual('replyCount', {
  ref: 'ChatMessage',
  localField: '_id',
  foreignField: 'parentId',
  count: true,
  match: { isDeleted: false, 'moderation.status': 'approved' }
});

// Virtual for reaction summary
chatMessageSchema.virtual('reactionSummary').get(function() {
  const summary = {
    like: 0,
    love: 0,
    laugh: 0,
    wow: 0,
    sad: 0,
    angry: 0,
    total: 0
  };
  
  this.reactions.forEach(reaction => {
    if (summary[reaction.type] !== undefined) {
      summary[reaction.type]++;
      summary.total++;
    }
  });
  
  return summary;
});

// Method to add reaction
chatMessageSchema.methods.addReaction = function(userId, reactionType) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({
    userId,
    type: reactionType,
    createdAt: new Date()
  });
  
  return this;
};

// Method to remove reaction
chatMessageSchema.methods.removeReaction = function(userId, reactionType = null) {
  if (reactionType) {
    // Remove specific reaction type
    this.reactions = this.reactions.filter(
      reaction => !(
        reaction.userId.toString() === userId.toString() &&
        reaction.type === reactionType
      )
    );
  } else {
    // Remove all reactions from user
    this.reactions = this.reactions.filter(
      reaction => reaction.userId.toString() !== userId.toString()
    );
  }
  
  return this;
};

// Method to edit message
chatMessageSchema.methods.editMessage = function(newContent, userId) {
  // Only allow editing by the original author
  if (this.userId.toString() !== userId.toString()) {
    throw new Error('Only the message author can edit this message');
  }
  
  // Store edit history
  this.editHistory.push({
    content: this.message,
    editedAt: new Date()
  });
  
  // Update message
  this.message = newContent;
  this.isEdited = true;
  
  return this;
};

// Method to soft delete message
chatMessageSchema.methods.deleteMessage = function(userId, isAdmin = false) {
  // Allow deletion by author or admin
  if (!isAdmin && this.userId.toString() !== userId.toString()) {
    throw new Error('Only the message author or admin can delete this message');
  }
  
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  
  return this;
};

// Method to flag message
chatMessageSchema.methods.addFlag = function(userId, reason, description = '') {
  // Check if user already flagged this message
  const existingFlag = this.flags.find(
    flag => flag.userId.toString() === userId.toString()
  );
  
  if (existingFlag) {
    throw new Error('You have already flagged this message');
  }
  
  this.flags.push({
    userId,
    reason,
    description,
    createdAt: new Date()
  });
  
  // Auto-moderate if multiple flags
  if (this.flags.length >= 3) {
    this.moderation.status = 'pending';
  }
  
  return this;
};

// Static method to get messages for a question
chatMessageSchema.statics.getMessagesForQuestion = function(
  questionId, 
  limit = 50, 
  skip = 0, 
  includeReplies = true
) {
  const pipeline = [
    {
      $match: {
        questionId: mongoose.Types.ObjectId(questionId),
        isDeleted: false,
        'moderation.status': 'approved'
      }
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'author',
        pipeline: [
          {
            $project: {
              username: 1,
              'profile.avatar': 1,
              'profile.firstName': 1,
              'profile.lastName': 1,
              'stats.level': 1
            }
          }
        ]
      }
    },
    { $unwind: '$author' }
  ];
  
  if (includeReplies) {
    pipeline.push({
      $lookup: {
        from: 'chatmessages',
        let: { messageId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$parentId', '$$messageId'] },
              isDeleted: false,
              'moderation.status': 'approved'
            }
          },
          { $sort: { createdAt: 1 } },
          { $limit: 10 }, // Limit replies per message
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'author',
              pipeline: [
                {
                  $project: {
                    username: 1,
                    'profile.avatar': 1,
                    'profile.firstName': 1,
                    'profile.lastName': 1
                  }
                }
              ]
            }
          },
          { $unwind: '$author' }
        ],
        as: 'replies'
      }
    });
  }
  
  return this.aggregate(pipeline);
};

// Static method to get user message history
chatMessageSchema.statics.getUserMessageHistory = function(userId, limit = 50, skip = 0) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        isDeleted: false
      }
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'questions',
        localField: 'questionId',
        foreignField: '_id',
        as: 'question',
        pipeline: [
          {
            $project: {
              optionA: 1,
              optionB: 1,
              category: 1
            }
          }
        ]
      }
    },
    { $unwind: '$question' },
    {
      $project: {
        message: 1,
        createdAt: 1,
        isEdited: 1,
        reactions: 1,
        question: 1
      }
    }
  ]);
};

// Static method to get message statistics
chatMessageSchema.statics.getMessageStats = function(timeframe = 'daily') {
  const groupBy = {
    daily: {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
      day: { $dayOfMonth: '$createdAt' }
    },
    hourly: {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
      day: { $dayOfMonth: '$createdAt' },
      hour: { $hour: '$createdAt' }
    }
  };

  return this.aggregate([
    {
      $match: {
        isDeleted: false,
        'moderation.status': 'approved'
      }
    },
    {
      $group: {
        _id: groupBy[timeframe] || groupBy.daily,
        totalMessages: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        averageMessageLength: { $avg: { $strLenCP: '$message' } },
        totalReactions: { $sum: { $size: '$reactions' } }
      }
    },
    {
      $addFields: {
        uniqueUserCount: { $size: '$uniqueUsers' },
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
            hour: '$_id.hour'
          }
        }
      }
    },
    { $sort: { date: -1 } },
    { $limit: 30 }
  ]);
};

// Pre-save middleware for content moderation
chatMessageSchema.pre('save', function(next) {
  // Simple content filtering (can be enhanced with AI moderation)
  const bannedWords = ['spam', 'scam', 'fake']; // Add more as needed
  const messageContent = this.message.toLowerCase();
  
  const containsBannedWord = bannedWords.some(word => 
    messageContent.includes(word.toLowerCase())
  );
  
  if (containsBannedWord) {
    this.moderation.status = 'pending';
  }
  
  next();
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);