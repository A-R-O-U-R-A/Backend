import mongoose from 'mongoose';
import { reflectDb } from '../database/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Home Mood Check-In Schema (Quick Mood from Home Screen)
// ═══════════════════════════════════════════════════════════════════════════════

const homeMoodSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    
    // Mood index (0-4: Struggling, Meh, Okay, Good, Amazing)
    moodIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 4
    },
    
    // Mood label
    moodLabel: {
        type: String,
        required: true,
        enum: ['Struggling', 'Meh', 'Okay', 'Good', 'Amazing']
    },
    
    // Emoji representation
    moodEmoji: {
        type: String,
        required: true
    },
    
    // Optional note
    note: {
        type: String,
        default: '',
        maxlength: 500
    },
    
    // Metadata
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true,
        index: true
    }
}, {
    timestamps: false,
    collection: 'home_moods'
});

// Compound index for efficient queries
homeMoodSchema.index({ userId: 1, createdAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Routine Task Completion Schema
// ═══════════════════════════════════════════════════════════════════════════════

const routineCompletionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    
    // Task identifier
    taskId: {
        type: String,
        required: true
    },
    
    // Task category (e.g., 'track_mood', 'calm_anxiety')
    category: {
        type: String,
        required: true
    },
    
    // Task title
    title: {
        type: String,
        required: true
    },
    
    // Date completed (just the date part, no time)
    completedDate: {
        type: String, // YYYY-MM-DD format
        required: true,
        index: true
    },
    
    // Full timestamp
    completedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false,
    collection: 'routine_completions'
});

// Compound indexes
routineCompletionSchema.index({ userId: 1, completedDate: 1 });
routineCompletionSchema.index({ userId: 1, taskId: 1, completedDate: 1 }, { unique: true });

// ═══════════════════════════════════════════════════════════════════════════════
// Self-Discovery Quest Progress Schema
// ═══════════════════════════════════════════════════════════════════════════════

const questProgressSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Tests completed for current quest
    completedTests: [{
        testId: String,
        completedAt: Date,
        resultId: String // Reference to test result
    }],
    
    // Total tests required for quest
    totalRequired: {
        type: Number,
        default: 3
    },
    
    // Badge earned
    badgeEarned: {
        type: Boolean,
        default: false
    },
    
    badgeEarnedAt: {
        type: Date,
        default: null
    },
    
    // Badge type
    badgeType: {
        type: String,
        default: null
    },
    
    // Quest started at
    startedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'quest_progress'
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test Results Schema
// ═══════════════════════════════════════════════════════════════════════════════

const testResultSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    
    // Test identifier
    testId: {
        type: String,
        required: true,
        index: true
    },
    
    // Test title (for display without joining)
    testTitle: {
        type: String,
        required: true
    },
    
    // Primary score (0-100)
    primaryScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    
    // Category scores for charts
    categories: {
        type: Map,
        of: Number,
        default: {}
    },
    
    // Primary result label
    primaryLabel: {
        type: String,
        required: true
    },
    
    // Full description
    description: {
        type: String,
        default: ''
    },
    
    // List of insights
    insights: [{
        type: String
    }],
    
    // Reflection prompt/text
    reflection: {
        type: String,
        default: ''
    },
    
    // Raw answers (for re-analysis if needed)
    answers: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Completion time
    completedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    collection: 'test_results'
});

// Compound indexes
testResultSchema.index({ userId: 1, testId: 1, completedAt: -1 });
testResultSchema.index({ userId: 1, completedAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Quiz Results Schema
// ═══════════════════════════════════════════════════════════════════════════════

const quizResultSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    
    // Quiz identifier
    quizId: {
        type: String,
        required: true,
        index: true
    },
    
    // Quiz title
    quizTitle: {
        type: String,
        required: true
    },
    
    // Score
    score: {
        type: Number,
        required: true
    },
    
    // Total questions
    totalQuestions: {
        type: Number,
        required: true
    },
    
    // Result message
    resultMessage: {
        type: String,
        default: ''
    },
    
    // Answers given
    answers: [{
        questionIndex: Number,
        selectedOption: Number,
        isCorrect: Boolean
    }],
    
    // Completion time
    completedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    collection: 'quiz_results'
});

// Compound indexes
quizResultSchema.index({ userId: 1, quizId: 1, completedAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Calm Anxiety Entry Schema
// ═══════════════════════════════════════════════════════════════════════════════

const calmAnxietyEntrySchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    
    // Anxiety level before (0-10)
    anxietyLevelBefore: {
        type: Number,
        min: 0,
        max: 10,
        default: null
    },
    
    // Anxiety level after (0-10)  
    anxietyLevelAfter: {
        type: Number,
        min: 0,
        max: 10,
        default: null
    },
    
    // Reflection answers (question id -> answer text)
    reflections: [{
        questionId: {
            type: Number,
            required: true
        },
        prompt: {
            type: String,
            required: true
        },
        answer: {
            type: String,
            required: true,
            maxlength: 1000
        }
    }],
    
    // Primary trigger/concern identified
    primaryTrigger: {
        type: String,
        default: ''
    },
    
    // Whether user completed the full flow
    completedFully: {
        type: Boolean,
        default: true
    },
    
    // Duration in seconds
    durationSeconds: {
        type: Number,
        default: 0
    },
    
    // Created timestamp
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true,
        index: true
    }
}, {
    timestamps: false,
    collection: 'calm_anxiety_entries'
});

// Compound index for efficient queries
calmAnxietyEntrySchema.index({ userId: 1, createdAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// Liked Songs Schema (for Breathing/Calm page)
// ═══════════════════════════════════════════════════════════════════════════════

const likedSongSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    
    // Song identifier
    songId: {
        type: String,
        required: true
    },
    
    // Song details
    title: {
        type: String,
        required: true
    },
    
    artist: {
        type: String,
        default: 'Unknown'
    },
    
    // Audio URL
    audioUrl: {
        type: String,
        required: true
    },
    
    // Source (freesound, jamendo, etc.)
    source: {
        type: String,
        required: true
    },
    
    // Duration in seconds
    duration: {
        type: Number,
        default: 0
    },
    
    // Liked at
    likedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false,
    collection: 'liked_songs'
});

// Compound index to prevent duplicates
likedSongSchema.index({ userId: 1, songId: 1, source: 1 }, { unique: true });

// ═══════════════════════════════════════════════════════════════════════════════
// Create Models
// ═══════════════════════════════════════════════════════════════════════════════

export const HomeMood = reflectDb.model('HomeMood', homeMoodSchema);
export const RoutineCompletion = reflectDb.model('RoutineCompletion', routineCompletionSchema);
export const QuestProgress = reflectDb.model('QuestProgress', questProgressSchema);
export const TestResult = reflectDb.model('TestResult', testResultSchema);
export const QuizResult = reflectDb.model('QuizResult', quizResultSchema);
export const CalmAnxietyEntry = reflectDb.model('CalmAnxietyEntry', calmAnxietyEntrySchema);
export const LikedSong = reflectDb.model('LikedSong', likedSongSchema);
