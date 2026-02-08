/**
 * A.R.O.U.R.A Redis Service
 * 
 * Upstash Redis integration for:
 * - Real-time message caching
 * - Rate limiting
 * - Session management
 * - Pub/Sub for instant messaging
 */

import { Redis } from '@upstash/redis';
import { config } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS CLIENT INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let redis = null;

/**
 * Initialize Upstash Redis client
 */
function initializeRedis() {
    if (redis) return redis;
    
    try {
        redis = new Redis({
            url: config.UPSTASH_REDIS_REST_URL,
            token: config.UPSTASH_REDIS_REST_TOKEN
        });
        
        console.log('✅ Upstash Redis connected');
        return redis;
    } catch (error) {
        console.error('❌ Upstash Redis connection failed:', error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE KEYS
// ═══════════════════════════════════════════════════════════════════════════════

const KEYS = {
    // User's active conversation ID
    activeConversation: (userId, persona) => `chat:active:${userId}:${persona}`,
    
    // Recent messages cache (for quick loading)
    recentMessages: (conversationId) => `chat:messages:${conversationId}`,
    
    // User's typing status
    typing: (userId, persona) => `chat:typing:${userId}:${persona}`,
    
    // Rate limiting
    rateLimit: (userId) => `ratelimit:chat:${userId}`,
    
    // User session
    session: (userId) => `session:${userId}`,
    
    // Message queue for streaming
    messageQueue: (conversationId) => `chat:queue:${conversationId}`,
    
    // Conversation lock (prevent concurrent writes)
    conversationLock: (conversationId) => `chat:lock:${conversationId}`,
    
    // AI response streaming chunks
    streamChunks: (messageId) => `chat:stream:${messageId}`
};

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache recent messages for quick loading
 */
async function cacheRecentMessages(conversationId, messages, ttlSeconds = 3600) {
    if (!redis) return false;
    
    try {
        const key = KEYS.recentMessages(conversationId);
        await redis.setex(key, ttlSeconds, JSON.stringify(messages));
        return true;
    } catch (error) {
        // Silently fail - Redis caching is optional
        return false;
    }
}

/**
 * Get cached recent messages
 */
async function getCachedMessages(conversationId) {
    if (!redis) return null;
    
    try {
        const key = KEYS.recentMessages(conversationId);
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        // Silently fail - Redis caching is optional
        return null;
    }
}

/**
 * Invalidate message cache when new message added
 */
async function invalidateMessageCache(conversationId) {
    if (!redis) return false;
    
    try {
        const key = KEYS.recentMessages(conversationId);
        await redis.del(key);
        return true;
    } catch (error) {
        // Silently fail - Redis caching is optional
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE CONVERSATION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set user's active conversation
 */
async function setActiveConversation(userId, persona, conversationId) {
    if (!redis) return false;
    
    try {
        const key = KEYS.activeConversation(userId, persona);
        await redis.setex(key, 86400, conversationId.toString()); // 24 hour TTL
        return true;
    } catch (error) {
        // Silently fail - Redis caching is optional
        return false;
    }
}

/**
 * Get user's active conversation
 */
async function getActiveConversation(userId, persona) {
    if (!redis) return null;
    
    try {
        const key = KEYS.activeConversation(userId, persona);
        return await redis.get(key);
    } catch (error) {
        // Silently fail - Redis caching is optional
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check and increment rate limit
 * Returns: { allowed: boolean, remaining: number, resetIn: number }
 */
async function checkRateLimit(userId, maxRequests = 30, windowSeconds = 60) {
    if (!redis) return { allowed: true, remaining: maxRequests, resetIn: 0 };
    
    try {
        const key = KEYS.rateLimit(userId);
        const current = await redis.incr(key);
        
        // Set expiry on first request
        if (current === 1) {
            await redis.expire(key, windowSeconds);
        }
        
        const ttl = await redis.ttl(key);
        
        return {
            allowed: current <= maxRequests,
            remaining: Math.max(0, maxRequests - current),
            resetIn: ttl > 0 ? ttl : windowSeconds
        };
    } catch (error) {
        // Silently fail - allow request if Redis unavailable
        return { allowed: true, remaining: maxRequests, resetIn: 0 };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set typing status
 */
async function setTyping(userId, persona, isTyping) {
    if (!redis) return false;
    
    try {
        const key = KEYS.typing(userId, persona);
        if (isTyping) {
            await redis.setex(key, 30, 'true'); // Auto-expire after 30s
        } else {
            await redis.del(key);
        }
        return true;
    } catch (error) {
        // Silently fail - typing indicator is optional
        return false;
    }
}

/**
 * Check if AI is typing (generating response)
 */
async function isTyping(userId, persona) {
    if (!redis) return false;
    
    try {
        const key = KEYS.typing(userId, persona);
        const status = await redis.get(key);
        return status === 'true';
    } catch (error) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION LOCKING (PREVENT RACE CONDITIONS)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Acquire lock on conversation
 */
async function acquireLock(conversationId, ttlSeconds = 30) {
    if (!redis) return true; // Allow if Redis unavailable
    
    try {
        const key = KEYS.conversationLock(conversationId);
        const result = await redis.setnx(key, Date.now().toString());
        
        if (result) {
            await redis.expire(key, ttlSeconds);
            return true;
        }
        return false;
    } catch (error) {
        // Silently fail - allow on error
        return true;
    }
}

/**
 * Release lock on conversation
 */
async function releaseLock(conversationId) {
    if (!redis) return true;
    
    try {
        const key = KEYS.conversationLock(conversationId);
        await redis.del(key);
        return true;
    } catch (error) {
        // Silently fail
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING SUPPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Store streaming chunk
 */
async function addStreamChunk(messageId, chunk, index) {
    if (!redis) return false;
    
    try {
        const key = KEYS.streamChunks(messageId);
        await redis.rpush(key, JSON.stringify({ index, chunk, timestamp: Date.now() }));
        await redis.expire(key, 300); // 5 minute TTL
        return true;
    } catch (error) {
        // Silently fail - streaming chunks are optional
        return false;
    }
}

/**
 * Get all stream chunks
 */
async function getStreamChunks(messageId) {
    if (!redis) return [];
    
    try {
        const key = KEYS.streamChunks(messageId);
        const chunks = await redis.lrange(key, 0, -1);
        return chunks.map(c => JSON.parse(c));
    } catch (error) {
        // Silently fail
        return [];
    }
}

/**
 * Clear stream chunks after completion
 */
async function clearStreamChunks(messageId) {
    if (!redis) return false;
    
    try {
        const key = KEYS.streamChunks(messageId);
        await redis.del(key);
        return true;
    } catch (error) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Store user session data
 */
async function setSession(userId, sessionData, ttlSeconds = 86400) {
    if (!redis) return false;
    
    try {
        const key = KEYS.session(userId);
        await redis.setex(key, ttlSeconds, JSON.stringify(sessionData));
        return true;
    } catch (error) {
        // Silently fail - session caching is optional
        return false;
    }
}

/**
 * Get user session data
 */
async function getSession(userId) {
    if (!redis) return null;
    
    try {
        const key = KEYS.session(userId);
        const session = await redis.get(key);
        return session ? JSON.parse(session) : null;
    } catch (error) {
        // Silently fail - session caching is optional
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check Redis connection health
 */
async function healthCheck() {
    if (!redis) return { healthy: false, error: 'Not initialized' };
    
    try {
        const start = Date.now();
        await redis.ping();
        const latency = Date.now() - start;
        
        return {
            healthy: true,
            latency,
            provider: 'upstash'
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const redisService = {
    initialize: initializeRedis,
    
    // Cache operations
    cacheRecentMessages,
    getCachedMessages,
    invalidateMessageCache,
    
    // Active conversation
    setActiveConversation,
    getActiveConversation,
    
    // Rate limiting
    checkRateLimit,
    
    // Typing indicators
    setTyping,
    isTyping,
    
    // Locking
    acquireLock,
    releaseLock,
    
    // Streaming
    addStreamChunk,
    getStreamChunks,
    clearStreamChunks,
    
    // Session
    setSession,
    getSession,
    
    // Health
    healthCheck,
    
    // Direct access if needed
    getClient: () => redis
};

export default redisService;
