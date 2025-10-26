const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['user', 'ai'],
    required: true,
    default: 'user'
  },
  optionA: {
    type: String,
    required: [true, 'Option A is required'],
    trim: true,
    minlength: [10, 'Option A must be at least 10 characters long'],
    maxlength: [200, 'Option A cannot exceed 200 characters']
  },
  optionB: {
    type: String,
    required: [true, 'Option B is required'],
    trim: true,
    minlength: [10, 'Option B must be at least 10 characters long'],
    maxlength: [200, 'Option B cannot exceed 200 characters']
  },
  category: {
    type: String,
    enum: [
      'lifestyle',
      'career',
      'relationships',
      'entertainment',
      'food',
      'travel',
      'technology',
      'sports',
      'hypothetical',
      'moral',
      'funny',
      'serious',
      'random'
    ],
    required: true,
    default: 'random'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [20, 'Tag cannot exceed 20 characters']
  }],
  difficulty: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  votes: {
    optionA: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      votedAt: {
        type: Date,
        default: Date.now
      },
      decisionTime: {
        type: Number, // in milliseconds
        default: 0
      }
    }],
    optionB: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      votedAt: {
        type: Date,
        default: Date.now
      },
      decisionTime: {
        type: Number, // in milliseconds
        default: 0
      }
    }]
  },
  stats: {
    totalVotes: {
      type: Number,
      default: 0
    },
    optionAPercentage: {
      type: Number,
      default: 0
    },
    optionBPercentage: {
      type: Number,
      default: 0
    },
    engagementRate: {
      type: Number,
      default: 0
    },
    averageDecisionTime: {
      type: Number,
      default: 0
    },
    views: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    comments: {
      type: Number,
      default: 0
    }
  },
  aiMetadata: {
    prompt: String,
    model: String,
    generatedAt: Date,
    tokens: Number,
    cost: Number
  },
  moderation: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    moderatedAt: Date,
    reason: String,
    flags: [{
      type: String,
      enum: ['inappropriate', 'spam', 'offensive', 'duplicate', 'low-quality']
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: null // null means never expires
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
questionSchema.index({ createdBy: 1 });
questionSchema.index({ category: 1 });
questionSchema.index({ tags: 1 });
questionSchema.index({ createdAt: -1 });
questionSchema.index({ 'stats.totalVotes': -1 });
questionSchema.index({ 'stats.engagementRate': -1 });
questionSchema.index({ isActive: 1, 'moderation.status': 1 });
questionSchema.index({ type: 1 });
questionSchema.index({ isFeatured: 1 });

// Compound indexes
questionSchema.index({ category: 1, createdAt: -1 });
questionSchema.index({ isActive: 1, 'moderation.status': 1, createdAt: -1 });

// Virtual for total vote count
questionSchema.virtual('totalVotes').get(function() {
  return this.votes.optionA.length + this.votes.optionB.length;
});

// Virtual for vote percentages
questionSchema.virtual('votePercentages').get(function() {
  const total = this.totalVotes;
  if (total === 0) {
    return { optionA: 0, optionB: 0 };
  }
  
  const optionACount = this.votes.optionA.length;
  const optionBCount = this.votes.optionB.length;
  
  return {
    optionA: Math.round((optionACount / total) * 100),
    optionB: Math.round((optionBCount / total) * 100)
  };
});

// Virtual for checking if user has voted
questionSchema.virtual('hasUserVoted').get(function() {
  if (!this._currentUserId) return null;
  
  const userIdStr = this._currentUserId.toString();
  const votedA = this.votes.optionA.some(vote => vote.userId.toString() === userIdStr);
  const votedB = this.votes.optionB.some(vote => vote.userId.toString() === userIdStr);
  
  if (votedA) return 'optionA';
  if (votedB) return 'optionB';
  return null;
});

// Method to check if user has voted
questionSchema.methods.hasUserVoted = function(userId) {
  const userIdStr = userId.toString();
  const votedA = this.votes.optionA.some(vote => vote.userId.toString() === userIdStr);
  const votedB = this.votes.optionB.some(vote => vote.userId.toString() === userIdStr);
  
  if (votedA) return 'optionA';
  if (votedB) return 'optionB';
  return null;
};

// Method to add vote
questionSchema.methods.addVote = function(userId, option, decisionTime = 0) {
  // Check if user already voted
  const existingVote = this.hasUserVoted(userId);
  if (existingVote) {
    throw new Error('User has already voted on this question');
  }
  
  // Add vote
  const voteData = {
    userId,
    votedAt: new Date(),
    decisionTime
  };
  
  if (option === 'optionA') {
    this.votes.optionA.push(voteData);
  } else if (option === 'optionB') {
    this.votes.optionB.push(voteData);
  } else {
    throw new Error('Invalid vote option');
  }
  
  // Update stats
  this.updateStats();
  
  return this;
};

// Method to remove vote (for vote changes)
questionSchema.methods.removeVote = function(userId) {
  const userIdStr = userId.toString();
  
  // Remove from optionA
  this.votes.optionA = this.votes.optionA.filter(
    vote => vote.userId.toString() !== userIdStr
  );
  
  // Remove from optionB
  this.votes.optionB = this.votes.optionB.filter(
    vote => vote.userId.toString() !== userIdStr
  );
  
  // Update stats
  this.updateStats();
  
  return this;
};

// Method to update statistics
questionSchema.methods.updateStats = function() {
  const totalVotes = this.votes.optionA.length + this.votes.optionB.length;
  
  this.stats.totalVotes = totalVotes;
  
  if (totalVotes > 0) {
    this.stats.optionAPercentage = Math.round((this.votes.optionA.length / totalVotes) * 100);
    this.stats.optionBPercentage = Math.round((this.votes.optionB.length / totalVotes) * 100);
    
    // Calculate average decision time
    const allVotes = [...this.votes.optionA, ...this.votes.optionB];
    const totalDecisionTime = allVotes.reduce((sum, vote) => sum + (vote.decisionTime || 0), 0);
    this.stats.averageDecisionTime = totalDecisionTime / totalVotes;
    
    // Calculate engagement rate (views to votes ratio)
    if (this.stats.views > 0) {
      this.stats.engagementRate = (totalVotes / this.stats.views) * 100;
    }
  } else {
    this.stats.optionAPercentage = 0;
    this.stats.optionBPercentage = 0;
    this.stats.averageDecisionTime = 0;
    this.stats.engagementRate = 0;
  }
};

// Method to increment views
questionSchema.methods.incrementViews = function() {
  this.stats.views += 1;
  this.updateStats();
};

// Method to increment shares
questionSchema.methods.incrementShares = function() {
  this.stats.shares += 1;
};

// Static method to get trending questions
questionSchema.statics.getTrending = function(limit = 10, timeframe = 24) {
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - timeframe);
  
  return this.aggregate([
    {
      $match: {
        isActive: true,
        'moderation.status': 'approved',
        createdAt: { $gte: startTime }
      }
    },
    {
      $addFields: {
        trendingScore: {
          $add: [
            { $multiply: ['$stats.totalVotes', 0.4] },
            { $multiply: ['$stats.views', 0.2] },
            { $multiply: ['$stats.comments', 0.3] },
            { $multiply: ['$stats.shares', 0.1] }
          ]
        }
      }
    },
    { $sort: { trendingScore: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
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
  ]);
};

// Static method to get random questions
questionSchema.statics.getRandomQuestions = function(limit = 1, category = null, excludeIds = []) {
  const match = {
    isActive: true,
    'moderation.status': 'approved',
    _id: { $nin: excludeIds }
  };
  
  if (category) {
    match.category = category;
  }
  
  return this.aggregate([
    { $match: match },
    { $sample: { size: limit } },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
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
  ]);
};

// Pre-save middleware
questionSchema.pre('save', function(next) {
  // Update stats before saving
  this.updateStats();
  
  // Auto-approve user-generated questions from verified users
  if (this.type === 'user' && this.moderation.status === 'pending') {
    // This would check if user is verified/trusted
    // For now, auto-approve all user questions
    this.moderation.status = 'approved';
    this.moderation.moderatedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Question', questionSchema);