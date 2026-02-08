/**
 * A.R.O.U.R.A Chat Models
 * 
 * MongoDB schemas for chat conversations and messages
 * Optimized for real-time, scalable chat with AI personas
 */

import mongoose from 'mongoose';
import { chatDb } from '../database/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const messageSchema = new mongoose.Schema({
    // Message content
    content: {
        type: String,
        required: true,
        maxlength: 10000
    },
    
    // Who sent it: 'user' or 'assistant'
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true
    },
    
    // Token count for context management
    tokenCount: {
        type: Number,
        default: 0
    },
    
    // Metadata for analytics
    metadata: {
        // Response latency in ms (for assistant messages)
        latencyMs: Number,
        // Model used
        model: String,
        // Was this message flagged for safety
        flagged: {
            type: Boolean,
            default: false
        },
        // Safety category if flagged
        flagCategory: String
    }
}, {
    timestamps: true,
    _id: true
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const conversationSchema = new mongoose.Schema({
    // User who owns this conversation
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // AI Persona: 'counselor' or 'bestfriend'
    persona: {
        type: String,
        enum: ['counselor', 'bestfriend'],
        required: true,
        index: true
    },
    
    // Conversation title (auto-generated or user-set)
    title: {
        type: String,
        default: 'New Conversation',
        maxlength: 200
    },
    
    // All messages in this conversation
    messages: [messageSchema],
    
    // Conversation state
    status: {
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active',
        index: true
    },
    
    // Summary for context (generated periodically)
    summary: {
        type: String,
        maxlength: 2000
    },
    
    // Total token count for context management
    totalTokens: {
        type: Number,
        default: 0
    },
    
    // Message count for quick access
    messageCount: {
        type: Number,
        default: 0
    },
    
    // Last activity timestamp
    lastMessageAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    // User's emotional state tracking (optional)
    emotionalContext: {
        lastDetectedMood: String,
        moodHistory: [{
            mood: String,
            timestamp: Date
        }]
    },
    
    // Session metadata
    sessionInfo: {
        startedAt: Date,
        platform: String, // 'android', 'web', 'ios'
        deviceInfo: String
    }
}, {
    timestamps: true,
    collection: 'conversations'
});

// ═══════════════════════════════════════════════════════════════════════════════
// INDEXES FOR PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

// Compound index for user's conversations by persona
conversationSchema.index({ userId: 1, persona: 1, status: 1 });

// Index for recent conversations
conversationSchema.index({ userId: 1, lastMessageAt: -1 });

// Text index for search
conversationSchema.index({ title: 'text' });

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a message to the conversation
 */
conversationSchema.methods.addMessage = async function(role, content, metadata = {}) {
    const tokenCount = Math.ceil(content.length / 4); // Rough estimate
    
    const message = {
        role,
        content,
        tokenCount,
        metadata
    };
    
    this.messages.push(message);
    this.messageCount = this.messages.length;
    this.totalTokens += tokenCount;
    this.lastMessageAt = new Date();
    
    // Auto-generate title from first user message
    if (this.messageCount === 1 && role === 'user') {
        this.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    }
    
    await this.save();
    return this.messages[this.messages.length - 1];
};

/**
 * Get recent messages for context (with token limit)
 */
conversationSchema.methods.getRecentMessages = function(maxTokens = 8000) {
    const messages = [];
    let tokenCount = 0;
    
    // Iterate from newest to oldest
    for (let i = this.messages.length - 1; i >= 0; i--) {
        const msg = this.messages[i];
        if (tokenCount + msg.tokenCount > maxTokens) break;
        messages.unshift(msg);
        tokenCount += msg.tokenCount;
    }
    
    return messages;
};

/**
 * Archive old messages to manage context size
 */
conversationSchema.methods.archiveOldMessages = async function(keepCount = 50) {
    if (this.messages.length <= keepCount) return;
    
    // Generate summary of archived messages
    const archivedMessages = this.messages.slice(0, this.messages.length - keepCount);
    
    // Keep only recent messages
    this.messages = this.messages.slice(-keepCount);
    this.totalTokens = this.messages.reduce((sum, m) => sum + m.tokenCount, 0);
    
    await this.save();
    return archivedMessages.length;
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get or create active conversation for user + persona
 */
conversationSchema.statics.getOrCreateConversation = async function(userId, persona, sessionInfo = {}) {
    // Find existing active conversation
    let conversation = await this.findOne({
        userId,
        persona,
        status: 'active'
    }).sort({ lastMessageAt: -1 });
    
    // Create new if none exists or last one is old (> 24 hours)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (!conversation || conversation.lastMessageAt < dayAgo) {
        conversation = await this.create({
            userId,
            persona,
            sessionInfo: {
                startedAt: new Date(),
                ...sessionInfo
            }
        });
    }
    
    return conversation;
};

/**
 * Get user's conversation history
 */
conversationSchema.statics.getUserConversations = async function(userId, persona = null, limit = 20) {
    const query = { userId, status: { $ne: 'deleted' } };
    if (persona) query.persona = persona;
    
    return this.find(query)
        .select('title persona messageCount lastMessageAt createdAt')
        .sort({ lastMessageAt: -1 })
        .limit(limit);
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT MODEL - Use chatDb connection, not default mongoose
// ═══════════════════════════════════════════════════════════════════════════════

const Conversation = chatDb.model('Conversation', conversationSchema);

export { Conversation, conversationSchema, messageSchema };
export default Conversation;
