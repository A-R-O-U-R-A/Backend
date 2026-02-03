import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { config } from '../config/env.js';
import { User } from '../models/user.model.js';

/**
 * Register all Fastify plugins
 */
export const registerPlugins = async (fastify) => {
  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });

  // CORS - Allow Android app
  await fastify.register(cors, {
    origin: true, // Allow all origins for mobile app
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  // Rate limiting - Different limits for different routes
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    // Stricter limits for auth endpoints
    keyGenerator: (request) => {
      return request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      retryAfter: context.after
    })
  });

  // Sensible defaults (httpErrors, etc.)
  await fastify.register(sensible);

  // JWT Authentication
  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      algorithm: 'HS256'
    },
    verify: {
      algorithms: ['HS256']
    }
  });

  // File uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE,
      files: 5
    }
  });

  // Swagger API Documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'A.R.O.U.R.A API',
        description: 'Mental Health Companion Backend API - Production Grade',
        version: '1.0.0',
        contact: {
          name: 'A.R.O.U.R.A Team'
        }
      },
      servers: [
        { url: `http://localhost:${config.PORT}`, description: 'Development' },
        { url: 'https://api.aroura.app', description: 'Production' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your access token'
          }
        }
      },
      tags: [
        { name: 'Auth', description: 'Authentication - Login, Register, OAuth' },
        { name: 'User', description: 'User profile management' },
        { name: 'Mood', description: 'Mood tracking and journaling' },
        { name: 'Chat', description: 'AI Chat conversations' },
        { name: 'Reflect', description: 'Self-discovery assessments' }
      ]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Decorators
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Add User model to fastify for easy access
  fastify.decorate('mongoose', { User });

  // Authentication decorator - Verify JWT and load user
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify();
      
      // Verify token type
      if (decoded.type && decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      
      request.user = decoded;
    } catch (err) {
      return reply.code(401).send({
        success: false,
        error: 'Invalid or expired token',
        code: 'UNAUTHORIZED'
      });
    }
  });

  // Optional auth - Doesn't fail if no token
  fastify.decorate('optionalAuth', async (request) => {
    try {
      const decoded = await request.jwtVerify();
      request.user = decoded;
    } catch {
      request.user = null;
    }
  });

  fastify.log.info('✅ All plugins registered');
};
