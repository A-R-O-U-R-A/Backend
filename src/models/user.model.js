import mongoose from 'mongoose';
import { userDb } from '../database/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// User Schema
// ═══════════════════════════════════════════════════════════════════════════════

const userSchema = new mongoose.Schema({
  // Google OAuth Fields
  googleId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  
  // Profile Information
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  profilePicture: {
    type: String,
    default: null,
  },
  
  // App Settings
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    notifications: {
      dailyReminder: {
        type: Boolean,
        default: true,
      },
      reminderTime: {
        type: String, // Format: "HH:mm"
        default: '09:00',
      },
      weeklyInsights: {
        type: Boolean,
        default: true,
      },
    },
    language: {
      type: String,
      default: 'en',
    },
  },
  
  // Premium Features
  subscription: {
    isPremium: {
      type: Boolean,
      default: false,
    },
    plan: {
      type: String,
      enum: ['free', 'monthly', 'yearly', 'lifetime'],
      default: 'free',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    purchaseToken: {
      type: String,
      default: null,
    },
  },
  
  // Reflect Assessment Data
  reflect: {
    completedAssessments: [{
      testId: String,
      testName: String,
      score: Number,
      completedAt: Date,
    }],
    personalityProfile: {
      type: Map,
      of: Number,
      default: {},
    },
    lastAssessmentDate: Date,
  },
  
  // Session Tracking
  sessions: {
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    loginCount: {
      type: Number,
      default: 1,
    },
    deviceTokens: [{
      token: String,
      platform: {
        type: String,
        enum: ['android', 'ios'],
      },
      lastUsed: Date,
    }],
  },
  
  // Account Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  collection: 'users',
});

// ═══════════════════════════════════════════════════════════════════════════════
// Indexes
// ═══════════════════════════════════════════════════════════════════════════════

userSchema.index({ 'sessions.lastLogin': -1 });
userSchema.index({ 'subscription.isPremium': 1 });
userSchema.index({ createdAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Instance Methods
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert user to safe JSON (hide sensitive fields)
 */
userSchema.methods.toSafeJSON = function() {
  return {
    id: this._id.toString(),
    googleId: this.googleId,
    email: this.email,
    displayName: this.displayName,
    firstName: this.firstName,
    lastName: this.lastName,
    profilePicture: this.profilePicture,
    preferences: this.preferences,
    subscription: {
      isPremium: this.subscription.isPremium,
      plan: this.subscription.plan,
      expiresAt: this.subscription.expiresAt,
    },
    reflect: {
      completedAssessments: this.reflect?.completedAssessments?.length || 0,
      lastAssessmentDate: this.reflect?.lastAssessmentDate,
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

/**
 * Check if subscription is active
 */
userSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription.isPremium) return false;
  if (this.subscription.plan === 'lifetime') return true;
  if (!this.subscription.expiresAt) return false;
  return new Date() < this.subscription.expiresAt;
};

/**
 * Record login
 */
userSchema.methods.recordLogin = async function() {
  this.sessions.lastLogin = new Date();
  this.sessions.loginCount += 1;
  await this.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
// Static Methods
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find or create user from Google OAuth data
 */
userSchema.statics.findOrCreateFromGoogle = async function(googleProfile) {
  let user = await this.findOne({ googleId: googleProfile.sub });
  
  if (!user) {
    // Create new user
    user = await this.create({
      googleId: googleProfile.sub,
      email: googleProfile.email,
      displayName: googleProfile.name,
      firstName: googleProfile.given_name,
      lastName: googleProfile.family_name,
      profilePicture: googleProfile.picture,
    });
  } else {
    // Update existing user's profile picture if changed
    if (googleProfile.picture !== user.profilePicture) {
      user.profilePicture = googleProfile.picture;
      await user.save();
    }
    await user.recordLogin();
  }
  
  return user;
};

/**
 * Find user by email
 */
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// ═══════════════════════════════════════════════════════════════════════════════
// Pre-save Middleware
// ═══════════════════════════════════════════════════════════════════════════════

userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Create Model on User Database Connection
// ═══════════════════════════════════════════════════════════════════════════════

export const User = userDb.model('User', userSchema);

export default User;
