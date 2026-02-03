import { MoodEntry } from '../models/mood.model.js';

/**
 * Mood Tracking Routes
 */
export default async function moodRoutes(fastify) {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Create Mood Entry
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.post('/', {
    schema: {
      tags: ['Mood'],
      summary: 'Create a new mood entry',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['moodLevel'],
        properties: {
          note: { type: 'string', maxLength: 2000 },
          moodLevel: { type: 'number', minimum: 0, maximum: 1 },
          feelings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                isPositive: { type: 'boolean' }
              }
            }
          },
          activities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                emoji: { type: 'string' }
              }
            }
          },
          photoUri: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            entry: { type: 'object' }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { note, moodLevel, feelings, activities, photoUri } = request.body;

    const entry = await MoodEntry.create({
      userId: request.user.id,
      note: note || '',
      moodLevel,
      feelings: feelings || [],
      activities: activities || [],
      photoUri,
      createdAt: new Date()
    });

    fastify.log.info(`Mood entry created for user: ${request.user.id}`);

    return reply.code(201).send({
      success: true,
      entry: {
        id: entry._id.toString(),
        note: entry.note,
        moodLevel: entry.moodLevel,
        feelings: entry.feelings,
        activities: entry.activities,
        photoUri: entry.photoUri,
        createdAt: entry.createdAt.toISOString()
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Get Mood History
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/', {
    schema: {
      tags: ['Mood'],
      summary: 'Get mood history',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 30, maximum: 100 },
          offset: { type: 'integer', default: 0 },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { limit = 30, offset = 0, startDate, endDate } = request.query;

    const query = { userId: request.user.id };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const entries = await MoodEntry.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    const total = await MoodEntry.countDocuments(query);

    return {
      success: true,
      entries: entries.map(entry => ({
        id: entry._id.toString(),
        note: entry.note,
        moodLevel: entry.moodLevel,
        feelings: entry.feelings,
        activities: entry.activities,
        photoUri: entry.photoUri,
        createdAt: entry.createdAt.toISOString()
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Get Single Mood Entry
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/:id', {
    schema: {
      tags: ['Mood'],
      summary: 'Get a specific mood entry',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const entry = await MoodEntry.findOne({
      _id: request.params.id,
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
        note: entry.note,
        moodLevel: entry.moodLevel,
        feelings: entry.feelings,
        activities: entry.activities,
        photoUri: entry.photoUri,
        createdAt: entry.createdAt.toISOString()
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Delete Mood Entry
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.delete('/:id', {
    schema: {
      tags: ['Mood'],
      summary: 'Delete a mood entry',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const result = await MoodEntry.findOneAndDelete({
      _id: request.params.id,
      userId: request.user.id
    });

    if (!result) {
      return reply.code(404).send({
        success: false,
        error: 'Entry not found'
      });
    }

    return {
      success: true,
      message: 'Entry deleted'
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Get Mood Statistics
  // ═══════════════════════════════════════════════════════════════════════════
  
  fastify.get('/stats/summary', {
    schema: {
      tags: ['Mood'],
      summary: 'Get mood statistics summary',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 30 }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { days = 30 } = request.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const entries = await MoodEntry.find({
      userId: request.user.id,
      createdAt: { $gte: startDate }
    });

    if (entries.length === 0) {
      return {
        success: true,
        stats: {
          totalEntries: 0,
          averageMood: null,
          topFeelings: [],
          topActivities: [],
          moodTrend: []
        }
      };
    }

    // Calculate average mood
    const averageMood = entries.reduce((sum, e) => sum + e.moodLevel, 0) / entries.length;

    // Count feelings
    const feelingCounts = {};
    entries.forEach(e => {
      e.feelings.forEach(f => {
        feelingCounts[f.label] = (feelingCounts[f.label] || 0) + 1;
      });
    });
    const topFeelings = Object.entries(feelingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    // Count activities
    const activityCounts = {};
    entries.forEach(e => {
      e.activities.forEach(a => {
        activityCounts[a.label] = (activityCounts[a.label] || 0) + 1;
      });
    });
    const topActivities = Object.entries(activityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    // Daily mood trend
    const dailyMoods = {};
    entries.forEach(e => {
      const day = e.createdAt.toISOString().split('T')[0];
      if (!dailyMoods[day]) {
        dailyMoods[day] = { sum: 0, count: 0 };
      }
      dailyMoods[day].sum += e.moodLevel;
      dailyMoods[day].count += 1;
    });
    const moodTrend = Object.entries(dailyMoods)
      .map(([date, data]) => ({
        date,
        average: data.sum / data.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      stats: {
        totalEntries: entries.length,
        averageMood: Math.round(averageMood * 100) / 100,
        topFeelings,
        topActivities,
        moodTrend
      }
    };
  });
}
