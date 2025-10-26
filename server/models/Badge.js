const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Badge name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Badge name cannot exceed 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Badge description is required'],
    trim: true,
    maxlength: [200, 'Badge description cannot exceed 200 characters']
  },
  icon: {
    type: String,
    required: [true, 'Badge icon is required']
  },
  color: {
    type: String,
    default: '#3B82F6', // Default blue color
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format']
  },
  category: {
    type: String,
    enum: [
      'participation',
      'voting',
      'creation',
      'social',
      'streak',
      'milestone',
      'special',
      'seasonal'
    ],
    required: true
  },
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    required: true,
    default: 'common'
  },
  requirements: {
    type: {
      type: String,
      enum: [
        'vote_count',
        'question_count',
        'streak_count',
        'points_total',
        'level_reached',
        'social_actions',
        'time_based',
        'special_event'
      ],
      required: true
    },
    threshold: {
      type: Number,
      required: true,
      min: 1
    },
    timeframe: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'all_time'],
      default: 'all_time'
    },
    additionalCriteria: {
      category: String,        // for category-specific badges
      consecutive: Boolean,    // for streak badges
      percentage: Number,      // for percentage-based requirements
      socialAction: String     // for social badges (like, comment, share)
    }
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSecret: {
    type: Boolean,
    default: false // Secret badges are not visible until earned
  },
  unlockConditions: {
    startDate: Date,
    endDate: Date,
    requiredBadges: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    }],
    excludedBadges: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    }]
  },
  statistics: {
    totalEarned: {
      type: Number,
      default: 0
    },
    firstEarned: Date,
    lastEarned: Date,
    earnedBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      earnedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
badgeSchema.index({ name: 1 });
badgeSchema.index({ category: 1 });
badgeSchema.index({ rarity: 1 });
badgeSchema.index({ isActive: 1 });
badgeSchema.index({ 'requirements.type': 1 });

// Virtual for rarity score (used for sorting)
badgeSchema.virtual('rarityScore').get(function() {
  const scores = { common: 1, rare: 2, epic: 3, legendary: 4 };
  return scores[this.rarity] || 1;
});

// Static method to check if user qualifies for badge
badgeSchema.statics.checkUserQualification = async function(userId, badgeId) {
  const User = mongoose.model('User');
  const Vote = mongoose.model('Vote');
  const Question = mongoose.model('Question');
  const ChatMessage = mongoose.model('ChatMessage');
  
  const badge = await this.findById(badgeId);
  if (!badge || !badge.isActive) return false;
  
  const user = await User.findById(userId);
  if (!user) return false;
  
  // Check if user already has this badge
  if (user.stats.badges.includes(badgeId)) return false;
  
  // Check time-based unlock conditions
  const now = new Date();
  if (badge.unlockConditions.startDate && now < badge.unlockConditions.startDate) return false;
  if (badge.unlockConditions.endDate && now > badge.unlockConditions.endDate) return false;
  
  // Check required badges
  if (badge.unlockConditions.requiredBadges.length > 0) {
    const hasRequiredBadges = badge.unlockConditions.requiredBadges.every(
      reqBadgeId => user.stats.badges.includes(reqBadgeId)
    );
    if (!hasRequiredBadges) return false;
  }
  
  // Check excluded badges
  if (badge.unlockConditions.excludedBadges.length > 0) {
    const hasExcludedBadges = badge.unlockConditions.excludedBadges.some(
      excBadgeId => user.stats.badges.includes(excBadgeId)
    );
    if (hasExcludedBadges) return false;
  }
  
  // Check specific requirements
  const { type, threshold, timeframe, additionalCriteria } = badge.requirements;
  
  let currentValue = 0;
  
  switch (type) {
    case 'vote_count':
      if (timeframe === 'all_time') {
        currentValue = user.stats.votesCount;
      } else {
        // Calculate votes in timeframe
        const startDate = getTimeframeStartDate(timeframe);
        currentValue = await Vote.countDocuments({
          userId,
          createdAt: { $gte: startDate }
        });
      }
      break;
      
    case 'question_count':
      if (timeframe === 'all_time') {
        currentValue = user.stats.questionsCreated;
      } else {
        const startDate = getTimeframeStartDate(timeframe);
        currentValue = await Question.countDocuments({
          createdBy: userId,
          createdAt: { $gte: startDate }
        });
      }
      break;
      
    case 'streak_count':
      currentValue = additionalCriteria?.consecutive 
        ? user.stats.currentStreak 
        : user.stats.longestStreak;
      break;
      
    case 'points_total':
      currentValue = user.stats.points;
      break;
      
    case 'level_reached':
      currentValue = user.stats.level;
      break;
      
    case 'social_actions':
      // Count social actions like comments, reactions
      const startDate = timeframe !== 'all_time' ? getTimeframeStartDate(timeframe) : new Date(0);
      currentValue = await ChatMessage.countDocuments({
        userId,
        createdAt: { $gte: startDate }
      });
      break;
      
    default:
      return false;
  }
  
  return currentValue >= threshold;
};

// Static method to award badge to user
badgeSchema.statics.awardToUser = async function(userId, badgeId) {
  const User = mongoose.model('User');
  
  const badge = await this.findById(badgeId);
  const user = await User.findById(userId);
  
  if (!badge || !user) return false;
  
  // Check if user already has badge
  if (user.stats.badges.includes(badgeId)) return false;
  
  // Award badge
  user.stats.badges.push(badgeId);
  user.stats.points += badge.points;
  
  // Update badge statistics
  badge.statistics.totalEarned += 1;
  badge.statistics.lastEarned = new Date();
  if (!badge.statistics.firstEarned) {
    badge.statistics.firstEarned = new Date();
  }
  badge.statistics.earnedBy.push({
    userId,
    earnedAt: new Date()
  });
  
  await user.save();
  await badge.save();
  
  return true;
};

// Static method to get user's badges
badgeSchema.statics.getUserBadges = function(userId) {
  return this.aggregate([
    {
      $lookup: {
        from: 'users',
        let: { badgeId: '$_id' },
        pipeline: [
          {
            $match: {
              _id: mongoose.Types.ObjectId(userId),
              'stats.badges': { $in: ['$$badgeId'] }
            }
          }
        ],
        as: 'userHasBadge'
      }
    },
    {
      $match: {
        userHasBadge: { $ne: [] }
      }
    },
    {
      $addFields: {
        earnedAt: {
          $arrayElemAt: [
            {
              $map: {
                input: {
                  $filter: {
                    input: '$statistics.earnedBy',
                    cond: { $eq: ['$$this.userId', mongoose.Types.ObjectId(userId)] }
                  }
                },
                as: 'earned',
                in: '$$earned.earnedAt'
              }
            },
            0
          ]
        }
      }
    },
    { $sort: { earnedAt: -1 } },
    {
      $project: {
        name: 1,
        description: 1,
        icon: 1,
        color: 1,
        category: 1,
        rarity: 1,
        points: 1,
        earnedAt: 1
      }
    }
  ]);
};

// Static method to get available badges for user
badgeSchema.statics.getAvailableBadges = function(userId) {
  return this.aggregate([
    {
      $match: {
        isActive: true,
        isSecret: false
      }
    },
    {
      $lookup: {
        from: 'users',
        let: { badgeId: '$_id' },
        pipeline: [
          {
            $match: {
              _id: mongoose.Types.ObjectId(userId),
              'stats.badges': { $in: ['$$badgeId'] }
            }
          }
        ],
        as: 'userHasBadge'
      }
    },
    {
      $match: {
        userHasBadge: { $eq: [] }
      }
    },
    {
      $project: {
        name: 1,
        description: 1,
        icon: 1,
        color: 1,
        category: 1,
        rarity: 1,
        points: 1,
        requirements: 1
      }
    },
    { $sort: { category: 1, rarityScore: 1 } }
  ]);
};

// Helper function to get start date for timeframe
function getTimeframeStartDate(timeframe) {
  const now = new Date();
  switch (timeframe) {
    case 'daily':
      now.setHours(0, 0, 0, 0);
      return now;
    case 'weekly':
      const dayOfWeek = now.getDay();
      now.setDate(now.getDate() - dayOfWeek);
      now.setHours(0, 0, 0, 0);
      return now;
    case 'monthly':
      now.setDate(1);
      now.setHours(0, 0, 0, 0);
      return now;
    default:
      return new Date(0);
  }
}

module.exports = mongoose.model('Badge', badgeSchema);