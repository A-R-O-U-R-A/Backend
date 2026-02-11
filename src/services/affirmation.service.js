/**
 * A.R.O.U.R.A Affirmation Service
 * 
 * Generates daily affirmations using Gemini AI
 * Features:
 * - Daily affirmation generation with Gemini
 * - Caching to avoid redundant API calls
 * - Fallback affirmations when AI is unavailable
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════════

const affirmationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK AFFIRMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const fallbackAffirmations = [
    "You are worthy of love and belonging exactly as you are.",
    "Your presence in this world makes a meaningful difference.",
    "It's okay to rest. You don't have to earn your worth through productivity.",
    "You are growing, even when it doesn't feel like it.",
    "Your feelings are valid, even when they're complicated.",
    "You deserve compassion, especially from yourself.",
    "Today, you are doing enough. You are enough.",
    "Your journey is unique, and comparison is not necessary.",
    "Healing isn't linear, and every small step counts.",
    "You have survived 100% of your hardest days so far.",
    "It's brave to ask for help when you need it.",
    "You are allowed to set boundaries that protect your peace.",
    "Your mental health matters as much as your physical health.",
    "Being kind to yourself is not selfish—it's necessary.",
    "You don't have to have it all figured out right now.",
    "Progress, not perfection, is what matters.",
    "Your thoughts don't define you; your actions do.",
    "Every new day is a chance to begin again.",
    "You are stronger than the challenges you face.",
    "It's okay to feel joy, even when things aren't perfect.",
    "You are allowed to take up space in this world.",
    "Your struggles do not diminish your worth.",
    "Self-care is not a reward; it's a requirement.",
    "You bring something special that no one else can.",
    "Mistakes are proof that you're trying and growing.",
    "You are capable of creating positive change in your life.",
    "Rest is productive. Your body and mind need it.",
    "You don't owe anyone an explanation for taking care of yourself.",
    "Today, choose to believe something good about yourself.",
    "Your peace is more important than proving a point."
];

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let genAI = null;
let affirmationModel = null;

function initializeGemini() {
    try {
        if (!config.GEMINI_API_KEY) {
            console.warn('⚠️ No Gemini API key for affirmations');
            return false;
        }
        
        genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
        affirmationModel = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                maxOutputTokens: 150
            }
        });
        
        console.log('✅ Affirmation Gemini model initialized');
        return true;
    } catch (error) {
        console.error('❌ Affirmation Gemini init failed:', error.message);
        return false;
    }
}

// Initialize on module load
initializeGemini();

// ═══════════════════════════════════════════════════════════════════════════════
// AFFIRMATION GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a daily affirmation using Gemini AI
 * @param {string} userId - Optional user ID for personalization
 * @param {object} context - Optional context (mood, time of day, etc.)
 */
async function generateDailyAffirmation(userId = null, context = {}) {
    // Create a date-based cache key (changes daily)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = userId ? `${userId}-${today}` : `global-${today}`;
    
    // Check cache first
    const cached = affirmationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return {
            success: true,
            affirmation: cached.affirmation,
            cached: true,
            generatedAt: cached.timestamp
        };
    }
    
    // Try Gemini generation
    if (affirmationModel) {
        try {
            const prompt = buildAffirmationPrompt(context);
            const result = await affirmationModel.generateContent(prompt);
            const response = result.response;
            let affirmation = response.text().trim();
            
            // Clean up the affirmation
            affirmation = cleanAffirmation(affirmation);
            
            // Cache the result
            affirmationCache.set(cacheKey, {
                affirmation,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                affirmation,
                cached: false,
                generatedAt: Date.now(),
                ai: true
            };
        } catch (error) {
            console.error('Gemini affirmation error:', error.message);
            // Fall through to fallback
        }
    }
    
    // Use fallback affirmation
    const fallbackIndex = getDailyFallbackIndex();
    const fallbackAffirmation = fallbackAffirmations[fallbackIndex];
    
    // Cache fallback too
    affirmationCache.set(cacheKey, {
        affirmation: fallbackAffirmation,
        timestamp: Date.now()
    });
    
    return {
        success: true,
        affirmation: fallbackAffirmation,
        cached: false,
        generatedAt: Date.now(),
        ai: false
    };
}

/**
 * Build the prompt for Gemini affirmation generation
 */
function buildAffirmationPrompt(context = {}) {
    const timeOfDay = getTimeOfDay();
    const mood = context.mood || null;
    
    let prompt = `Generate a single, warm, supportive daily affirmation for someone's mental wellness journey. 
    
Requirements:
- Keep it concise (1-2 sentences max, under 100 characters ideally)
- Make it feel personal and heartfelt, not generic
- Focus on self-compassion, growth, or inner peace
- Avoid clichés and overly used phrases
- Don't start with "You" every time - vary the structure
- Don't include quotation marks in the response
- Make it appropriate for ${timeOfDay}`;

    if (mood) {
        prompt += `\n- The person's recent mood was: ${mood}. Tailor the affirmation gently to support them.`;
    }
    
    prompt += `\n\nRespond with ONLY the affirmation text, nothing else.`;
    
    return prompt;
}

/**
 * Clean up AI-generated affirmation
 */
function cleanAffirmation(text) {
    // Remove quotes if present
    text = text.replace(/^["']|["']$/g, '');
    // Remove any markdown formatting
    text = text.replace(/\*\*/g, '');
    // Trim whitespace
    text = text.trim();
    // Ensure it doesn't exceed reasonable length
    if (text.length > 200) {
        const sentences = text.split(/[.!?]+/);
        text = sentences[0].trim() + '.';
    }
    return text;
}

/**
 * Get time of day for context
 */
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
}

/**
 * Get a consistent fallback index for the day
 */
function getDailyFallbackIndex() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    return dayOfYear % fallbackAffirmations.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const affirmationService = {
    generateDailyAffirmation,
    getFallbackAffirmations: () => [...fallbackAffirmations],
    clearCache: () => affirmationCache.clear()
};

export default affirmationService;
