import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { userDb } from '../database/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// User Schema - Production Grade Multi-Auth Support
// ═══════════════════════════════════════════════════════════════════════════════

const userSchema = new mongoose.Schema({
  // ─────────────────────────────────────────────────────────────────────────────
  // Authentication Fields
  // ─────────────────────────────────────────────────────────────────────────────
  
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  
  // Password (for email auth only - hashed with bcrypt)
  password: {
    type: String,
    select: false, // Never return password in queries by default
    minlength: [8, 'Password must be at least 8 characters']
  },
  
  // OAuth Provider IDs
  googleId: {
    type: String,
    sparse: true,
    index: true
  },
  facebookId: {
    type: String,
    sparse: true,
    index: true
  },
  
  // Auth provider used for registration
  authProvider: {
    type: String,
    enum: ['email', 'google', 'facebook'],
    required: true,
    default: 'email'
  },
  
  // Email verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  
  // Password reset
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Profile Information
  // ─────────────────────────────────────────────────────────────────────────────
  
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Display name cannot exceed 100 characters']
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  profilePicture: {
    type: String,
    default: null
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // App Preferences
  // ─────────────────────────────────────────────────────────────────────────────
  
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    notifications: {
      dailyReminder: { type: Boolean, default: true },
      reminderTime: { type: String, default: '09:00' },
      weeklyInsights: { type: Boolean, default: true }
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Premium Subscription
  // ─────────────────────────────────────────────────────────────────────────────
  
  subscription: {
    isPremium: { type: Boolean, default: false },
    plan: {
      type: String,
      enum: ['free', 'monthly', 'yearly', 'lifetime'],
      default: 'free'
    },
    expiresAt: { type: Date, default: null },
    stripeCustomerId: { type: String, select: false },
    stripeSubscriptionId: { type: String, select: false }
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Reflect Assessment Data
  // ─────────────────────────────────────────────────────────────────────────────
  
  reflect: {
    completedAssessments: [{
      testId: String,
      testName: String,
      score: Number,
      completedAt: Date
    }],
    personalityProfile: {
      type: Map,
      of: Number,
      default: {}
    },
    lastAssessmentDate: Date
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Session & Security
  // ─────────────────────────────────────────────────────────────────────────────
  
  sessions: {
    lastLogin: { type: Date, default: Date.now },
    loginCount: { type: Number, default: 1 },
    lastIp: { type: String, select: false },
    lastUserAgent: { type: String, select: false },
    deviceTokens: [{
      token: String,
      platform: { type: String, enum: ['android', 'ios'] },
      lastUsed: Date
    }]
  },
  
  // Refresh tokens for JWT rotation
  refreshTokens: [{
    token: { type: String, select: false },
    expiresAt: Date,
    createdAt: { type: Date, default: Date.now },
    userAgent: String,
    ip: String
  }],
  
  // Account security
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockUntil: {
    type: Date,
    select: false
  },
  
  // Account status
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Timestamps
  // ─────────────────────────────────────────────────────────────────────────────
  
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'users',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Indexes
// ═══════════════════════════════════════════════════════════════════════════════

userSchema.index({ 'sessions.lastLogin': -1 });
userSchema.index({ 'subscription.isPremium': 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Virtuals
// ═══════════════════════════════════════════════════════════════════════════════

userSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.displayName;
});

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pre-save Middleware - Password Hashing
// ═══════════════════════════════════════════════════════════════════════════════

userSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  
  // Only hash password if it's modified
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  try {
    // Generate salt with cost factor 12 (production-grade)
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Instance Methods
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compare password for authentication
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Convert to safe JSON (public profile)
 */
userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id.toString(),
    email: this.email,
    displayName: this.displayName,
    firstName: this.firstName,
    lastName: this.lastName,
    profilePicture: this.profilePicture,
    authProvider: this.authProvider,
    isEmailVerified: this.isEmailVerified,
    preferences: this.preferences,
    subscription: {
      isPremium: this.subscription?.isPremium || false,
      plan: this.subscription?.plan || 'free',
      expiresAt: this.subscription?.expiresAt
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

/**
 * Check if subscription is active
 */
userSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription?.isPremium) return false;
  if (this.subscription.plan === 'lifetime') return true;
  if (!this.subscription.expiresAt) return false;
  return new Date() < this.subscription.expiresAt;
};

/**
 * Record successful login
 */
userSchema.methods.recordLogin = async function(ip, userAgent) {
  this.sessions.lastLogin = new Date();
  this.sessions.loginCount += 1;
  this.sessions.lastIp = ip;
  this.sessions.lastUserAgent = userAgent;
  this.failedLoginAttempts = 0;
  this.lockUntil = undefined;
  await this.save();
};

/**
 * Increment failed login attempts
 */
userSchema.methods.incFailedLogins = async function() {
  // Increment failed attempts
  this.failedLoginAttempts += 1;
  
  // Lock account after 5 failed attempts for 30 minutes
  if (this.failedLoginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  await this.save();
};

/**
 * Add refresh token
 */
userSchema.methods.addRefreshToken = async function(token, userAgent, ip) {
  // Limit to 5 active refresh tokens per user
  if (this.refreshTokens.length >= 5) {
    this.refreshTokens.shift(); // Remove oldest
  }
  
  this.refreshTokens.push({
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    userAgent,
    ip
  });
  
  await this.save();
};

/**
 * Remove refresh token
 */
userSchema.methods.removeRefreshToken = async function(token) {
  this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
  await this.save();
};

/**
 * Clean expired refresh tokens
 */
userSchema.methods.cleanExpiredTokens = async function() {
  const now = new Date();
  this.refreshTokens = this.refreshTokens.filter(t => t.expiresAt > now);
  await this.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
// Static Methods
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find user by email with password
 */
userSchema.statics.findByEmailWithPassword = function(email) {
  return this.findOne({ email: email.toLowerCase() }).select('+password +failedLoginAttempts +lockUntil');
};

/**
 * Find or create from Google OAuth
 */
userSchema.statics.findOrCreateFromGoogle = async function(profile) {
  // Check if user exists with this Google ID
  let user = await this.findOne({ googleId: profile.sub });
  
  if (user) {
    // Update profile picture if changed
    if (profile.picture && profile.picture !== user.profilePicture) {
      user.profilePicture = profile.picture;
      await user.save();
    }
    return { user, isNewUser: false };
  }
  
  // Check if email already exists (link accounts)
  user = await this.findOne({ email: profile.email.toLowerCase() });
  
  if (user) {
    // Link Google account to existing user
    user.googleId = profile.sub;
    if (!user.profilePicture && profile.picture) {
      user.profilePicture = profile.picture;
    }
    await user.save();
    return { user, isNewUser: false };
  }
  
  // Create new user
  user = await this.create({
    email: profile.email.toLowerCase(),
    googleId: profile.sub,
    displayName: profile.name,
    firstName: profile.given_name,
    lastName: profile.family_name,
    profilePicture: profile.picture,
    authProvider: 'google',
    isEmailVerified: profile.email_verified || false
  });
  
  return { user, isNewUser: true };
};

/**
 * Find or create from Facebook OAuth
 */
userSchema.statics.findOrCreateFromFacebook = async function(profile) {
  // Check if user exists with this Facebook ID
  let user = await this.findOne({ facebookId: profile.id });
  
  if (user) {
    // Update profile picture if needed
    if (profile.picture && profile.picture !== user.profilePicture) {
      user.profilePicture = profile.picture;
      await user.save();
    }
    return { user, isNewUser: false };
  }
  
  // Check if email already exists
  if (profile.email) {
    user = await this.findOne({ email: profile.email.toLowerCase() });
    
    if (user) {
      // Link Facebook account to existing user
      user.facebookId = profile.id;
      if (!user.profilePicture && profile.picture) {
        user.profilePicture = profile.picture;
      }
      await user.save();
      return { user, isNewUser: false };
    }
  }
  
  // Create new user
  user = await this.create({
    email: profile.email?.toLowerCase() || `fb_${profile.id}@aroura.app`,
    facebookId: profile.id,
    displayName: profile.name,
    firstName: profile.first_name,
    lastName: profile.last_name,
    profilePicture: profile.picture,
    authProvider: 'facebook',
    isEmailVerified: false
  });
  
  return { user, isNewUser: true };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Create Model
// ═══════════════════════════════════════════════════════════════════════════════

export const User = userDb.model('User', userSchema);

export default User;
