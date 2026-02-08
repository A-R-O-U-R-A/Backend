import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import moodRoutes from './mood.routes.js';
import chatRoutes from './chat.routes.js';
import audioRoutes from './audio.routes.js';

/**
 * Register all API routes
 */
export const registerRoutes = async (fastify) => {
  // API v1 prefix
  fastify.register(async (api) => {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(userRoutes, { prefix: '/users' });
    api.register(moodRoutes, { prefix: '/mood' });
    api.register(chatRoutes, { prefix: '/chat' });
    api.register(audioRoutes, { prefix: '/audio' });
  }, { prefix: '/api/v1' });

  fastify.log.info('✅ All routes registered');
};
