import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import moodRoutes from './mood.routes.js';

/**
 * Register all API routes
 */
export const registerRoutes = async (fastify) => {
  // API v1 prefix
  fastify.register(async (api) => {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(userRoutes, { prefix: '/users' });
    api.register(moodRoutes, { prefix: '/mood' });
  }, { prefix: '/api/v1' });

  fastify.log.info('✅ All routes registered');
};
