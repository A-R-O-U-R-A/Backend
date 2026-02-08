import 'dotenv/config';

/**
 * Environment Configuration
 * Centralized config with validation
 */
export const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 5000,
  
  // OAuth
  OAUTH_ANDROID_CLIENT_ID: process.env.OAUTH_ANDROID_CLIENT_ID,
  OAUTH_WEBAPP_CLIENT_ID: process.env.OAUTH_WEBAPP_CLIENT_ID,
  
  // Facebook
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_SECRET: process.env.FACEBOOK_SECRET,
  
  // MongoDB
  MONGO_USER_URI: process.env.ARORUA_USER_MONGO_URI,
  MONGO_CHAT_URI: process.env.AROURA_CHAT_MONGO_URI,
  MONGO_REFLECT_URI: process.env.AROURA_REFLECT_MONGO_URI,
  
  // Redis (Local)
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  
  // Upstash Redis (Cloud)
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  
  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN?.split(',') || ['*'],
  
  // Gemini AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_API_NAME: process.env.GEMINI_API_NAME,
  GEMINI_PROJECT_NAME: process.env.GEMINI_PROJECT_NAME,
  GEMINI_PROJECT_NUMBER: process.env.GEMINI_PROJECT_NUMBER,
  
  // Audio APIs
  FREESOUND_API_KEY: process.env.FREESOUND_API_KEY,
  FREESOUND_CLIENT_ID: process.env.FREESOUND_CLIENT_ID,
  JAMENDO_CLIENT_ID: process.env.JAMENDO_CLIENT_ID,
  JAMENDO_CLIENT_SECRET: process.env.JAMENDO_CLIENT_SECRET
};

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'OAUTH_ANDROID_CLIENT_ID',
  'ARORUA_USER_MONGO_URI'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}
