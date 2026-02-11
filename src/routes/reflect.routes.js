/**
 * A.R.O.U.R.A Reflect Routes
 * 
 * Endpoints for:
 * - Home mood check-ins
 * - Routine tracking
 * - Self-discovery quest progress
 * - Test results
 * - Quiz results
 * - Liked songs
 */

import { 
    HomeMood, 
    RoutineCompletion, 
    QuestProgress, 
    TestResult, 
    QuizResult,
    CalmAnxietyEntry,
    LikedSong 
} from '../models/reflect.model.js';

export default async function reflectRoutes(fastify) {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HOME MOOD CHECK-IN
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Save home mood check-in
     */
    fastify.post('/home-mood', {
        schema: {
            tags: ['Reflect'],
            summary: 'Save home mood check-in',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['moodIndex', 'moodLabel', 'moodEmoji'],
                properties: {
                    moodIndex: { type: 'number', minimum: 0, maximum: 4 },
                    moodLabel: { type: 'string' },
                    moodEmoji: { type: 'string' },
                    note: { type: 'string', maxLength: 500 }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { moodIndex, moodLabel, moodEmoji, note } = request.body;
        
        const mood = await HomeMood.create({
            userId: request.user.id,
            moodIndex,
            moodLabel,
            moodEmoji,
            note: note || ''
        });
        
        return reply.code(201).send({
            success: true,
            mood: {
                id: mood._id.toString(),
                moodIndex: mood.moodIndex,
                moodLabel: mood.moodLabel,
                moodEmoji: mood.moodEmoji,
                note: mood.note,
                createdAt: mood.createdAt.toISOString()
            }
        });
    });
    
    /**
     * Get home mood history
     */
    fastify.get('/home-mood', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get home mood history',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'integer', default: 30, maximum: 100 },
                    offset: { type: 'integer', default: 0 }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { limit = 30, offset = 0 } = request.query;
        
        const moods = await HomeMood.find({ userId: request.user.id })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit);
        
        const total = await HomeMood.countDocuments({ userId: request.user.id });
        
        return {
            success: true,
            moods: moods.map(m => ({
                id: m._id.toString(),
                moodIndex: m.moodIndex,
                moodLabel: m.moodLabel,
                moodEmoji: m.moodEmoji,
                note: m.note,
                createdAt: m.createdAt.toISOString()
            })),
            pagination: { total, limit, offset, hasMore: offset + moods.length < total }
        };
    });
    
    /**
     * Get today's mood
     */
    fastify.get('/home-mood/today', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get today\'s mood check-in',
            security: [{ bearerAuth: [] }]
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const mood = await HomeMood.findOne({
            userId: request.user.id,
            createdAt: { $gte: today }
        }).sort({ createdAt: -1 });
        
        return {
            success: true,
            mood: mood ? {
                id: mood._id.toString(),
                moodIndex: mood.moodIndex,
                moodLabel: mood.moodLabel,
                moodEmoji: mood.moodEmoji,
                note: mood.note,
                createdAt: mood.createdAt.toISOString()
            } : null
        };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ROUTINE TRACKING
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Complete a routine task
     */
    fastify.post('/routine/complete', {
        schema: {
            tags: ['Reflect'],
            summary: 'Mark routine task as completed',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['taskId', 'category', 'title'],
                properties: {
                    taskId: { type: 'string' },
                    category: { type: 'string' },
                    title: { type: 'string' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { taskId, category, title } = request.body;
        const completedDate = new Date().toISOString().split('T')[0];
        
        // Upsert to avoid duplicates
        const completion = await RoutineCompletion.findOneAndUpdate(
            { userId: request.user.id, taskId, completedDate },
            { 
                userId: request.user.id,
                taskId,
                category,
                title,
                completedDate,
                completedAt: new Date()
            },
            { upsert: true, new: true }
        );
        
        return reply.code(201).send({
            success: true,
            completion: {
                id: completion._id.toString(),
                taskId: completion.taskId,
                category: completion.category,
                title: completion.title,
                completedDate: completion.completedDate,
                completedAt: completion.completedAt.toISOString()
            }
        });
    });
    
    /**
     * Get routine completions for a date range
     */
    fastify.get('/routine/completions', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get routine completions',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { startDate, endDate } = request.query;
        
        const query = { userId: request.user.id };
        
        if (startDate || endDate) {
            query.completedDate = {};
            if (startDate) query.completedDate.$gte = startDate;
            if (endDate) query.completedDate.$lte = endDate;
        }
        
        const completions = await RoutineCompletion.find(query).sort({ completedDate: -1 });
        
        // Group by date
        const byDate = completions.reduce((acc, c) => {
            if (!acc[c.completedDate]) acc[c.completedDate] = [];
            acc[c.completedDate].push({
                id: c._id.toString(),
                taskId: c.taskId,
                category: c.category,
                title: c.title,
                completedAt: c.completedAt.toISOString()
            });
            return acc;
        }, {});
        
        return {
            success: true,
            completions: byDate
        };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CALM ANXIETY ENTRIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Save calm anxiety entry
     */
    fastify.post('/calm-anxiety', {
        schema: {
            tags: ['Reflect'],
            summary: 'Save calm anxiety session entry',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['reflections'],
                properties: {
                    anxietyLevelBefore: { type: 'number', minimum: 0, maximum: 10 },
                    anxietyLevelAfter: { type: 'number', minimum: 0, maximum: 10 },
                    reflections: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['questionId', 'prompt', 'answer'],
                            properties: {
                                questionId: { type: 'number' },
                                prompt: { type: 'string' },
                                answer: { type: 'string' }
                            }
                        }
                    },
                    primaryTrigger: { type: 'string' },
                    completedFully: { type: 'boolean' },
                    durationSeconds: { type: 'number' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { anxietyLevelBefore, anxietyLevelAfter, reflections, primaryTrigger, completedFully, durationSeconds } = request.body;
        
        const entry = await CalmAnxietyEntry.create({
            userId: request.user.id,
            anxietyLevelBefore,
            anxietyLevelAfter,
            reflections,
            primaryTrigger: primaryTrigger || (reflections[0]?.answer?.substring(0, 100) || ''),
            completedFully: completedFully !== false,
            durationSeconds: durationSeconds || 0
        });
        
        return reply.code(201).send({
            success: true,
            entry: {
                id: entry._id.toString(),
                anxietyLevelBefore: entry.anxietyLevelBefore,
                anxietyLevelAfter: entry.anxietyLevelAfter,
                reflections: entry.reflections,
                primaryTrigger: entry.primaryTrigger,
                completedFully: entry.completedFully,
                durationSeconds: entry.durationSeconds,
                createdAt: entry.createdAt.toISOString()
            }
        });
    });
    
    /**
     * Get calm anxiety entries
     */
    fastify.get('/calm-anxiety', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get calm anxiety session history',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'number', default: 20 },
                    page: { type: 'number', default: 1 }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { limit = 20, page = 1 } = request.query;
        const skip = (page - 1) * limit;
        
        const [entries, total] = await Promise.all([
            CalmAnxietyEntry.find({ userId: request.user.id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            CalmAnxietyEntry.countDocuments({ userId: request.user.id })
        ]);
        
        return {
            success: true,
            entries: entries.map(e => ({
                id: e._id.toString(),
                anxietyLevelBefore: e.anxietyLevelBefore,
                anxietyLevelAfter: e.anxietyLevelAfter,
                reflections: e.reflections,
                primaryTrigger: e.primaryTrigger,
                completedFully: e.completedFully,
                durationSeconds: e.durationSeconds,
                createdAt: e.createdAt.toISOString()
            })),
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        };
    });
    
    /**
     * Get single calm anxiety entry
     */
    fastify.get('/calm-anxiety/:entryId', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get a specific calm anxiety entry',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    entryId: { type: 'string' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { entryId } = request.params;
        
        const entry = await CalmAnxietyEntry.findOne({ 
            _id: entryId, 
            userId: request.user.id 
        });
        
        if (!entry) {
            return reply.code(404).send({
                success: false,
                error: 'Entry not found'
            });
        }
        
        return {
            success: true,
            entry: {
                id: entry._id.toString(),
                anxietyLevelBefore: entry.anxietyLevelBefore,
                anxietyLevelAfter: entry.anxietyLevelAfter,
                reflections: entry.reflections,
                primaryTrigger: entry.primaryTrigger,
                completedFully: entry.completedFully,
                durationSeconds: entry.durationSeconds,
                createdAt: entry.createdAt.toISOString()
            }
        };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SELF-DISCOVERY QUEST
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get quest progress
     */
    fastify.get('/quest/progress', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get self-discovery quest progress',
            security: [{ bearerAuth: [] }]
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        let progress = await QuestProgress.findOne({ userId: request.user.id });
        
        if (!progress) {
            progress = await QuestProgress.create({
                userId: request.user.id,
                completedTests: [],
                totalRequired: 3
            });
        }
        
        return {
            success: true,
            progress: {
                completedCount: progress.completedTests.length,
                totalRequired: progress.totalRequired,
                completedTests: progress.completedTests,
                badgeEarned: progress.badgeEarned,
                badgeType: progress.badgeType,
                badgeEarnedAt: progress.badgeEarnedAt?.toISOString() || null
            }
        };
    });
    
    /**
     * Add completed test to quest
     */
    fastify.post('/quest/complete-test', {
        schema: {
            tags: ['Reflect'],
            summary: 'Mark test as completed for quest',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['testId', 'resultId'],
                properties: {
                    testId: { type: 'string' },
                    resultId: { type: 'string' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { testId, resultId } = request.body;
        
        let progress = await QuestProgress.findOne({ userId: request.user.id });
        
        if (!progress) {
            progress = await QuestProgress.create({
                userId: request.user.id,
                completedTests: [],
                totalRequired: 3
            });
        }
        
        // Check if already completed this test for quest
        const alreadyCompleted = progress.completedTests.some(t => t.testId === testId);
        if (alreadyCompleted) {
            return {
                success: true,
                progress: {
                    completedCount: progress.completedTests.length,
                    totalRequired: progress.totalRequired,
                    badgeEarned: progress.badgeEarned,
                    message: 'Test already completed for quest'
                }
            };
        }
        
        // Add completed test
        progress.completedTests.push({
            testId,
            completedAt: new Date(),
            resultId
        });
        
        // Check if quest complete - award badge
        if (progress.completedTests.length >= progress.totalRequired && !progress.badgeEarned) {
            progress.badgeEarned = true;
            progress.badgeEarnedAt = new Date();
            progress.badgeType = 'self_discovery_explorer';
        }
        
        await progress.save();
        
        return reply.code(201).send({
            success: true,
            progress: {
                completedCount: progress.completedTests.length,
                totalRequired: progress.totalRequired,
                badgeEarned: progress.badgeEarned,
                badgeType: progress.badgeType,
                newBadge: progress.badgeEarned && progress.completedTests.length === progress.totalRequired
            }
        });
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TEST RESULTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Save test result
     */
    fastify.post('/test-results', {
        schema: {
            tags: ['Reflect'],
            summary: 'Save test result',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['testId', 'testTitle', 'primaryScore', 'primaryLabel'],
                properties: {
                    testId: { type: 'string' },
                    testTitle: { type: 'string' },
                    primaryScore: { type: 'number' },
                    categories: { type: 'object' },
                    primaryLabel: { type: 'string' },
                    description: { type: 'string' },
                    insights: { type: 'array', items: { type: 'string' } },
                    reflection: { type: 'string' },
                    answers: { type: 'object' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const result = await TestResult.create({
            userId: request.user.id,
            ...request.body
        });
        
        return reply.code(201).send({
            success: true,
            result: {
                id: result._id.toString(),
                testId: result.testId,
                testTitle: result.testTitle,
                primaryScore: result.primaryScore,
                primaryLabel: result.primaryLabel,
                completedAt: result.completedAt.toISOString()
            }
        });
    });
    
    /**
     * Get test results
     */
    fastify.get('/test-results', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get all test results',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    testId: { type: 'string' },
                    limit: { type: 'integer', default: 50 }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { testId, limit = 50 } = request.query;
        
        const query = { userId: request.user.id };
        if (testId) query.testId = testId;
        
        const results = await TestResult.find(query)
            .sort({ completedAt: -1 })
            .limit(limit);
        
        return {
            success: true,
            results: results.map(r => ({
                id: r._id.toString(),
                testId: r.testId,
                testTitle: r.testTitle,
                primaryScore: r.primaryScore,
                primaryLabel: r.primaryLabel,
                description: r.description,
                insights: r.insights,
                categories: Object.fromEntries(r.categories || new Map()),
                completedAt: r.completedAt.toISOString()
            }))
        };
    });
    
    /**
     * Get completed tests summary (for test results section)
     */
    fastify.get('/test-results/summary', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get completed tests summary',
            security: [{ bearerAuth: [] }]
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const results = await TestResult.aggregate([
            { $match: { userId: request.user.id } },
            { 
                $group: {
                    _id: '$testId',
                    testTitle: { $first: '$testTitle' },
                    count: { $sum: 1 },
                    lastCompleted: { $max: '$completedAt' },
                    latestScore: { $last: '$primaryScore' },
                    latestLabel: { $last: '$primaryLabel' }
                }
            },
            { $sort: { lastCompleted: -1 } }
        ]);
        
        return {
            success: true,
            completedCount: results.length,
            tests: results.map(r => ({
                testId: r._id,
                testTitle: r.testTitle,
                completedCount: r.count,
                lastCompleted: r.lastCompleted.toISOString(),
                latestScore: r.latestScore,
                latestLabel: r.latestLabel
            }))
        };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // QUIZ RESULTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Save quiz result
     */
    fastify.post('/quiz-results', {
        schema: {
            tags: ['Reflect'],
            summary: 'Save quiz result',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['quizId', 'quizTitle', 'score', 'totalQuestions'],
                properties: {
                    quizId: { type: 'string' },
                    quizTitle: { type: 'string' },
                    score: { type: 'number' },
                    totalQuestions: { type: 'number' },
                    resultMessage: { type: 'string' },
                    answers: { type: 'array' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const result = await QuizResult.create({
            userId: request.user.id,
            ...request.body
        });
        
        return reply.code(201).send({
            success: true,
            result: {
                id: result._id.toString(),
                quizId: result.quizId,
                quizTitle: result.quizTitle,
                score: result.score,
                totalQuestions: result.totalQuestions,
                resultMessage: result.resultMessage,
                completedAt: result.completedAt.toISOString()
            }
        });
    });
    
    /**
     * Get quiz results
     */
    fastify.get('/quiz-results', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get quiz results',
            security: [{ bearerAuth: [] }]
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const results = await QuizResult.find({ userId: request.user.id })
            .sort({ completedAt: -1 });
        
        return {
            success: true,
            results: results.map(r => ({
                id: r._id.toString(),
                quizId: r.quizId,
                quizTitle: r.quizTitle,
                score: r.score,
                totalQuestions: r.totalQuestions,
                resultMessage: r.resultMessage,
                completedAt: r.completedAt.toISOString()
            }))
        };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LIKED SONGS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Like a song
     */
    fastify.post('/liked-songs', {
        schema: {
            tags: ['Reflect'],
            summary: 'Like a song',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['songId', 'title', 'audioUrl', 'source'],
                properties: {
                    songId: { type: 'string' },
                    title: { type: 'string' },
                    artist: { type: 'string' },
                    audioUrl: { type: 'string' },
                    source: { type: 'string' },
                    duration: { type: 'number' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { songId, title, artist, audioUrl, source, duration } = request.body;
        
        // Upsert to handle duplicates
        const song = await LikedSong.findOneAndUpdate(
            { userId: request.user.id, songId, source },
            {
                userId: request.user.id,
                songId,
                title,
                artist: artist || 'Unknown',
                audioUrl,
                source,
                duration: duration || 0,
                likedAt: new Date()
            },
            { upsert: true, new: true }
        );
        
        return reply.code(201).send({
            success: true,
            song: {
                id: song._id.toString(),
                songId: song.songId,
                title: song.title,
                artist: song.artist,
                audioUrl: song.audioUrl,
                source: song.source,
                likedAt: song.likedAt.toISOString()
            }
        });
    });
    
    /**
     * Unlike a song
     */
    fastify.delete('/liked-songs/:songId', {
        schema: {
            tags: ['Reflect'],
            summary: 'Unlike a song',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    songId: { type: 'string' }
                }
            },
            querystring: {
                type: 'object',
                properties: {
                    source: { type: 'string' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { songId } = request.params;
        const { source } = request.query;
        
        const query = { userId: request.user.id, songId };
        if (source) query.source = source;
        
        await LikedSong.deleteOne(query);
        
        return { success: true };
    });
    
    /**
     * Get liked songs
     */
    fastify.get('/liked-songs', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get liked songs',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    source: { type: 'string' }
                }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { source } = request.query;
        const query = { userId: request.user.id };
        if (source) query.source = source;
        
        const songs = await LikedSong.find(query)
            .sort({ likedAt: -1 });
        
        return {
            success: true,
            songs: songs.map(s => ({
                id: s._id.toString(),
                songId: s.songId,
                title: s.title,
                artist: s.artist,
                audioUrl: s.audioUrl,
                source: s.source,
                duration: s.duration,
                likedAt: s.likedAt.toISOString()
            }))
        };
    });
    
    /**
     * Get random liked song (for breathing page)
     */
    fastify.get('/liked-songs/random', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get a random liked song',
            security: [{ bearerAuth: [] }]
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const count = await LikedSong.countDocuments({ userId: request.user.id });
        
        if (count === 0) {
            return { success: true, song: null };
        }
        
        const randomIndex = Math.floor(Math.random() * count);
        const song = await LikedSong.findOne({ userId: request.user.id })
            .skip(randomIndex);
        
        return {
            success: true,
            song: {
                id: song._id.toString(),
                songId: song.songId,
                title: song.title,
                artist: song.artist,
                audioUrl: song.audioUrl,
                source: song.source,
                duration: song.duration
            }
        };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // COMBINED REFLECT PAGE DATA
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get all reflect data for a user (for Reflect page display)
     */
    fastify.get('/summary', {
        schema: {
            tags: ['Reflect'],
            summary: 'Get all reflect data summary',
            security: [{ bearerAuth: [] }]
        },
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const userId = request.user.id;
        
        // Get all data in parallel
        const [
            recentMoods,
            questProgress,
            testResultsSummary,
            quizResults,
            routineCompletions
        ] = await Promise.all([
            HomeMood.find({ userId }).sort({ createdAt: -1 }).limit(10),
            QuestProgress.findOne({ userId }),
            TestResult.aggregate([
                { $match: { userId } },
                { 
                    $group: {
                        _id: '$testId',
                        testTitle: { $first: '$testTitle' },
                        count: { $sum: 1 },
                        lastCompleted: { $max: '$completedAt' }
                    }
                }
            ]),
            QuizResult.find({ userId }).sort({ completedAt: -1 }).limit(10),
            RoutineCompletion.find({ userId }).sort({ completedDate: -1 }).limit(30)
        ]);
        
        return {
            success: true,
            data: {
                recentMoods: recentMoods.map(m => ({
                    id: m._id.toString(),
                    moodIndex: m.moodIndex,
                    moodLabel: m.moodLabel,
                    moodEmoji: m.moodEmoji,
                    note: m.note,
                    createdAt: m.createdAt.toISOString()
                })),
                quest: questProgress ? {
                    completedCount: questProgress.completedTests.length,
                    totalRequired: questProgress.totalRequired,
                    badgeEarned: questProgress.badgeEarned,
                    badgeType: questProgress.badgeType
                } : null,
                completedTests: testResultsSummary.length,
                testResults: testResultsSummary.map(t => ({
                    testId: t._id,
                    testTitle: t.testTitle,
                    completedCount: t.count,
                    lastCompleted: t.lastCompleted.toISOString()
                })),
                quizResults: quizResults.map(q => ({
                    id: q._id.toString(),
                    quizId: q.quizId,
                    quizTitle: q.quizTitle,
                    score: q.score,
                    completedAt: q.completedAt.toISOString()
                })),
                routineStreak: calculateStreak(routineCompletions)
            }
        };
    });
}

/**
 * Calculate routine streak
 */
function calculateStreak(completions) {
    if (!completions.length) return 0;
    
    const dates = [...new Set(completions.map(c => c.completedDate))].sort().reverse();
    
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // Check if today or yesterday has completions
    if (dates[0] !== today && dates[0] !== yesterday) return 0;
    
    for (let i = 0; i < dates.length; i++) {
        const expectedDate = new Date(Date.now() - (i * 86400000)).toISOString().split('T')[0];
        if (dates[i] === expectedDate || (i === 0 && dates[i] === yesterday)) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}
