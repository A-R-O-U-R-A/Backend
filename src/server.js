import Fastify from 'fastify';
import { config } from './config/env.js';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';
import { connectDatabases } from './database/index.js';

/**
 * A.R.O.U.R.A Backend Server
 * 
 * Mental health companion API built with Fastify
 * - Google OAuth Authentication
 * - MongoDB for data persistence
 * - Redis for caching & sessions
 * - Cloudinary for media storage
 */

const startServer = async () => {
  // Create Fastify instance with logging
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    trustProxy: true
  });

  try {
    // Try to connect to databases (non-blocking in development)
    try {
      await connectDatabases(fastify);
    } catch (dbError) {
      fastify.log.warn('⚠️  Database connection failed, starting server anyway...');
      fastify.log.warn(`   Error: ${dbError.message}`);
      fastify.log.warn('   Make sure your IP is whitelisted in MongoDB Atlas');
    }
    
    // Register plugins (CORS, JWT, Rate Limiting, etc.)
    await registerPlugins(fastify);
    
    // Register routes
    await registerRoutes(fastify);

    // Health check route
    fastify.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));

    // Start server
    const address = await fastify.listen({
      port: config.PORT,
      host: '0.0.0.0'
    });

    fastify.log.info(`🚀 A.R.O.U.R.A Backend running at ${address}`);
    fastify.log.info(`📚 API Documentation: ${address}/docs`);

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      fastify.log.info(`Received ${signal}, shutting down gracefully...`);
      await fastify.close();
      process.exit(0);
    });
  });
};

startServer();
