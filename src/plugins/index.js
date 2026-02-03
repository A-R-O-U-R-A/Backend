import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { config } from '../config/env.js';

/**
 * Register all Fastify plugins
 */
export const registerPlugins = async (fastify) => {
  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });

  // CORS
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Please slow down, you are being rate limited.'
    })
  });

  // Sensible defaults (httpErrors, etc.)
  await fastify.register(sensible);

  // JWT Authentication
  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN
    }
  });

  // File uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE
    }
  });

  // Swagger API Documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'A.R.O.U.R.A API',
        description: 'Mental Health Companion Backend API',
        version: '1.0.0'
      },
      servers: [
        { url: 'http://localhost:5000', description: 'Development' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'User', description: 'User management' },
        { name: 'Mood', description: 'Mood tracking' },
        { name: 'Chat', description: 'AI Chat' },
        { name: 'Reflect', description: 'Self-discovery tests' }
      ]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    }
  });

  // Authentication decorator
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
  });

  fastify.log.info('✅ All plugins registered');
};
