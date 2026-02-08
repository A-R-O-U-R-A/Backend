/**
 * A.R.O.U.R.A Audio Routes
 * 
 * REST API endpoints for calm/meditation audio content:
 * - GET /audio/all - Get all categories with content
 * - GET /audio/category/:category - Get specific category
 * - GET /audio/search - Search across all sources
 * - GET /audio/nature - Nature sounds
 * - GET /audio/meditation - Meditation sounds
 * - GET /audio/music - Calm music
 * - GET /audio/devotional - Devotional content
 * - GET /audio/audiobooks - Audiobooks
 */

import { audioService } from '../services/audio.service.js';

async function audioRoutes(fastify, options) {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/all - Get all calm content
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/all', {
        schema: {
            description: 'Get all calm audio content organized by category',
            tags: ['audio'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        categories: { type: 'object' },
                        totalItems: { type: 'number' },
                        sources: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const content = await audioService.getAllCalmContent();
            return content;
        } catch (error) {
            fastify.log.error('Get all audio error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch audio content'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/category/:category - Get specific category
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/category/:category', {
        schema: {
            description: 'Get audio content for a specific category',
            tags: ['audio'],
            params: {
                type: 'object',
                properties: {
                    category: { 
                        type: 'string',
                        enum: ['nature', 'meditation', 'calm_music', 'devotional', 'audiobooks']
                    }
                },
                required: ['category']
            }
        }
    }, async (request, reply) => {
        try {
            const { category } = request.params;
            const content = await audioService.getCategoryContent(category);
            
            return {
                success: true,
                category,
                ...content
            };
        } catch (error) {
            fastify.log.error('Get category error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch category content'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/search - Search across all sources
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/search', {
        schema: {
            description: 'Search for audio across all legal sources',
            tags: ['audio'],
            querystring: {
                type: 'object',
                properties: {
                    q: { type: 'string', minLength: 2 },
                    source: { 
                        type: 'string',
                        enum: ['all', 'freesound', 'jamendo', 'archive', 'librivox']
                    },
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 }
                },
                required: ['q']
            }
        }
    }, async (request, reply) => {
        try {
            const { q, source = 'all', page = 1, limit = 20 } = request.query;
            
            let results;
            
            switch (source) {
                case 'freesound':
                    results = await audioService.searchFreesound(q, page, limit);
                    break;
                case 'jamendo':
                    results = await audioService.searchJamendo(q, page, limit);
                    break;
                case 'archive':
                    results = { results: await audioService.searchInternetArchive(q), total: 0 };
                    break;
                case 'librivox':
                    results = { results: await audioService.searchLibrivox(q), total: 0 };
                    break;
                default:
                    results = await audioService.searchAllSources(q);
            }
            
            return {
                success: true,
                ...results
            };
        } catch (error) {
            fastify.log.error('Search audio error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Search failed'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/nature - Nature sounds
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/nature', {
        schema: {
            description: 'Get nature sounds (rain, ocean, forest, etc.)',
            tags: ['audio']
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getNatureSounds();
            return {
                success: true,
                category: 'nature',
                title: 'Nature Sounds',
                items,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Nature sounds error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch nature sounds'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/meditation - Meditation sounds
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/meditation', {
        schema: {
            description: 'Get meditation sounds (singing bowls, bells, chanting)',
            tags: ['audio']
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getMeditationSounds();
            return {
                success: true,
                category: 'meditation',
                title: 'Meditation & Mantras',
                items,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Meditation sounds error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch meditation sounds'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/music - Calm music
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/music', {
        schema: {
            description: 'Get calm/relaxing music from Jamendo',
            tags: ['audio'],
            querystring: {
                type: 'object',
                properties: {
                    tags: { type: 'string', description: 'Comma-separated tags' },
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { tags, page = 1, limit = 20 } = request.query;
            
            let items;
            if (tags) {
                const tagArray = tags.split(',').map(t => t.trim());
                const result = await audioService.getJamendoByTags(tagArray, limit);
                items = result.results;
            } else {
                items = await audioService.getCalmMusic();
            }
            
            return {
                success: true,
                category: 'calm_music',
                title: 'Calm Music',
                items,
                loop_allowed: false,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Calm music error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch calm music'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/devotional - Devotional content
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/devotional', {
        schema: {
            description: 'Get devotional songs and mantras',
            tags: ['audio']
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getDevotionalContent();
            return {
                success: true,
                category: 'devotional',
                title: 'Devotional Songs',
                items,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Devotional content error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch devotional content'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/audiobooks - Audiobooks
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/audiobooks', {
        schema: {
            description: 'Get spiritual and philosophical audiobooks',
            tags: ['audio']
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getAudiobooks();
            return {
                success: true,
                category: 'audiobooks',
                title: 'Audio Books',
                items,
                loop_allowed: false,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Audiobooks error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch audiobooks'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/featured - Featured/curated content
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/featured', {
        schema: {
            description: 'Get featured/curated calm content',
            tags: ['audio']
        }
    }, async (request, reply) => {
        try {
            // Get a mix of featured content from each category
            const [devotional, audiobooks] = await Promise.all([
                audioService.getDevotionalContent(),
                audioService.getAudiobooks()
            ]);

            // Curated featured list
            const featured = [
                ...devotional.slice(0, 3),
                ...audiobooks.slice(0, 3)
            ];

            return {
                success: true,
                title: 'Featured',
                items: featured,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Featured content error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch featured content'
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /audio/quick - Quick calm (short tracks)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/quick', {
        schema: {
            description: 'Get quick calm tracks (under 5 minutes)',
            tags: ['audio']
        }
    }, async (request, reply) => {
        try {
            const nature = await audioService.searchFreesound('calm relaxing short', 1, 10);
            
            // Filter for tracks under 5 minutes
            const quickTracks = nature.results.filter(track => track.duration <= 300);

            return {
                success: true,
                title: 'Quick Calm',
                description: 'Short tracks for quick relaxation',
                items: quickTracks,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Quick calm error:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch quick calm content'
            });
        }
    });
}

export default audioRoutes;
