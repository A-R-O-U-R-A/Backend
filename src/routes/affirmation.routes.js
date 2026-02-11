/**
 * A.R.O.U.R.A Affirmation Routes
 * 
 * Endpoints for daily affirmations
 */

import { affirmationService } from '../services/affirmation.service.js';

export default async function affirmationRoutes(fastify) {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Get Daily Affirmation
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/daily', {
        schema: {
            tags: ['Affirmation'],
            summary: 'Get daily affirmation (AI-generated)',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    mood: { 
                        type: 'string',
                        description: 'Optional mood context for personalization'
                    }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        affirmation: { type: 'string' },
                        cached: { type: 'boolean' },
                        generatedAt: { type: 'number' },
                        ai: { type: 'boolean' }
                    }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { mood } = request.query;
        const userId = request.user.id;
        
        const result = await affirmationService.generateDailyAffirmation(
            userId,
            { mood }
        );
        
        return result;
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Get Affirmation Without Auth (for guests)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/guest', {
        schema: {
            tags: ['Affirmation'],
            summary: 'Get daily affirmation for guests',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        affirmation: { type: 'string' },
                        cached: { type: 'boolean' },
                        generatedAt: { type: 'number' }
                    }
                }
            }
        }
    }, async () => {
        const result = await affirmationService.generateDailyAffirmation();
        return result;
    });
}
