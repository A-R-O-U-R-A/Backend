/**
 * A.R.O.U.R.A Gemini AI Service
 * 
 * Google Gemini API integration for AI chat personas:
 * - AI Counselor (therapeutic support)
 * - AI Best Friend (casual companion)
 * 
 * Features:
 * - Streaming responses for real-time feel
 * - Context management
 * - Safety filtering
 * - Token counting
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let genAI = null;
let counselorModel = null;
let bestfriendModel = null;

// System prompts loaded from files
let COUNSELOR_SYSTEM_PROMPT = '';
let BESTFRIEND_SYSTEM_PROMPT = '';

/**
 * Initialize Gemini AI with API key and load system prompts
 */
function initializeGemini() {
    try {
        // Initialize Google Generative AI
        genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
        
        // Load system prompts from markdown files
        try {
            COUNSELOR_SYSTEM_PROMPT = readFileSync(
                join(__dirname, '../../system_Prompt.md'), 
                'utf-8'
            );
            console.log('✅ Counselor system prompt loaded');
        } catch (e) {
            console.warn('⚠️ Counselor prompt file not found, using default');
            COUNSELOR_SYSTEM_PROMPT = getDefaultCounselorPrompt();
        }
        
        try {
            BESTFRIEND_SYSTEM_PROMPT = readFileSync(
                join(__dirname, '../../system_prompt_bestfriend.md'), 
                'utf-8'
            );
            console.log('✅ Best Friend system prompt loaded');
        } catch (e) {
            console.warn('⚠️ Best Friend prompt file not found, using default');
            BESTFRIEND_SYSTEM_PROMPT = getDefaultBestFriendPrompt();
        }
        
        // Safety settings - more permissive for mental health support
        const safetySettings = [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
            }
        ];
        
        // Counselor model - lower temperature for consistency
        counselorModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            safetySettings,
            generationConfig: {
                temperature: 0.4,
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 1024
            }
        });
        
        // Best Friend model - higher temperature for personality
        bestfriendModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            safetySettings,
            generationConfig: {
                temperature: 0.75,
                topP: 0.95,
                topK: 50,
                maxOutputTokens: 512
            }
        });
        
        console.log('✅ Gemini AI initialized');
        return true;
    } catch (error) {
        console.error('❌ Gemini initialization failed:', error.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT PROMPTS (FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════════

function getDefaultCounselorPrompt() {
    return `You are a clinically-informed mental health support guide. You are not a licensed clinician. 
You do not diagnose, prescribe medication, or replace professional mental health care.
Your role is to support reflection, emotional regulation, and coping while encouraging professional support when needed.
Be warm, professional, and prioritize the therapeutic alliance.
If someone expresses self-harm or suicidal thoughts, provide supportive safety language and encourage professional help.`;
}

function getDefaultBestFriendPrompt() {
    return `You are Aurora, a warm and supportive AI best friend. 
You're NOT a therapist - you're a caring friend who listens without judgment.
Use casual, friendly language. Match the user's energy.
Validate feelings, celebrate wins, and be there for the tough moments.
If serious mental health concerns arise, gently encourage professional support while staying present.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a chat response (non-streaming) with retry logic
 */
async function generateResponse(persona, messages, userMessage, retryCount = 0) {
    const MAX_RETRIES = 3;
    const model = persona === 'counselor' ? counselorModel : bestfriendModel;
    const systemPrompt = persona === 'counselor' ? COUNSELOR_SYSTEM_PROMPT : BESTFRIEND_SYSTEM_PROMPT;
    
    if (!model) {
        throw new Error('Gemini not initialized');
    }
    
    try {
        // Build conversation history
        const history = buildChatHistory(messages, systemPrompt);
        
        // Start chat session
        const chat = model.startChat({
            history,
            generationConfig: {
                maxOutputTokens: persona === 'counselor' ? 1024 : 512
            }
        });
        
        // Generate response
        const startTime = Date.now();
        const result = await chat.sendMessage(userMessage);
        const response = result.response;
        const latency = Date.now() - startTime;
        
        // Check for safety blocks
        if (response.promptFeedback?.blockReason) {
            return {
                success: false,
                error: 'Message blocked by safety filters',
                blockReason: response.promptFeedback.blockReason
            };
        }
        
        const text = response.text();
        
        return {
            success: true,
            content: text,
            latency,
            tokenCount: estimateTokens(text),
            finishReason: response.candidates?.[0]?.finishReason
        };
    } catch (error) {
        console.error('Gemini generation error:', error);
        
        // Retry on rate limit errors
        if ((error.status === 429 || error.message?.includes('429') || error.message?.includes('quota')) && retryCount < MAX_RETRIES) {
            const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
            console.log(`Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateResponse(persona, messages, userMessage, retryCount + 1);
        }
        
        // Handle specific errors
        if (error.message?.includes('SAFETY')) {
            return {
                success: false,
                error: 'Response blocked for safety reasons',
                safetyBlock: true
            };
        }
        
        // If all retries failed due to rate limit, return a fallback response
        if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate') || error.message?.includes('429')) {
            console.log('All retries failed, returning fallback response');
            const fallbackResponse = getFallbackResponse(persona, userMessage);
            return {
                success: true,
                content: fallbackResponse,
                latency: 0,
                tokenCount: 0,
                fallback: true
            };
        }
        
        throw error;
    }
}

