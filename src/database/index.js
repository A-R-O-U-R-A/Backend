import mongoose from 'mongoose';
import Redis from 'ioredis';
import { config } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MongoDB Connections - Separate clusters for different data domains
// ═══════════════════════════════════════════════════════════════════════════════

// Connection options
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Create separate connections for each database
export const userDb = mongoose.createConnection(config.MONGO_USER_URI, mongoOptions);
export const chatDb = mongoose.createConnection(config.MONGO_CHAT_URI, mongoOptions);
export const reflectDb = mongoose.createConnection(config.MONGO_REFLECT_URI, mongoOptions);

// ═══════════════════════════════════════════════════════════════════════════════
// Redis Connection
// ═══════════════════════════════════════════════════════════════════════════════

export const redis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// ═══════════════════════════════════════════════════════════════════════════════
// Connection Event Handlers
// ═══════════════════════════════════════════════════════════════════════════════

// User DB Events
userDb.on('connected', () => {
  console.log('📦 User Database connected');
});
userDb.on('error', (err) => {
  console.error('❌ User Database error:', err.message);
});
userDb.on('disconnected', () => {
  console.log('⚠️  User Database disconnected');
});

// Chat DB Events
chatDb.on('connected', () => {
  console.log('💬 Chat Database connected');
});
chatDb.on('error', (err) => {
  console.error('❌ Chat Database error:', err.message);
});
chatDb.on('disconnected', () => {
  console.log('⚠️  Chat Database disconnected');
});

// Reflect DB Events
reflectDb.on('connected', () => {
  console.log('🪞 Reflect Database connected');
});
reflectDb.on('error', (err) => {
  console.error('❌ Reflect Database error:', err.message);
});
reflectDb.on('disconnected', () => {
  console.log('⚠️  Reflect Database disconnected');
});

// Redis Events
redis.on('connect', () => {
  console.log('🔴 Redis connected');
});
redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});
redis.on('close', () => {
  console.log('⚠️  Redis connection closed');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Connect All Databases
// ═══════════════════════════════════════════════════════════════════════════════

export async function connectDatabases() {
  try {
    console.log('\n🔗 Connecting to databases...\n');
    
    // Wait for all MongoDB connections
    await Promise.all([
      new Promise((resolve, reject) => {
        userDb.once('open', resolve);
        userDb.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        chatDb.once('open', resolve);
        chatDb.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        reflectDb.once('open', resolve);
        reflectDb.once('error', reject);
      }),
    ]);

    // Test Redis connection
    await redis.ping();
    
    console.log('\n✅ All databases connected successfully\n');
    return true;
  } catch (error) {
    console.error('\n❌ Database connection failed:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Close All Connections (Graceful Shutdown)
// ═══════════════════════════════════════════════════════════════════════════════

export async function closeDatabases() {
  try {
    console.log('\n🔌 Closing database connections...');
    
    await Promise.all([
      userDb.close(),
      chatDb.close(),
      reflectDb.close(),
      redis.quit(),
    ]);
    
    console.log('✅ All database connections closed\n');
  } catch (error) {
    console.error('❌ Error closing databases:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Redis Cache Helpers
// ═══════════════════════════════════════════════════════════════════════════════

export const cache = {
  /**
   * Get cached value
   */
  async get(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },

  /**
   * Set cached value with optional TTL (in seconds)
   */
  async set(key, value, ttl = 3600) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      await redis.del(key);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Delete all keys matching pattern
   */
  async delPattern(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      return await redis.exists(key);
    } catch {
      return false;
    }
  },
};

export default {
  userDb,
  chatDb,
  reflectDb,
  redis,
  cache,
  connectDatabases,
  closeDatabases,
};
