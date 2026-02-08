/**
 * A.R.O.U.R.A Chat Routes
 * 
 * RESTful + SSE endpoints for AI chat:
 * - POST /chat/message - Send message and get streaming response
 * - GET /chat/conversations - List user's conversations
 * - GET /chat/conversation/:id - Get specific conversation
 * - GET /chat/conversation/:id/messages - Get messages with pagination
 * - DELETE /chat/conversation/:id - Delete/archive conversation
 * - POST /chat/conversation/new - Start new conversation
 */

import Conversation from '../models/chat.model.js';
import { geminiService } from '../services/gemini.service.js';
import { redisService } from '../services/redis.service.js';
import mongoose from 'mongoose';

/**
 * Register chat routes
 */
async function chatRoutes(fastify, options) {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MIDDLEWARE: Auth check for all routes
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.addHook('preHandler', async (request, reply) => {
        // Debug: Log authorization header
        const authHeader = request.headers.authorization;
        fastify.log.info(`Auth header present: ${!!authHeader}, length: ${authHeader?.length || 0}`);
        
        // Verify JWT token
        try {
            await request.jwtVerify();
            fastify.log.info(`JWT verified for user: ${request.user?.id}`);
        } catch (err) {
            fastify.log.error(`JWT verification failed: ${err.message}`);
            return reply.code(401).send({ 
                success: false,
                error: 'Unauthorized', 
                message: 'Invalid or expired token' 
            });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // POST /chat/message - Send message with streaming response (SSE)
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.post('/message', {
        schema: {
            body: {
                type: 'object',
                required: ['message', 'persona'],
                properties: {
                    message: { type: 'string', minLength: 1, maxLength: 5000 },
                    persona: { type: 'string', enum: ['counselor', 'bestfriend'] },
                    conversationId: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { message, persona, conversationId } = request.body;
        const userId = request.user.id;
        
        try {
            // Rate limiting
            const rateCheck = await redisService.checkRateLimit(userId, 30, 60);
            if (!rateCheck.allowed) {
                return reply.code(429).send({
                    error: 'Rate limit exceeded',
                    retryAfter: rateCheck.resetIn
                });
            }
            
            // Get or create conversation
            let conversation;
            if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
                conversation = await Conversation.findOne({
                    _id: conversationId,
                    userId,
                    persona,
                    status: 'active'
                });
            }
            
            if (!conversation) {
                conversation = await Conversation.getOrCreateConversation(userId, persona, {
                    platform: 'android'
                });
            }
            
            // Acquire lock to prevent race conditions
            const lockAcquired = await redisService.acquireLock(conversation._id.toString());
            if (!lockAcquired) {
                return reply.code(409).send({
                    error: 'Conversation busy',
                    message: 'Please wait for the previous message to complete'
                });
            }
            
            try {
                // Check for crisis indicators
                const crisisCheck = geminiService.detectCrisisIndicators(message);
                
                // Add user message to conversation
                await conversation.addMessage('user', message);
                
                // Set typing indicator
                await redisService.setTyping(userId, persona, true);
                
                // Invalidate message cache
                await redisService.invalidateMessageCache(conversation._id.toString());
                
                // Get recent messages for context
                const recentMessages = conversation.getRecentMessages(6000);
                
                let aiResponse;
                
                // If crisis detected, use crisis response
                if (crisisCheck.detected && crisisCheck.severity === 'high') {
                    aiResponse = {
                        success: true,
                        content: geminiService.getCrisisResponse(persona, crisisCheck.severity),
                        latency: 0,
                        tokenCount: 0,
                        crisisDetected: true
                    };
                } else {
                    // Generate AI response
                    aiResponse = await geminiService.generateResponse(
                        persona,
                        recentMessages.slice(0, -1), // Exclude the message we just added
                        message
                    );
                }
                
                // Clear typing indicator
                await redisService.setTyping(userId, persona, false);
                
                if (!aiResponse.success) {
                    return reply.code(500).send({
                        error: 'AI generation failed',
                        message: aiResponse.error,
                        blocked: aiResponse.safetyBlock || false
                    });
                }
                
                // Add AI response to conversation
                const assistantMessage = await conversation.addMessage('assistant', aiResponse.content, {
                    latencyMs: aiResponse.latency,
                    model: 'gemini-1.5-flash',
                    flagged: crisisCheck.detected,
                    flagCategory: crisisCheck.detected ? crisisCheck.severity : undefined
                });
                
                // Update active conversation in Redis
                await redisService.setActiveConversation(userId, persona, conversation._id.toString());
                
                // Return response matching Android's expected format
                return {
                    success: true,
                    conversationId: conversation._id.toString(),
                    messageId: assistantMessage._id.toString(),
                    response: aiResponse.content,
                    isCrisis: crisisCheck.detected,
                    metadata: {
                        latency: aiResponse.latency,
                        tokenCount: aiResponse.tokenCount,
                        crisisDetected: crisisCheck.detected,
                        remaining: rateCheck.remaining
                    }
                };
                
            } finally {
                // Always release lock
                await redisService.releaseLock(conversation._id.toString());
            }
            
        } catch (error) {
            console.error('Chat message error:', error);
            await redisService.setTyping(userId, persona, false);
            
            // Handle specific error types
            if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('Too Many Requests')) {
                return reply.code(429).send({
                    success: false,
                    error: 'Rate limit exceeded',
                    message: 'AI service is temporarily unavailable. Please try again in a few moments.',
                    retryAfter: 10
                });
            }
            
            if (error.status === 404 || error.message?.includes('not found')) {
                return reply.code(503).send({
                    success: false,
                    error: 'Service unavailable',
                    message: 'AI model is currently unavailable. Please try again later.'
                });
            }
            
            return reply.code(500).send({
                success: false,
                error: 'Internal server error',
                message: 'Failed to process message. Please try again.'
            });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // POST /chat/message/stream - Send message with SSE streaming
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.post('/message/stream', {
        schema: {
            body: {
                type: 'object',
                required: ['message', 'persona'],
                properties: {
                    message: { type: 'string', minLength: 1, maxLength: 5000 },
                    persona: { type: 'string', enum: ['counselor', 'bestfriend'] },
                    conversationId: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { message, persona, conversationId } = request.body;
        const userId = request.user.id;
        
        // Set SSE headers
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        });
        
        const sendSSE = (event, data) => {
            reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        
        try {
            // Rate limiting
            const rateCheck = await redisService.checkRateLimit(userId, 30, 60);
            if (!rateCheck.allowed) {
                sendSSE('error', { error: 'Rate limit exceeded', retryAfter: rateCheck.resetIn });
                reply.raw.end();
                return;
            }
            
            // Get or create conversation
            let conversation;
            if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
                conversation = await Conversation.findOne({
                    _id: conversationId,
                    userId,
                    persona,
                    status: 'active'
                });
            }
            
            if (!conversation) {
                conversation = await Conversation.getOrCreateConversation(userId, persona, {
                    platform: 'android'
                });
            }
            
            // Send conversation info
            sendSSE('conversation', { conversationId: conversation._id.toString() });
            
            // Acquire lock
            const lockAcquired = await redisService.acquireLock(conversation._id.toString());
            if (!lockAcquired) {
                sendSSE('error', { error: 'Conversation busy' });
                reply.raw.end();
                return;
            }
            
            try {
                // Check for crisis indicators
                const crisisCheck = geminiService.detectCrisisIndicators(message);
                
                // Add user message
                await conversation.addMessage('user', message);
                sendSSE('user_message_saved', { success: true });
                
                // Set typing indicator
                await redisService.setTyping(userId, persona, true);
                sendSSE('typing', { isTyping: true });
                
                // Get recent messages for context
                const recentMessages = conversation.getRecentMessages(6000);
                
                let fullResponse = '';
                const startTime = Date.now();
                
                // If crisis detected, send crisis response directly
                if (crisisCheck.detected && crisisCheck.severity === 'high') {
                    const crisisResponse = geminiService.getCrisisResponse(persona, crisisCheck.severity);
                    
                    // Simulate streaming for consistency
                    const words = crisisResponse.split(' ');
                    for (let i = 0; i < words.length; i++) {
                        const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
                        fullResponse += chunk;
                        sendSSE('chunk', { content: chunk, index: i });
                        await new Promise(r => setTimeout(r, 30)); // Small delay for natural feel
                    }
                    
                } else {
                    // Stream AI response
                    const stream = geminiService.generateStreamingResponse(
                        persona,
                        recentMessages.slice(0, -1),
                        message
                    );
                    
                    for await (const event of stream) {
                        if (event.type === 'chunk') {
                            fullResponse += event.content;
                            sendSSE('chunk', {
                                content: event.content,
                                index: event.index
                            });
                        } else if (event.type === 'error') {
                            sendSSE('error', {
                                error: event.error,
                                safetyBlock: event.safetyBlock
                            });
                            break;
                        }
                    }
                }
                
                const latency = Date.now() - startTime;
                
                // Clear typing indicator
                await redisService.setTyping(userId, persona, false);
                sendSSE('typing', { isTyping: false });
                
                // Save assistant message
                if (fullResponse) {
                    const assistantMessage = await conversation.addMessage('assistant', fullResponse, {
                        latencyMs: latency,
                        model: 'gemini-1.5-flash',
                        flagged: crisisCheck.detected,
                        flagCategory: crisisCheck.detected ? crisisCheck.severity : undefined
                    });
                    
                    // Update active conversation
                    await redisService.setActiveConversation(userId, persona, conversation._id.toString());
                    
                    // Invalidate cache
                    await redisService.invalidateMessageCache(conversation._id.toString());
                    
                    sendSSE('done', {
                        messageId: assistantMessage._id.toString(),
                        fullContent: fullResponse,
                        latency,
                        tokenCount: geminiService.estimateTokens(fullResponse),
                        crisisDetected: crisisCheck.detected
                    });
                }
                
            } finally {
                await redisService.releaseLock(conversation._id.toString());
            }
            
        } catch (error) {
            console.error('Stream error:', error);
            sendSSE('error', { error: 'Stream failed' });
        }
        
        reply.raw.end();
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GET /chat/conversations - List user's conversations
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/conversations', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    persona: { type: 'string', enum: ['counselor', 'bestfriend'] },
                    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
                }
            }
        }
    }, async (request, reply) => {
        const userId = request.user.id;
        const { persona, limit } = request.query;
        
        try {
            const conversations = await Conversation.getUserConversations(userId, persona, limit);
            
            return {
                success: true,
                conversations: conversations.map(c => ({
                    id: c._id,
                    title: c.title,
                    persona: c.persona,
                    messageCount: c.messageCount,
                    lastMessageAt: c.lastMessageAt,
                    createdAt: c.createdAt
                }))
            };
        } catch (error) {
            console.error('List conversations error:', error);
            return reply.code(500).send({ error: 'Failed to fetch conversations' });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GET /chat/conversation/:id - Get conversation details
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/conversation/:id', async (request, reply) => {
        const { id } = request.params;
        const userId = request.user.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return reply.code(400).send({ error: 'Invalid conversation ID' });
        }
        
        try {
            const conversation = await Conversation.findOne({
                _id: id,
                userId,
                status: { $ne: 'deleted' }
            });
            
            if (!conversation) {
                return reply.code(404).send({ error: 'Conversation not found' });
            }
            
            return {
                success: true,
                conversation: {
                    id: conversation._id,
                    title: conversation.title,
                    persona: conversation.persona,
                    status: conversation.status,
                    messageCount: conversation.messageCount,
                    totalTokens: conversation.totalTokens,
                    lastMessageAt: conversation.lastMessageAt,
                    createdAt: conversation.createdAt,
                    messages: conversation.messages.map(m => ({
                        id: m._id,
                        role: m.role,
                        content: m.content,
                        createdAt: m.createdAt
                    }))
                }
            };
        } catch (error) {
            console.error('Get conversation error:', error);
            return reply.code(500).send({ error: 'Failed to fetch conversation' });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GET /chat/conversation/:id/messages - Get messages with pagination
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/conversation/:id/messages', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
                    before: { type: 'string' } // Message ID for cursor pagination
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params;
        const { limit, before } = request.query;
        const userId = request.user.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return reply.code(400).send({ error: 'Invalid conversation ID' });
        }
        
        try {
            // Try cache first
            const cached = await redisService.getCachedMessages(id);
            if (cached && !before) {
                return {
                    success: true,
                    messages: cached,
                    fromCache: true
                };
            }
            
            const conversation = await Conversation.findOne({
                _id: id,
                userId,
                status: { $ne: 'deleted' }
            });
            
            if (!conversation) {
                return reply.code(404).send({ error: 'Conversation not found' });
            }
            
            let messages = conversation.messages;
            
            // Apply cursor pagination
            if (before && mongoose.Types.ObjectId.isValid(before)) {
                const beforeIndex = messages.findIndex(m => m._id.toString() === before);
                if (beforeIndex > 0) {
                    messages = messages.slice(0, beforeIndex);
                }
            }
            
            // Get last N messages
            messages = messages.slice(-limit);
            
            const formattedMessages = messages.map(m => ({
                id: m._id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt
            }));
            
            // Cache if fetching recent messages
            if (!before) {
                await redisService.cacheRecentMessages(id, formattedMessages);
            }
            
            return {
                success: true,
                messages: formattedMessages,
                hasMore: conversation.messages.length > messages.length
            };
        } catch (error) {
            console.error('Get messages error:', error);
            return reply.code(500).send({ error: 'Failed to fetch messages' });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // POST /chat/conversation/new - Start a new conversation
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.post('/conversation/new', {
        schema: {
            body: {
                type: 'object',
                required: ['persona'],
                properties: {
                    persona: { type: 'string', enum: ['counselor', 'bestfriend'] },
                    title: { type: 'string', maxLength: 200 }
                }
            }
        }
    }, async (request, reply) => {
        const { persona, title } = request.body;
        const userId = request.user.id;
        
        try {
            // Archive any existing active conversations for this persona
            await Conversation.updateMany(
                { userId, persona, status: 'active' },
                { status: 'archived' }
            );
            
            // Create new conversation
            const conversation = await Conversation.create({
                userId,
                persona,
                title: title || 'New Conversation',
                sessionInfo: {
                    startedAt: new Date(),
                    platform: 'android'
                }
            });
            
            // Update Redis
            await redisService.setActiveConversation(userId, persona, conversation._id.toString());
            
            return {
                success: true,
                conversation: {
                    id: conversation._id,
                    title: conversation.title,
                    persona: conversation.persona,
                    createdAt: conversation.createdAt
                }
            };
        } catch (error) {
            console.error('Create conversation error:', error);
            return reply.code(500).send({ error: 'Failed to create conversation' });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DELETE /chat/conversation/:id - Delete/archive conversation
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.delete('/conversation/:id', async (request, reply) => {
        const { id } = request.params;
        const userId = request.user.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return reply.code(400).send({ error: 'Invalid conversation ID' });
        }
        
        try {
            const result = await Conversation.updateOne(
                { _id: id, userId },
                { status: 'deleted' }
            );
            
            if (result.matchedCount === 0) {
                return reply.code(404).send({ error: 'Conversation not found' });
            }
            
            // Invalidate cache
            await redisService.invalidateMessageCache(id);
            
            return { success: true, message: 'Conversation deleted' };
        } catch (error) {
            console.error('Delete conversation error:', error);
            return reply.code(500).send({ error: 'Failed to delete conversation' });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GET /chat/active - Get active conversation for persona
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/active/:persona', async (request, reply) => {
        const { persona } = request.params;
        const userId = request.user.id;
        
        if (!['counselor', 'bestfriend'].includes(persona)) {
            return reply.code(400).send({ error: 'Invalid persona' });
        }
        
        try {
            // Check Redis first
            const activeId = await redisService.getActiveConversation(userId, persona);
            
            if (activeId) {
                const conversation = await Conversation.findOne({
                    _id: activeId,
                    userId,
                    status: 'active'
                });
                
                if (conversation) {
                    return {
                        success: true,
                        hasActive: true,
                        conversation: {
                            id: conversation._id,
                            title: conversation.title,
                            messageCount: conversation.messageCount,
                            lastMessageAt: conversation.lastMessageAt
                        }
                    };
                }
            }
            
            // Fallback to DB query
            const conversation = await Conversation.findOne({
                userId,
                persona,
                status: 'active'
            }).sort({ lastMessageAt: -1 });
            
            if (conversation) {
                await redisService.setActiveConversation(userId, persona, conversation._id.toString());
                
                return {
                    success: true,
                    hasActive: true,
                    conversation: {
                        id: conversation._id,
                        title: conversation.title,
                        messageCount: conversation.messageCount,
                        lastMessageAt: conversation.lastMessageAt
                    }
                };
            }
            
            return {
                success: true,
                hasActive: false
            };
        } catch (error) {
            console.error('Get active conversation error:', error);
            return reply.code(500).send({ error: 'Failed to fetch active conversation' });
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GET /chat/health - Health check
    // ═══════════════════════════════════════════════════════════════════════════
    
    fastify.get('/health', { preHandler: [] }, async (request, reply) => {
        const [geminiHealth, redisHealth] = await Promise.all([
            geminiService.healthCheck(),
            redisService.healthCheck()
        ]);
        
        return {
            status: geminiHealth.healthy && redisHealth.healthy ? 'healthy' : 'degraded',
            services: {
                gemini: geminiHealth,
                redis: redisHealth
            }
        };
    });
}

export default chatRoutes;
