import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';
import { User } from '../models/user.model.js';

const googleClient = new OAuth2Client(config.OAUTH_WEBAPP_CLIENT_ID);

/**
 * Authentication Routes
 */
export default async function authRoutes(fastify) {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Google OAuth Sign In
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/google', {
    schema: {
      tags: ['Auth'],
      summary: 'Sign in with Google OAuth',
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string', description: 'Google ID Token from Android app' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                avatar: { type: 'string' },
                isNewUser: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { idToken } = request.body;

    try {
      // Verify Google token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: [config.OAUTH_ANDROID_CLIENT_ID, config.OAUTH_WEBAPP_CLIENT_ID]
      });

      const payload = ticket.getPayload();
      const { sub: googleId, email, name, picture } = payload;

      // Find or create user
      let user = await User.findOne({ googleId });
      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        user = await User.create({
          googleId,
          email,
          name,
          avatar: picture,
          authProvider: 'google',
          createdAt: new Date()
        });
        
        fastify.log.info(`New user registered: ${email}`);
      } else {
        // Update last login
        user.lastLoginAt = new Date();
        await user.save();
      }

      // Generate JWT
      const token = fastify.jwt.sign({
        id: user._id.toString(),
        email: user.email
      });

      return {
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isNewUser
        }
      };

    } catch (error) {
      fastify.log.error('Google auth error:', error);
      return reply.code(401).send({
        success: false,
        error: 'Invalid Google token'
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Verify Token
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/verify', {
    schema: {
      tags: ['Auth'],
      summary: 'Verify JWT token',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    return {
      valid: true,
      user: {
        id: request.user.id,
        email: request.user.email
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Refresh Token
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh JWT token',
      security: [{ bearerAuth: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const token = fastify.jwt.sign({
      id: request.user.id,
      email: request.user.email
    });

    return { success: true, token };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Logout (client-side token removal, but we can log it)
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Logout user',
      security: [{ bearerAuth: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    fastify.log.info(`User logged out: ${request.user.email}`);
    return { success: true, message: 'Logged out successfully' };
  });
}