/**
 * Get a fallback response when AI is unavailable
 */
function getFallbackResponse(persona, userMessage) {
    if (persona === 'counselor') {
        const responses = [
            "I hear you, and I appreciate you sharing that with me. I'm having some technical difficulties right now, but I want you to know that your feelings are valid. Please try again in a moment, and I'll be here to support you.",
            "Thank you for reaching out. I'm experiencing a temporary connection issue, but your well-being matters to me. Please take a deep breath and try again shortly. I'm here for you.",
            "I want to give you the thoughtful response you deserve, but I'm having some technical issues right now. Please know that whatever you're going through, you're not alone. Try again in a moment.",
            "Your message is important to me. I'm having a brief technical difficulty, but I don't want you to feel unheard. Please try again in a few seconds, and remember - it's okay to reach out for support."
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    } else {
        const responses = [
            "Hey! Sorry, I'm having a bit of a brain freeze moment 😅 Give me a sec and try again? I really wanna hear what you have to say!",
            "Oops! My connection got a little wonky there. Mind trying again? I'm all ears! 🎧",
            "Aw man, technical difficulties! 🙈 Don't worry though, try again in a moment and we'll pick up right where we left off!",
            "Hmm, I stumbled a bit there! Hit me up again? Can't wait to chat with you! ✨"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }
}

/**
 * Generate a streaming chat response
 */
async function* generateStreamingResponse(persona, messages, userMessage) {
    const model = persona === 'counselor' ? counselorModel : bestfriendModel;
    const systemPrompt = persona === 'counselor' ? COUNSELOR_SYSTEM_PROMPT : BESTFRIEND_SYSTEM_PROMPT;
    
    if (!model) {
        throw new Error('Gemini not initialized');
    }
    
    try {
        // Build conversation history
        const history = buildChatHistory(messages, systemPrompt);
        
        // Start chat session
        const chat = model.startChat({
            history,
            generationConfig: {
                maxOutputTokens: persona === 'counselor' ? 1024 : 512
            }
        });
        
        // Generate streaming response
        const startTime = Date.now();
        const result = await chat.sendMessageStream(userMessage);
        
        let fullText = '';
        let chunkIndex = 0;
        
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                fullText += chunkText;
                yield {
                    type: 'chunk',
                    content: chunkText,
                    index: chunkIndex++,
                    timestamp: Date.now()
                };
            }
        }
        
        const latency = Date.now() - startTime;
        
        // Final response metadata
        yield {
            type: 'done',
            fullContent: fullText,
            latency,
            tokenCount: estimateTokens(fullText)
        };
        
    } catch (error) {
        console.error('Gemini streaming error:', error);
        
        yield {
            type: 'error',
            error: error.message,
            safetyBlock: error.message?.includes('SAFETY'),
            rateLimited: error.message?.includes('quota') || error.message?.includes('rate')
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build chat history for Gemini format
 */
function buildChatHistory(messages, systemPrompt) {
    const history = [];
    
    // Add system prompt as first user message with model acknowledgment
    history.push({
        role: 'user',
        parts: [{ text: `[SYSTEM INSTRUCTIONS - Follow these guidelines for this conversation]\n\n${systemPrompt}\n\n[END SYSTEM INSTRUCTIONS]\n\nPlease acknowledge that you understand and will follow these guidelines.` }]
    });
    
    history.push({
        role: 'model',
        parts: [{ text: 'I understand and will follow these guidelines throughout our conversation. How can I help you today?' }]
    });
    
    // Add conversation history
    for (const msg of messages) {
        if (msg.role === 'system') continue; // Skip system messages
        
        history.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        });
    }
    
    return history;
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
}

/**
 * Check if message contains crisis indicators
 */
function detectCrisisIndicators(message) {
    const crisisPatterns = [
        /\b(kill|end|suicide|suicidal|die|dying|death)\s*(my)?self\b/i,
        /\bwant\s+to\s+(die|end\s+it|disappear)\b/i,
        /\b(self.?harm|cut(ting)?\s*myself|hurt\s*myself)\b/i,
        /\bno\s+(point|reason|hope)\s+(in\s+)?(living|life|anymore)\b/i,
        /\bcan'?t\s+(go\s+on|take\s+(it|this)\s+anymore)\b/i,
        /\bwish\s+i\s+(was|were)\s+(dead|never\s+born)\b/i,
        /\beveryone.*(better|off)\s*without\s*me\b/i
    ];
    
    const lowercaseMessage = message.toLowerCase();
    
    for (const pattern of crisisPatterns) {
        if (pattern.test(lowercaseMessage)) {
            return {
                detected: true,
                severity: 'high',
                pattern: pattern.toString()
            };
        }
    }
    
    // Medium severity indicators
    const mediumPatterns = [
        /\bhopeless\b/i,
        /\bworthless\b/i,
        /\bcan'?t\s+cope\b/i,
        /\bdon'?t\s+see\s+(a\s+)?(way\s+out|future)\b/i
    ];
    
    for (const pattern of mediumPatterns) {
        if (pattern.test(lowercaseMessage)) {
            return {
                detected: true,
                severity: 'medium',
                pattern: pattern.toString()
            };
        }
    }
    
    return { detected: false };
}

/**
 * Get crisis response override
 */
function getCrisisResponse(persona, severity) {
    if (persona === 'counselor') {
        if (severity === 'high') {
            return `I'm really glad you trusted me with this. What you're describing sounds very serious, and I want you to know that your safety matters deeply.

I'm not equipped to provide crisis support on my own, but I want to help you get through this safely. 

Are you able to reach out to someone you trust right now? Or would you be willing to contact a crisis helpline? 

Some resources that might help:
• National Crisis Helpline (US): 988
• Crisis Text Line: Text HOME to 741741
• International Association for Suicide Prevention: https://www.iasp.info/resources/Crisis_Centres/

I'm still here with you. You don't have to face this alone.`;
        }
        return `I'm hearing that things feel really overwhelming right now, and I want you to know that those feelings are valid.

What you're going through sounds incredibly difficult. I want to make sure you have the support you need.

Would you be open to talking about what's been weighing on you the most? And if at any point things feel too heavy, please know that reaching out to a crisis line or trusted person is always okay.

I'm here with you.`;
    } else {
        // Best Friend persona
        if (severity === 'high') {
            return `Hey, I really appreciate you trusting me with this. What you're describing sounds really heavy, and I care about you a lot.

This is something that's bigger than what I can help with as your friend – you deserve real support from someone trained to help with this.

Can you reach out to someone right now? A trusted person in your life, or a crisis helpline? I'm still here for you, but I want to make sure you're safe.

• Crisis line (US): 988
• Text HOME to 741741

You matter. Please reach out. 💙`;
        }
        return `Hey, I can hear that you're going through something really tough right now. That sounds so overwhelming.

I'm here for you, and I want you to know you don't have to carry this alone. Sometimes when things feel this heavy, talking to someone who really knows how to help – like a counselor – can make a difference.

For right now though, I'm here. What's been weighing on you the most?`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test Gemini API connectivity
 */
async function healthCheck() {
    if (!genAI) {
        return { healthy: false, error: 'Not initialized' };
    }
    
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const start = Date.now();
        const result = await model.generateContent('Say "OK" and nothing else.');
        const latency = Date.now() - start;
        
        return {
            healthy: true,
            latency,
            model: 'gemini-1.5-flash'
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const geminiService = {
    initialize: initializeGemini,
    generateResponse,
    generateStreamingResponse,
    detectCrisisIndicators,
    getCrisisResponse,
    estimateTokens,
    healthCheck,
    
    // Access prompts if needed
    getSystemPrompt: (persona) => persona === 'counselor' ? COUNSELOR_SYSTEM_PROMPT : BESTFRIEND_SYSTEM_PROMPT
};

export default geminiService;
