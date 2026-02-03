import { User } from '../models/user.model.js';
import cloudinaryService from '../services/cloudinary.service.js';

/**
 * User Routes - Profile Management & Settings
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
                displayName: { type: 'string' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                profilePicture: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                authProvider: { type: 'string' },
                isEmailVerified: { type: 'boolean' },
                isPremium: { type: 'boolean' },
                preferences: { type: 'object' },
                createdAt: { type: 'string' }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const user = await User.findById(request.user.id)
      .select('-googleId -facebookId -password');
    
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
        displayName: user.displayName,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        profilePicture: user.profilePicture || null,
        bio: user.bio || null,
        authProvider: user.authProvider,
        isEmailVerified: user.isEmailVerified,
        isPremium: user.subscription?.isPremium || false,
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
          displayName: { type: 'string', minLength: 1, maxLength: 100 },
          firstName: { type: 'string', maxLength: 50 },
          lastName: { type: 'string', maxLength: 50 },
          bio: { type: 'string', maxLength: 500 },
          preferences: {
            type: 'object',
            properties: {
              notifications: { type: 'boolean' },
              darkMode: { type: 'boolean' },
              language: { type: 'string' },
              devotionalType: { type: 'string' },
              aiMemory: { type: 'boolean' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                displayName: { type: 'string' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                profilePicture: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                preferences: { type: 'object' }
              }
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
    ).select('-googleId -facebookId -password');

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
        displayName: user.displayName,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        profilePicture: user.profilePicture || null,
        bio: user.bio || null,
        preferences: user.preferences || {}
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Upload Profile Picture
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/me/profile-picture', {
    schema: {
      tags: ['User'],
      summary: 'Upload profile picture',
      description: 'Upload a new profile picture. Accepts JPEG, PNG, or WebP images up to 5MB.',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            profilePicture: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      // Get the uploaded file
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({
          success: false,
          error: 'No file uploaded'
        });
      }
      
      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.'
        });
      }
      
      // Read file buffer
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      // Check file size (5MB max)
      if (buffer.length > 5 * 1024 * 1024) {
        return reply.code(400).send({
          success: false,
          error: 'File too large. Maximum size is 5MB.'
        });
      }
      
      // Get current user to check for existing profile picture
      const user = await User.findById(request.user.id);
      if (!user) {
        return reply.code(404).send({
          success: false,
          error: 'User not found'
        });
      }
      
      // Delete old profile picture from Cloudinary if exists
      if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
        const publicId = cloudinaryService.extractPublicId(user.profilePicture);
        if (publicId) {
          await cloudinaryService.deleteImage(publicId);
        }
      }
      
      // Upload to Cloudinary
      const uploadResult = await cloudinaryService.uploadBuffer(buffer, {
        public_id: `user_${request.user.id}`,
        overwrite: true
      });
      
      // Update user profile picture URL
      user.profilePicture = uploadResult.secure_url;
      await user.save();
      
      fastify.log.info(`Profile picture updated for user: ${request.user.id}`);
      
      return {
        success: true,
        message: 'Profile picture updated successfully',
        profilePicture: uploadResult.secure_url
      };
      
    } catch (error) {
      fastify.log.error('Profile picture upload error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to upload profile picture'
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Delete Profile Picture
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.delete('/me/profile-picture', {
    schema: {
      tags: ['User'],
      summary: 'Delete profile picture',
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
  }, async (request, reply) => {
    try {
      const user = await User.findById(request.user.id);
      
      if (!user) {
        return reply.code(404).send({
          success: false,
          error: 'User not found'
        });
      }
      
      // Delete from Cloudinary if exists
      if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
        const publicId = cloudinaryService.extractPublicId(user.profilePicture);
        if (publicId) {
          await cloudinaryService.deleteImage(publicId);
        }
      }
      
      // Clear profile picture URL
      user.profilePicture = null;
      await user.save();
      
      return {
        success: true,
        message: 'Profile picture removed'
      };
      
    } catch (error) {
      fastify.log.error('Profile picture delete error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete profile picture'
      });
    }
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
    try {
      const user = await User.findById(request.user.id);
      
      if (!user) {
        return reply.code(404).send({
          success: false,
          error: 'User not found'
        });
      }
      
      // Delete profile picture from Cloudinary if exists
      if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
        const publicId = cloudinaryService.extractPublicId(user.profilePicture);
        if (publicId) {
          await cloudinaryService.deleteImage(publicId);
        }
      }
      
      await User.findByIdAndDelete(request.user.id);
      
      fastify.log.info(`User account deleted: ${request.user.email}`);
      
      return {
        success: true,
        message: 'Account deleted successfully'
      };
    } catch (error) {
      fastify.log.error('Account deletion error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete account'
      });
    }
  });
}
