const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  choice: {
    type: String,
    enum: ['optionA', 'optionB'],
    required: true
  },
  decisionTime: {
    type: Number, // in milliseconds
    default: 0,
    min: 0
  },
  confidence: {
    type: Number, // 1-5 scale
    min: 1,
    max: 5,
    default: 3
  },
  sessionId: {
    type: String, // for tracking user sessions
    required: false
  },
  userAgent: {
    type: String,
    required: false
  },
  ipAddress: {
    type: String,
    required: false
  },
  metadata: {
    platform: String, // web, mobile, etc.
    device: String,   // desktop, mobile, tablet
    browser: String,
    referrer: String
  }
}, {
  timestamps: true
});

// Indexes for performance
voteSchema.index({ userId: 1, questionId: 1 }, { unique: true }); // One vote per user per question
voteSchema.index({ questionId: 1 });
voteSchema.index({ userId: 1 });
voteSchema.index({ createdAt: -1 });
voteSchema.index({ choice: 1 });

// Compound indexes for analytics
voteSchema.index({ questionId: 1, choice: 1 });
voteSchema.index({ userId: 1, createdAt: -1 });
voteSchema.index({ questionId: 1, createdAt: -1 });

// Static method to get user voting history
voteSchema.statics.getUserVotingHistory = function(userId, limit = 50, skip = 0) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
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
              category: 1,
              'stats.totalVotes': 1,
              createdAt: 1
            }
          }
        ]
      }
    },
    { $unwind: '$question' },
    {
      $project: {
        choice: 1,
        decisionTime: 1,
        confidence: 1,
        createdAt: 1,
        question: 1
      }
    }
  ]);
};

// Static method to get question voting analytics
voteSchema.statics.getQuestionAnalytics = function(questionId) {
  return this.aggregate([
    { $match: { questionId: mongoose.Types.ObjectId(questionId) } },
    {
      $group: {
        _id: '$questionId',
        totalVotes: { $sum: 1 },
        optionAVotes: {
          $sum: { $cond: [{ $eq: ['$choice', 'optionA'] }, 1, 0] }
        },
        optionBVotes: {
          $sum: { $cond: [{ $eq: ['$choice', 'optionB'] }, 1, 0] }
        },
        averageDecisionTime: { $avg: '$decisionTime' },
        averageConfidence: { $avg: '$confidence' },
        fastestDecision: { $min: '$decisionTime' },
        slowestDecision: { $max: '$decisionTime' },
        votesOverTime: {
          $push: {
            timestamp: '$createdAt',
            choice: '$choice',
            decisionTime: '$decisionTime'
          }
        }
      }
    },
    {
      $addFields: {
        optionAPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$optionAVotes', '$totalVotes'] }, 100] },
            1
          ]
        },
        optionBPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$optionBVotes', '$totalVotes'] }, 100] },
            1
          ]
        }
      }
    }
  ]);
};

// Static method to get voting trends
voteSchema.statics.getVotingTrends = function(timeframe = 'daily', limit = 30) {
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
    },
    monthly: {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' }
    }
  };

  return this.aggregate([
    {
      $group: {
        _id: groupBy[timeframe] || groupBy.daily,
        totalVotes: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        averageDecisionTime: { $avg: '$decisionTime' },
        averageConfidence: { $avg: '$confidence' }
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
    { $limit: limit },
    {
      $project: {
        _id: 0,
        date: 1,
        totalVotes: 1,
        uniqueUserCount: 1,
        averageDecisionTime: { $round: ['$averageDecisionTime', 0] },
        averageConfidence: { $round: ['$averageConfidence', 1] }
      }
    }
  ]);
};

// Static method to get user voting patterns
voteSchema.statics.getUserVotingPatterns = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalVotes: { $sum: 1 },
        averageDecisionTime: { $avg: '$decisionTime' },
        averageConfidence: { $avg: '$confidence' },
        fastestDecision: { $min: '$decisionTime' },
        slowestDecision: { $max: '$decisionTime' },
        optionAPreference: {
          $sum: { $cond: [{ $eq: ['$choice', 'optionA'] }, 1, 0] }
        },
        optionBPreference: {
          $sum: { $cond: [{ $eq: ['$choice', 'optionB'] }, 1, 0] }
        },
        votingByHour: {
          $push: { $hour: '$createdAt' }
        },
        votingByDayOfWeek: {
          $push: { $dayOfWeek: '$createdAt' }
        }
      }
    },
    {
      $addFields: {
        optionAPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$optionAPreference', '$totalVotes'] }, 100] },
            1
          ]
        },
        optionBPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$optionBPreference', '$totalVotes'] }, 100] },
            1
          ]
        }
      }
    }
  ]);
};

// Static method to get category preferences
voteSchema.statics.getCategoryPreferences = function(userId = null) {
  const matchStage = userId ? { userId: mongoose.Types.ObjectId(userId) } : {};
  
  return this.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'questions',
        localField: 'questionId',
        foreignField: '_id',
        as: 'question'
      }
    },
    { $unwind: '$question' },
    {
      $group: {
        _id: '$question.category',
        totalVotes: { $sum: 1 },
        averageDecisionTime: { $avg: '$decisionTime' },
        averageConfidence: { $avg: '$confidence' }
      }
    },
    { $sort: { totalVotes: -1 } },
    {
      $project: {
        category: '$_id',
        totalVotes: 1,
        averageDecisionTime: { $round: ['$averageDecisionTime', 0] },
        averageConfidence: { $round: ['$averageConfidence', 1] },
        _id: 0
      }
    }
  ]);
};

// Method to calculate vote streaks
voteSchema.statics.calculateVoteStreak = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        count: { $sum: 1 },
        date: { $first: '$createdAt' }
      }
    },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: null,
        days: { $push: '$_id' },
        dates: { $push: '$date' }
      }
    }
  ]);
};

module.exports = mongoose.model('Vote', voteSchema);