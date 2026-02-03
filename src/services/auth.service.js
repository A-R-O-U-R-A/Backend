import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';
import { User } from '../models/user.model.js';
import { cache } from '../database/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Auth Service - Production Grade Authentication Logic
// ═══════════════════════════════════════════════════════════════════════════════

const googleClient = new OAuth2Client();

/**
 * Authentication Service
 * Handles all authentication business logic
 */
export class AuthService {
  
  constructor(fastify) {
    this.fastify = fastify;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Token Generation
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Generate access and refresh tokens
   */
  generateTokens(user) {
    // Access token - short lived (15 minutes)
    const accessToken = this.fastify.jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        type: 'access'
      },
      { expiresIn: '15m' }
    );
    
    // Refresh token - long lived (7 days)
    const refreshToken = this.fastify.jwt.sign(
      {
        id: user._id.toString(),
        type: 'refresh',
        jti: crypto.randomUUID() // Unique token ID for revocation
      },
      { expiresIn: '7d' }
    );
    
    return { accessToken, refreshToken };
  }
  
  /**
   * Hash refresh token for storage
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Email/Password Authentication
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Register new user with email/password
   */
  async registerWithEmail({ email, password, displayName }) {
    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      throw { statusCode: 409, message: 'Email already registered' };
    }
    
    // Validate password strength
    this.validatePasswordStrength(password);
    
    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      displayName,
      authProvider: 'email',
      isEmailVerified: false
    });
    
    this.fastify.log.info(`New user registered: ${email}`);
    
    return user;
  }
  
  /**
   * Login with email/password
   */
  async loginWithEmail({ email, password, ip, userAgent }) {
    // Find user with password field
    const user = await User.findByEmailWithPassword(email);
    
    if (!user) {
      throw { statusCode: 401, message: 'Invalid email or password' };
    }
    
    // Check if account is locked
    if (user.isLocked) {
      const lockMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw { 
        statusCode: 423, 
        message: `Account locked. Try again in ${lockMinutes} minutes` 
      };
    }
    
    // Check if account is active
    if (user.status !== 'active') {
      throw { statusCode: 403, message: 'Account is not active' };
    }
    
    // Check if user registered with OAuth
    if (user.authProvider !== 'email' && !user.password) {
      throw { 
        statusCode: 400, 
        message: `Please sign in with ${user.authProvider}` 
      };
    }
    
    // Verify password
    const isValid = await user.comparePassword(password);
    
    if (!isValid) {
      await user.incFailedLogins();
      throw { statusCode: 401, message: 'Invalid email or password' };
    }
    
    // Record successful login
    await user.recordLogin(ip, userAgent);
    
    return user;
  }
  
  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (errors.length > 0) {
      throw { statusCode: 400, message: errors.join('. ') };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Google OAuth
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Authenticate with Google ID Token
   */
  async authenticateWithGoogle(idToken, ip, userAgent) {
    try {
      // Verify Google token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: [
          config.OAUTH_ANDROID_CLIENT_ID,
          config.OAUTH_WEBAPP_CLIENT_ID
        ]
      });
      
      const payload = ticket.getPayload();
      
      if (!payload) {
        throw { statusCode: 401, message: 'Invalid Google token' };
      }
      
      // Find or create user
      const { user, isNewUser } = await User.findOrCreateFromGoogle(payload);
      
      // Record login
      await user.recordLogin(ip, userAgent);
      
      if (isNewUser) {
        this.fastify.log.info(`New Google user: ${payload.email}`);
      }
      
      return { user, isNewUser };
      
    } catch (error) {
      if (error.statusCode) throw error;
      this.fastify.log.error('Google auth error:', error);
      throw { statusCode: 401, message: 'Invalid Google token' };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Facebook OAuth
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Authenticate with Facebook Access Token
   */
  async authenticateWithFacebook(accessToken, ip, userAgent) {
    try {
      // Verify token with Facebook Graph API
      const appId = config.FACEBOOK_APP_ID;
      const appSecret = config.FACEBOOK_SECRET;
      
      // Debug token to verify it's valid
      const debugUrl = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
      const debugResponse = await fetch(debugUrl);
      const debugData = await debugResponse.json();
      
      if (!debugData.data?.is_valid) {
        throw { statusCode: 401, message: 'Invalid Facebook token' };
      }
      
      // Get user profile from Facebook
      const profileUrl = `https://graph.facebook.com/me?fields=id,name,email,first_name,last_name,picture.type(large)&access_token=${accessToken}`;
      const profileResponse = await fetch(profileUrl);
      const profile = await profileResponse.json();
      
      if (profile.error) {
        throw { statusCode: 401, message: 'Failed to get Facebook profile' };
      }
      
      // Format profile picture URL
      if (profile.picture?.data?.url) {
        profile.picture = profile.picture.data.url;
      }
      
      // Find or create user
      const { user, isNewUser } = await User.findOrCreateFromFacebook(profile);
      
      // Record login
      await user.recordLogin(ip, userAgent);
      
      if (isNewUser) {
        this.fastify.log.info(`New Facebook user: ${profile.email || profile.id}`);
      }
      
      return { user, isNewUser };
      
    } catch (error) {
      if (error.statusCode) throw error;
      this.fastify.log.error('Facebook auth error:', error);
      throw { statusCode: 401, message: 'Invalid Facebook token' };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Token Management
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, ip, userAgent) {
    try {
      // Verify refresh token
      const decoded = this.fastify.jwt.verify(refreshToken);
      
      if (decoded.type !== 'refresh') {
        throw { statusCode: 401, message: 'Invalid token type' };
      }
      
      // Check if token is blacklisted
      const isBlacklisted = await cache.exists(`blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        throw { statusCode: 401, message: 'Token has been revoked' };
      }
      
      // Find user
      const user = await User.findById(decoded.id);
      
      if (!user || user.status !== 'active') {
        throw { statusCode: 401, message: 'User not found or inactive' };
      }
      
      // Generate new tokens (token rotation)
      const tokens = this.generateTokens(user);
      
      // Blacklist old refresh token
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await cache.set(`blacklist:${decoded.jti}`, '1', ttl);
      }
      
      // Store new refresh token hash
      const tokenHash = this.hashToken(tokens.refreshToken);
      await user.addRefreshToken(tokenHash, userAgent, ip);
      
      return tokens;
      
    } catch (error) {
      if (error.statusCode) throw error;
      throw { statusCode: 401, message: 'Invalid refresh token' };
    }
  }
  
  /**
   * Logout - Revoke tokens
   */
  async logout(refreshToken, userId) {
    try {
      // Verify and blacklist refresh token
      const decoded = this.fastify.jwt.verify(refreshToken);
      
      if (decoded.jti) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await cache.set(`blacklist:${decoded.jti}`, '1', ttl);
        }
      }
      
      // Remove from user's refresh tokens
      const user = await User.findById(userId).select('+refreshTokens');
      if (user) {
        const tokenHash = this.hashToken(refreshToken);
        await user.removeRefreshToken(tokenHash);
      }
      
    } catch (error) {
      // Silently fail - user is logging out anyway
      this.fastify.log.warn('Logout token error:', error.message);
    }
  }
  
  /**
   * Logout from all devices
   */
  async logoutAllDevices(userId) {
    const user = await User.findById(userId).select('+refreshTokens');
    
    if (user) {
      // Blacklist all current refresh tokens would require storing JTIs
      // For now, just clear the stored tokens
      user.refreshTokens = [];
      await user.save();
    }
  }
}

export default AuthService;
