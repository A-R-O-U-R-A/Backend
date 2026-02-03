import AuthService from '../services/auth.service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Authentication Routes - Production Grade
// ═══════════════════════════════════════════════════════════════════════════════

// Response schemas for Swagger documentation
const userResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    displayName: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    profilePicture: { type: 'string', nullable: true },
    authProvider: { type: 'string' },
    isEmailVerified: { type: 'boolean' },
    isPremium: { type: 'boolean' }
  }
};

const authResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    expiresIn: { type: 'number' },
    user: userResponseSchema,
    isNewUser: { type: 'boolean' }
  }
};

const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    code: { type: 'string' }
  }
};

/**
 * Format auth response with tokens and user data
 */
function formatAuthResponse(tokens, user, isNewUser = false) {
  return {
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: 900, // 15 minutes in seconds
    tokenType: 'Bearer',
    user: {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      profilePicture: user.profilePicture || null,
      authProvider: user.authProvider,
      isEmailVerified: user.isEmailVerified,
      isPremium: user.subscription?.isPremium || false
    },
    isNewUser
  };
}

export default async function authRoutes(fastify) {
  const authService = new AuthService(fastify);
  
  // Helper to get client info
  const getClientInfo = (request) => ({
    ip: request.ip || request.headers['x-forwarded-for'] || 'unknown',
    userAgent: request.headers['user-agent'] || 'unknown'
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL/PASSWORD SIGNUP
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register with email and password',
      description: 'Create a new account using email and password. Password must be at least 8 characters with uppercase, lowercase, and number.',
      body: {
        type: 'object',
        required: ['email', 'password', 'displayName'],
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            description: 'Valid email address'
          },
          password: { 
            type: 'string', 
            minLength: 8,
            description: 'Password (min 8 chars, must include uppercase, lowercase, number)'
          },
          displayName: { 
            type: 'string', 
            minLength: 2,
            maxLength: 100,
            description: 'Display name shown in the app'
          }
        }
      },
      response: {
        201: authResponseSchema,
        400: errorResponseSchema,
        409: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { email, password, displayName } = request.body;
    const { ip, userAgent } = getClientInfo(request);
    
    try {
      // Register user
      const user = await authService.registerWithEmail({
        email,
        password,
        displayName
      });
      
      // Generate tokens
      const tokens = authService.generateTokens(user);
      
      // Store refresh token
      const tokenHash = authService.hashToken(tokens.refreshToken);
      await user.addRefreshToken(tokenHash, userAgent, ip);
      
      fastify.log.info(`User registered: ${email}`);
      
      return reply.code(201).send(formatAuthResponse(tokens, user, true));
      
    } catch (error) {
      fastify.log.error('Registration error:', error);
      return reply.code(error.statusCode || 500).send({
        success: false,
        error: error.message || 'Registration failed',
        code: 'REGISTRATION_FAILED'
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL/PASSWORD LOGIN
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      description: 'Authenticate using email and password credentials.',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      },
      response: {
        200: authResponseSchema,
        401: errorResponseSchema,
        423: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body;
    const { ip, userAgent } = getClientInfo(request);
    
    try {
      // Authenticate user
      const user = await authService.loginWithEmail({
        email,
        password,
        ip,
        userAgent
      });
      
      // Generate tokens
      const tokens = authService.generateTokens(user);
      
      // Store refresh token
      const tokenHash = authService.hashToken(tokens.refreshToken);
      await user.addRefreshToken(tokenHash, userAgent, ip);
      
      fastify.log.info(`User logged in: ${email}`);
      
      return formatAuthResponse(tokens, user, false);
      
    } catch (error) {
      fastify.log.warn(`Login failed for ${email}: ${error.message}`);
      return reply.code(error.statusCode || 401).send({
        success: false,
        error: error.message || 'Login failed',
        code: error.statusCode === 423 ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS'
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE OAUTH
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/google', {
    schema: {
      tags: ['Auth'],
      summary: 'Sign in with Google',
      description: 'Authenticate using Google OAuth ID token from Android app.',
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { 
            type: 'string',
            description: 'Google ID Token obtained from Google Sign-In SDK'
          }
        }
      },
      response: {
        200: authResponseSchema,
        401: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { idToken } = request.body;
    const { ip, userAgent } = getClientInfo(request);
    
    try {
      // Authenticate with Google
      const { user, isNewUser } = await authService.authenticateWithGoogle(
        idToken,
        ip,
        userAgent
      );
      
      // Generate tokens
      const tokens = authService.generateTokens(user);
      
      // Store refresh token
      const tokenHash = authService.hashToken(tokens.refreshToken);
      await user.addRefreshToken(tokenHash, userAgent, ip);
      
      return formatAuthResponse(tokens, user, isNewUser);
      
    } catch (error) {
      fastify.log.error('Google auth error:', error);
      return reply.code(error.statusCode || 401).send({
        success: false,
        error: error.message || 'Google authentication failed',
        code: 'GOOGLE_AUTH_FAILED'
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FACEBOOK OAUTH
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/facebook', {
    schema: {
      tags: ['Auth'],
      summary: 'Sign in with Facebook',
      description: 'Authenticate using Facebook access token from Facebook SDK.',
      body: {
        type: 'object',
        required: ['accessToken'],
        properties: {
          accessToken: { 
            type: 'string',
            description: 'Facebook Access Token obtained from Facebook Login SDK'
          }
        }
      },
      response: {
        200: authResponseSchema,
        401: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { accessToken } = request.body;
    const { ip, userAgent } = getClientInfo(request);
    
    try {
      // Authenticate with Facebook
      const { user, isNewUser } = await authService.authenticateWithFacebook(
        accessToken,
        ip,
        userAgent
      );
      
      // Generate tokens
      const tokens = authService.generateTokens(user);
      
      // Store refresh token
      const tokenHash = authService.hashToken(tokens.refreshToken);
      await user.addRefreshToken(tokenHash, userAgent, ip);
      
      return formatAuthResponse(tokens, user, isNewUser);
      
    } catch (error) {
      fastify.log.error('Facebook auth error:', error);
      return reply.code(error.statusCode || 401).send({
        success: false,
        error: error.message || 'Facebook authentication failed',
        code: 'FACEBOOK_AUTH_FAILED'
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // REFRESH TOKEN
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Exchange a valid refresh token for a new access token. Implements token rotation for security.',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number' },
            tokenType: { type: 'string' }
          }
        },
        401: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    const { ip, userAgent } = getClientInfo(request);
    
    try {
      const tokens = await authService.refreshAccessToken(
        refreshToken,
        ip,
        userAgent
      );
      
      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900,
        tokenType: 'Bearer'
      };
      
    } catch (error) {
      return reply.code(401).send({
        success: false,
        error: error.message || 'Token refresh failed',
        code: 'REFRESH_FAILED'
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VERIFY TOKEN
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/verify', {
    schema: {
      tags: ['Auth'],
      summary: 'Verify access token',
      description: 'Verify that the current access token is valid and return user info.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            user: userResponseSchema
          }
        },
        401: errorResponseSchema
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    // User is already verified by authenticate middleware
    const user = await fastify.mongoose.User.findById(request.user.id);
    
    return {
      valid: true,
      user: user ? user.toPublicJSON() : { id: request.user.id, email: request.user.email }
    };
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Logout current session',
      description: 'Invalidate the current refresh token and end the session.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { refreshToken } = request.body || {};
    
    if (refreshToken) {
      await authService.logout(refreshToken, request.user.id);
    }
    
    fastify.log.info(`User logged out: ${request.user.email}`);
    
    return {
      success: true,
      message: 'Logged out successfully'
    };
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT ALL DEVICES
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/logout-all', {
    schema: {
      tags: ['Auth'],
      summary: 'Logout from all devices',
      description: 'Invalidate all refresh tokens for this user across all devices.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    await authService.logoutAllDevices(request.user.id);
    
    fastify.log.info(`User logged out from all devices: ${request.user.email}`);
    
    return {
      success: true,
      message: 'Logged out from all devices'
    };
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK EMAIL AVAILABILITY
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/check-email/:email', {
    schema: {
      tags: ['Auth'],
      summary: 'Check if email is available',
      description: 'Check if an email address is already registered.',
      params: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            available: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request) => {
    const { email } = request.params;
    const { User } = await import('../models/user.model.js');
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    return {
      available: !existingUser,
      message: existingUser ? 'Email is already registered' : 'Email is available'
    };
  });
}
