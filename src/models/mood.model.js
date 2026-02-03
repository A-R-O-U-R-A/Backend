import mongoose from 'mongoose';
import { reflectDb } from '../database/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Feeling Sub-Schema
// ═══════════════════════════════════════════════════════════════════════════════

const feelingSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  isPositive: {
    type: Boolean,
    required: true,
  },
}, { _id: false });

// ═══════════════════════════════════════════════════════════════════════════════
// Activity Sub-Schema
// ═══════════════════════════════════════════════════════════════════════════════

const activitySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    default: '',
  },
}, { _id: false });

// ═══════════════════════════════════════════════════════════════════════════════
// Mood Entry Schema
// ═══════════════════════════════════════════════════════════════════════════════

const moodEntrySchema = new mongoose.Schema({
  // Reference to User (stored in separate DB)
  userId: {
    type: String,
    required: true,
    index: true,
  },
  
  // Journal Note
  note: {
    type: String,
    default: '',
    maxlength: 2000,
    trim: true,
  },
  
  // Mood Level (0.0 = Very Sad to 1.0 = Very Happy)
  moodLevel: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    index: true,
  },
  
  // Selected Feelings
  feelings: {
    type: [feelingSchema],
    default: [],
  },
  
  // Selected Activities
  activities: {
    type: [activitySchema],
    default: [],
  },
  
  // Optional Photo Attachment (Cloudinary URL)
  photoUri: {
    type: String,
    default: null,
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Optional: AI-generated insights
  insights: {
    summary: {
      type: String,
      default: null,
    },
    suggestions: [{
      type: String,
    }],
    generatedAt: Date,
  },
}, {
  timestamps: true,
  collection: 'mood_entries',
});

// ═══════════════════════════════════════════════════════════════════════════════
// Compound Indexes
// ═══════════════════════════════════════════════════════════════════════════════

// Efficient queries for user mood history
moodEntrySchema.index({ userId: 1, createdAt: -1 });

// Range queries for statistics
moodEntrySchema.index({ userId: 1, moodLevel: 1, createdAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Virtual: Emoji representation of mood
// ═══════════════════════════════════════════════════════════════════════════════

moodEntrySchema.virtual('moodEmoji').get(function() {
  if (this.moodLevel >= 0.8) return '😄';
  if (this.moodLevel >= 0.6) return '🙂';
  if (this.moodLevel >= 0.4) return '😐';
  if (this.moodLevel >= 0.2) return '😔';
  return '😢';
});

// ═══════════════════════════════════════════════════════════════════════════════
// Instance Methods
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert to client-safe JSON
 */
moodEntrySchema.methods.toClientJSON = function() {
  return {
    id: this._id.toString(),
    note: this.note,
    moodLevel: this.moodLevel,
    moodEmoji: this.moodEmoji,
    feelings: this.feelings,
    activities: this.activities,
    photoUri: this.photoUri,
    insights: this.insights,
    createdAt: this.createdAt.toISOString(),
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Static Methods
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get mood statistics for a user
 */
moodEntrySchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        averageMood: { $avg: '$moodLevel' },
        minMood: { $min: '$moodLevel' },
        maxMood: { $max: '$moodLevel' },
        moodStdDev: { $stdDevPop: '$moodLevel' },
      },
    },
  ]);
  
  return stats[0] || {
    totalEntries: 0,
    averageMood: null,
    minMood: null,
    maxMood: null,
    moodStdDev: null,
  };
};

/**
 * Get most common feelings for a user
 */
moodEntrySchema.statics.getTopFeelings = async function(userId, limit = 5) {
  const result = await this.aggregate([
    { $match: { userId } },
    { $unwind: '$feelings' },
    {
      $group: {
        _id: '$feelings.label',
        count: { $sum: 1 },
        isPositive: { $first: '$feelings.isPositive' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $project: {
        label: '$_id',
        count: 1,
        isPositive: 1,
        _id: 0,
      },
    },
  ]);
  
  return result;
};

/**
 * Get mood trend (daily averages)
 */
moodEntrySchema.statics.getMoodTrend = async function(userId, days = 14) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const trend = await this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        averageMood: { $avg: '$moodLevel' },
        entryCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: '$_id',
        averageMood: { $round: ['$averageMood', 2] },
        entryCount: 1,
        _id: 0,
      },
    },
  ]);
  
  return trend;
};

/**
 * Get entries count per month (for streak/consistency tracking)
 */
moodEntrySchema.statics.getMonthlyActivity = async function(userId, months = 6) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const activity = await this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        count: { $sum: 1 },
        averageMood: { $avg: '$moodLevel' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);
  
  return activity;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Pre-save Middleware
// ═══════════════════════════════════════════════════════════════════════════════

moodEntrySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Create Model on Reflect Database Connection
// ═══════════════════════════════════════════════════════════════════════════════

export const MoodEntry = reflectDb.model('MoodEntry', moodEntrySchema);

export default MoodEntry;
