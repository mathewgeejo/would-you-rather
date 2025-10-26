const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  password: {
    type: String,
    required: function() {
      return !this.oauth.google && !this.oauth.github;
    },
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    avatar: {
      type: String,
      default: null
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      trim: true
    },
    socialLinks: {
      twitter: String,
      instagram: String,
      linkedin: String,
      website: String
    },
    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true
      },
      pushNotifications: {
        type: Boolean,
        default: true
      },
      publicProfile: {
        type: Boolean,
        default: true
      }
    }
  },
  stats: {
    questionsCreated: {
      type: Number,
      default: 0
    },
    votesCount: {
      type: Number,
      default: 0
    },
    points: {
      type: Number,
      default: 0
    },
    currentStreak: {
      type: Number,
      default: 0
    },
    longestStreak: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    badges: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    }],
    level: {
      type: Number,
      default: 1
    },
    experience: {
      type: Number,
      default: 0
    }
  },
  oauth: {
    google: {
      id: String,
      email: String
    },
    github: {
      id: String,
      username: String
    }
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'oauth.google.id': 1 });
userSchema.index({ 'oauth.github.id': 1 });
userSchema.index({ 'stats.points': -1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('profile.fullName').get(function() {
  return `${this.profile.firstName || ''} ${this.profile.lastName || ''}`.trim() || this.username;
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method to check password
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Instance method to add points and check for level up
userSchema.methods.addPoints = function(points) {
  this.stats.points += points;
  this.stats.experience += points;
  
  // Level calculation: level = floor(sqrt(experience / 100)) + 1
  const newLevel = Math.floor(Math.sqrt(this.stats.experience / 100)) + 1;
  
  if (newLevel > this.stats.level) {
    this.stats.level = newLevel;
    return { levelUp: true, newLevel };
  }
  
  return { levelUp: false, newLevel };
};

// Instance method to update streak
userSchema.methods.updateStreak = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastActivity = new Date(this.stats.lastActivity);
  lastActivity.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 0) {
    // Same day, no streak change
    return this.stats.currentStreak;
  } else if (daysDiff === 1) {
    // Next day, increment streak
    this.stats.currentStreak += 1;
    if (this.stats.currentStreak > this.stats.longestStreak) {
      this.stats.longestStreak = this.stats.currentStreak;
    }
  } else {
    // Gap in activity, reset streak
    this.stats.currentStreak = 1;
  }
  
  this.stats.lastActivity = new Date();
  return this.stats.currentStreak;
};

// Static method to get leaderboard
userSchema.statics.getLeaderboard = function(limit = 10, period = 'all') {
  const match = { isActive: true };
  
  if (period !== 'all') {
    const periodMap = {
      'daily': 1,
      'weekly': 7,
      'monthly': 30
    };
    
    const days = periodMap[period] || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    match.createdAt = { $gte: startDate };
  }
  
  return this.aggregate([
    { $match: match },
    {
      $project: {
        username: 1,
        'profile.avatar': 1,
        'profile.fullName': 1,
        'stats.points': 1,
        'stats.level': 1,
        'stats.questionsCreated': 1,
        'stats.votesCount': 1,
        'stats.currentStreak': 1
      }
    },
    { $sort: { 'stats.points': -1 } },
    { $limit: limit },
    {
      $addFields: {
        rank: { $add: [{ $indexOfArray: [{ $range: [0, limit] }, '$_id'] }, 1] }
      }
    }
  ]);
};

module.exports = mongoose.model('User', userSchema);