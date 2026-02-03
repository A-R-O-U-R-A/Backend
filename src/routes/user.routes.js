import { User } from '../models/user.model.js';

/**
 * User Routes
 */
export default async function userRoutes(fastify) {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Get Current User Profile
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/me', {
    schema: {
      tags: ['User'],
      summary: 'Get current user profile',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                avatar: { type: 'string' },
                bio: { type: 'string' },
                preferences: { type: 'object' },
                createdAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const user = await User.findById(request.user.id).select('-googleId');
    
    if (!user) {
      return reply.code(404).send({
        success: false,
        error: 'User not found'
      });
    }

    return {
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        bio: user.bio || '',
        preferences: user.preferences || {},
        createdAt: user.createdAt.toISOString()
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Update User Profile
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.patch('/me', {
    schema: {
      tags: ['User'],
      summary: 'Update user profile',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          bio: { type: 'string', maxLength: 500 },
          avatar: { type: 'string' },
          preferences: {
            type: 'object',
            properties: {
              notifications: { type: 'boolean' },
              darkMode: { type: 'boolean' },
              language: { type: 'string' },
              devotionalType: { type: 'string' }
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const updates = request.body;
    
    const user = await User.findByIdAndUpdate(
      request.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-googleId');

    if (!user) {
      return reply.code(404).send({
        success: false,
        error: 'User not found'
      });
    }

    return {
      success: true,
      message: 'Profile updated',
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        bio: user.bio || '',
        preferences: user.preferences || {}
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Delete Account
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.delete('/me', {
    schema: {
      tags: ['User'],
      summary: 'Delete user account',
      security: [{ bearerAuth: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    await User.findByIdAndDelete(request.user.id);
    
    fastify.log.info(`User account deleted: ${request.user.email}`);
    
    return {
      success: true,
      message: 'Account deleted successfully'
    };
  });
}
