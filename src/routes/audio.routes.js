/**
 * A.R.O.U.R.A Audio Routes - Calm & Peaceful Audio Endpoints
 * 
 * Endpoints for streaming calm audio content:
 * - Nature sounds (Freesound)
 * - Ambient soundscapes (Freesound)
 * - Meditation sounds (Freesound)
 * - ASMR sounds (Freesound)
 * - Sleep sounds (Freesound)
 * - Focus music (Jamendo)
 * - Calm music (Jamendo)
 * - Search (both sources, calm-filtered)
 * 
 * NO devotional/religious content.
 * NO LibriVox or Internet Archive sources.
 */

import { audioService } from '../services/audio.service.js';

/**
 * Audio routes plugin
 */
export default async function audioRoutes(fastify, options) {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NATURE SOUNDS (Freesound)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/nature', {
        schema: {
            tags: ['audio'],
            summary: 'Get nature sounds',
            description: 'Fetch curated nature sounds: rain, ocean, forest, birds, etc.'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getNatureSounds();
            return {
                success: true,
                category: 'nature',
                items,
                total: items.length,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Nature sounds error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch nature sounds',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // AMBIENT SOUNDS (Freesound)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/ambient', {
        schema: {
            tags: ['audio'],
            summary: 'Get ambient soundscapes',
            description: 'Fetch ambient atmospheres, drones, and textures'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getAmbientSounds();
            return {
                success: true,
                category: 'ambient',
                items,
                total: items.length,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Ambient sounds error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch ambient sounds',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MEDITATION SOUNDS (Freesound)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/meditation', {
        schema: {
            tags: ['audio'],
            summary: 'Get meditation sounds',
            description: 'Fetch singing bowls, bells, gongs for meditation'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getMeditationSounds();
            return {
                success: true,
                category: 'meditation',
                items,
                total: items.length,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Meditation sounds error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch meditation sounds',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // ASMR SOUNDS (Freesound)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/asmr', {
        schema: {
            tags: ['audio'],
            summary: 'Get ASMR sounds',
            description: 'Fetch soft tapping, page turning, brushing sounds'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getASMRSounds();
            return {
                success: true,
                category: 'asmr',
                items,
                total: items.length,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('ASMR sounds error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch ASMR sounds',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // SLEEP SOUNDS (Freesound)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/sleep', {
        schema: {
            tags: ['audio'],
            summary: 'Get sleep sounds',
            description: 'Fetch white noise, brown noise, fan sounds for sleep'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getSleepSounds();
            return {
                success: true,
                category: 'sleep',
                items,
                total: items.length,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Sleep sounds error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch sleep sounds',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FOCUS MUSIC (Jamendo)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/focus', {
        schema: {
            tags: ['audio'],
            summary: 'Get focus/study music',
            description: 'Fetch instrumental music for concentration and productivity'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getFocusMusic();
            return {
                success: true,
                category: 'focus',
                items,
                total: items.length,
                loop_allowed: false,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Focus music error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch focus music',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CALM MUSIC (Jamendo)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/music', {
        schema: {
            tags: ['audio'],
            summary: 'Get calm instrumental music',
            description: 'Fetch relaxing instrumental music - piano, ambient, classical'
        }
    }, async (request, reply) => {
        try {
            const items = await audioService.getCalmMusic();
            return {
                success: true,
                category: 'music',
                items,
                total: items.length,
                loop_allowed: false,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Calm music error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch calm music',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // SEARCH (All Sources with Calm Filtering)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/search', {
        schema: {
            tags: ['audio'],
            summary: 'Search calm audio content',
            description: 'Search across Freesound and Jamendo with calm content filtering',
            querystring: {
                type: 'object',
                required: ['q'],
                properties: {
                    q: { type: 'string', description: 'Search query' },
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20, maximum: 50 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { q, page = 1, limit = 20 } = request.query;
            
            if (!q || q.trim().length < 2) {
                return reply.status(400).send({
                    success: false,
                    error: 'Search query must be at least 2 characters',
                    results: []
                });
            }

            const result = await audioService.searchAll(q, { page, limit });
            
            return {
                success: result.success,
                query: q,
                category: 'search',
                results: result.results,
                total: result.total,
                sources: result.sources || [],
                page,
                pageSize: limit
            };
        } catch (error) {
            fastify.log.error('Search error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Search failed',
                results: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET ALL CATEGORIES (Combined endpoint for initial load)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/all', {
        schema: {
            tags: ['audio'],
            summary: 'Get all audio categories',
            description: 'Fetch a sample from each category for initial app load'
        }
    }, async (request, reply) => {
        try {
            // Fetch from all categories in parallel
            const [nature, ambient, meditation, asmr, sleep, focus, music] = await Promise.all([
                audioService.getNatureSounds(),
                audioService.getAmbientSounds(),
                audioService.getMeditationSounds(),
                audioService.getASMRSounds(),
                audioService.getSleepSounds(),
                audioService.getFocusMusic(),
                audioService.getCalmMusic()
            ]);

            return {
                success: true,
                categories: {
                    nature: { items: nature.slice(0, 10), total: nature.length },
                    ambient: { items: ambient.slice(0, 10), total: ambient.length },
                    meditation: { items: meditation.slice(0, 10), total: meditation.length },
                    asmr: { items: asmr.slice(0, 8), total: asmr.length },
                    sleep: { items: sleep.slice(0, 10), total: sleep.length },
                    focus: { items: focus.slice(0, 10), total: focus.length },
                    music: { items: music.slice(0, 10), total: music.length }
                },
                totalItems: nature.length + ambient.length + meditation.length + 
                           asmr.length + sleep.length + focus.length + music.length
            };
        } catch (error) {
            fastify.log.error('Fetch all categories error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch audio categories',
                categories: {}
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET BY CATEGORY (Dynamic category endpoint)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/category/:category', {
        schema: {
            tags: ['audio'],
            summary: 'Get audio by category',
            description: 'Fetch audio from a specific category',
            params: {
                type: 'object',
                required: ['category'],
                properties: {
                    category: { 
                        type: 'string',
                        enum: ['nature', 'ambient', 'meditation', 'asmr', 'sleep', 'focus', 'music']
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { category } = request.params;
            
            let items;
            let loopAllowed = true;
            
            switch (category) {
                case 'nature':
                    items = await audioService.getNatureSounds();
                    break;
                case 'ambient':
                    items = await audioService.getAmbientSounds();
                    break;
                case 'meditation':
                    items = await audioService.getMeditationSounds();
                    break;
                case 'asmr':
                    items = await audioService.getASMRSounds();
                    break;
                case 'sleep':
                    items = await audioService.getSleepSounds();
                    break;
                case 'focus':
                    items = await audioService.getFocusMusic();
                    loopAllowed = false;
                    break;
                case 'music':
                    items = await audioService.getCalmMusic();
                    loopAllowed = false;
                    break;
                default:
                    return reply.status(400).send({
                        success: false,
                        error: `Unknown category: ${category}`,
                        validCategories: ['nature', 'ambient', 'meditation', 'asmr', 'sleep', 'focus', 'music'],
                        items: []
                    });
            }

            return {
                success: true,
                category,
                items,
                total: items.length,
                loop_allowed: loopAllowed,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error(`Category ${request.params.category} error:`, error);
            return reply.status(500).send({
                success: false,
                error: `Failed to fetch ${request.params.category} content`,
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // QUICK PICKS (Curated selection for home page)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/quick', {
        schema: {
            tags: ['audio'],
            summary: 'Get quick picks',
            description: 'Get a curated selection of popular calm audio'
        }
    }, async (request, reply) => {
        try {
            // Get a mix from different categories
            const [nature, music, sleep] = await Promise.all([
                audioService.getNatureSounds(),
                audioService.getCalmMusic(),
                audioService.getSleepSounds()
            ]);

            // Mix and select top items
            const items = [
                ...nature.slice(0, 4),
                ...music.slice(0, 3),
                ...sleep.slice(0, 3)
            ];

            return {
                success: true,
                category: 'quick',
                items,
                total: items.length,
                loop_allowed: true,
                sleep_timer_supported: true
            };
        } catch (error) {
            fastify.log.error('Quick picks error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch quick picks',
                items: []
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // HEALTH CHECK
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/health', {
        schema: {
            tags: ['audio'],
            summary: 'Audio service health check',
            description: 'Check if audio services are operational'
        }
    }, async (request, reply) => {
        return {
            success: true,
            service: 'audio',
            sources: {
                freesound: !!process.env.FREESOUND_API_KEY,
                jamendo: !!process.env.JAMENDO_CLIENT_ID
            },
            categories: ['nature', 'ambient', 'meditation', 'asmr', 'sleep', 'focus', 'music'],
            timestamp: new Date().toISOString()
        };
    });
}
