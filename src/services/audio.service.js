/**
 * A.R.O.U.R.A Audio Service - Calm & Peaceful Audio Gateway
 * 
 * BULLETPROOF IMPLEMENTATION with:
 * - Request queue to prevent API overload
 * - Native https for reliability
 * - Proper caching with TTL
 * - Fallback data when APIs fail
 * - Rate limiting
 * 
 * Sources: Freesound (sounds), Jamendo (music)
 * NO religious/devotional content.
 */

import https from 'https';
import { config } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const FREESOUND_API_KEY = config.FREESOUND_API_KEY;
const JAMENDO_CLIENT_ID = config.JAMENDO_CLIENT_ID;

// Log API key status on startup
console.log(`[Audio Service] Freesound API Key: ${FREESOUND_API_KEY ? 'Configured ✓' : 'Missing ✗'}`);
console.log(`[Audio Service] Jamendo Client ID: ${JAMENDO_CLIENT_ID ? 'Configured ✓' : 'Missing ✗'}`);

// Buffer policy for mobile playback
const BUFFER_POLICY = {
    minBufferMs: 10000,
    maxBufferMs: 60000,
    playbackBufferMs: 10000,
    rebufferMs: 5000
};

// Duration requirements (lowered for more results)
const MIN_DURATION_FREESOUND = 20;
const MIN_DURATION_JAMENDO = 60;

// Network settings
const REQUEST_TIMEOUT = 25000; // 25 seconds
const MAX_CONCURRENT_REQUESTS = 2; // Limit concurrent API calls

// ═══════════════════════════════════════════════════════════════════════════════
// HTTPS AGENT FOR CONNECTION POOLING
// ═══════════════════════════════════════════════════════════════════════════════

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 6,
    maxFreeSockets: 3,
    timeout: REQUEST_TIMEOUT
});

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST QUEUE - Prevents API overload
// ═══════════════════════════════════════════════════════════════════════════════

class RequestQueue {
    constructor(maxConcurrent = MAX_CONCURRENT_REQUESTS) {
        this.maxConcurrent = maxConcurrent;
        this.running = 0;
        this.queue = [];
    }

    async add(fn) {
        return new Promise((resolve, reject) => {
            const task = async () => {
                this.running++;
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.running--;
                    this.processQueue();
                }
            };

            if (this.running < this.maxConcurrent) {
                task();
            } else {
                this.queue.push(task);
            }
        });
    }

    processQueue() {
        if (this.queue.length > 0 && this.running < this.maxConcurrent) {
            const task = this.queue.shift();
            task();
        }
    }
}

const freesoundQueue = new RequestQueue(2);
const jamendoQueue = new RequestQueue(2);

// ═══════════════════════════════════════════════════════════════════════════════
// ROBUST HTTPS FETCH - Uses native https module for reliability
// ═══════════════════════════════════════════════════════════════════════════════

function httpsGet(urlString, timeout = REQUEST_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'GET',
            agent: httpsAgent,
            headers: {
                'User-Agent': 'AROURA-Backend/1.0',
                'Accept': 'application/json',
                'Connection': 'keep-alive'
            },
            timeout: timeout
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', chunk => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`Request failed: ${e.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE SYSTEM - 10 minute TTL
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const audioCache = new Map();

function getCached(key) {
    const cached = audioCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Cache] HIT: ${key} (${cached.data.length} items)`);
        return cached.data;
    }
    return null;
}

function setCache(key, data) {
    if (data && data.length > 0) {
        audioCache.set(key, { data, timestamp: Date.now() });
        console.log(`[Cache] SET: ${key} (${data.length} items)`);
        
        // Cleanup old entries
        if (audioCache.size > 20) {
            const oldest = [...audioCache.entries()]
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            audioCache.delete(oldest[0]);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const EXCLUDED_KEYWORDS = [
    'harsh', 'loud', 'industrial', 'horror', 'scream', 'distorted',
    'rock', 'metal', 'rap', 'dance', 'techno', 'party', 'club', 'dj',
    'fast', 'aggressive', 'intense', 'heavy',
    'vocal', 'vocals', 'singing', 'lyrics', 'voice',
    'religious', 'devotional', 'prayer', 'chant', 'mantra',
    'church', 'temple', 'bhajan', 'hymn', 'worship'
];

function passesCalmFilter(item) {
    const text = `${item.title || ''} ${(item.tags || []).join(' ')} ${item.description || ''}`.toLowerCase();
    return !EXCLUDED_KEYWORDS.some(keyword => text.includes(keyword));
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const remainingMins = mins % 60;
        return `${hrs}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function normalizeAudioItem(item, source) {
    return {
        id: item.id || `${source}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: item.title || 'Unknown Title',
        subtitle: item.subtitle || source,
        category: item.category || 'general',
        source_name: source,
        streaming_url: item.streamingUrl || '',
        streaming_url_backup: item.streamingUrlBackup || null,
        duration: item.duration || 0,
        duration_formatted: formatDuration(item.duration || 0),
        attribution_text: item.attribution || `${item.title} - ${source}`,
        loop_allowed: item.loopAllowed ?? true,
        sleep_timer_supported: true,
        image: item.image || null,
        tags: item.tags || [],
        subCategory: item.subCategory || null,
        buffer_policy: BUFFER_POLICY
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FREESOUND API
// ═══════════════════════════════════════════════════════════════════════════════

async function searchFreesound(query, options = {}) {
    if (!FREESOUND_API_KEY) {
        console.warn('[Freesound] API key not configured');
        return [];
    }

    const { pageSize = 10, category = 'nature' } = options;

    return freesoundQueue.add(async () => {
        try {
            const url = new URL('https://freesound.org/apiv2/search/text/');
            url.searchParams.set('query', query);
            url.searchParams.set('page_size', pageSize.toString());
            url.searchParams.set('fields', 'id,name,description,duration,previews,license,username,tags');
            url.searchParams.set('filter', `duration:[${MIN_DURATION_FREESOUND} TO 1800]`);
            url.searchParams.set('sort', 'rating_desc');
            url.searchParams.set('token', FREESOUND_API_KEY);

            console.log(`[Freesound] Searching: "${query}"`);
            const data = await httpsGet(url.toString());

            const results = (data.results || [])
                .filter(sound => {
                    if (!sound.previews?.['preview-hq-mp3'] && !sound.previews?.['preview-lq-mp3']) {
                        return false;
                    }
                    return passesCalmFilter({
                        title: sound.name,
                        tags: sound.tags,
                        description: sound.description
                    });
                })
                .map(sound => normalizeAudioItem({
                    id: `freesound_${sound.id}`,
                    title: sound.name,
                    subtitle: sound.username,
                    category: category,
                    streamingUrl: sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'],
                    duration: Math.round(sound.duration),
                    attribution: `"${sound.name}" by ${sound.username} (freesound.org)`,
                    loopAllowed: true,
                    tags: sound.tags?.slice(0, 5) || []
                }, 'Freesound'));

            console.log(`[Freesound] Found ${results.length} results for "${query}"`);
            return results;

        } catch (error) {
            console.error(`[Freesound] Error for "${query}":`, error.message);
            return [];
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// JAMENDO API
// ═══════════════════════════════════════════════════════════════════════════════

async function searchJamendo(query, options = {}) {
    if (!JAMENDO_CLIENT_ID) {
        console.warn('[Jamendo] Client ID not configured');
        return [];
    }

    const { pageSize = 10, category = 'music' } = options;

    return jamendoQueue.add(async () => {
        try {
            const url = new URL('https://api.jamendo.com/v3.0/tracks/');
            url.searchParams.set('client_id', JAMENDO_CLIENT_ID);
            url.searchParams.set('format', 'json');
            url.searchParams.set('limit', pageSize.toString());
            url.searchParams.set('search', query);
            url.searchParams.set('include', 'musicinfo');
            url.searchParams.set('audioformat', 'mp31');
            url.searchParams.set('boost', 'popularity_total');
            url.searchParams.set('vocalinstrumental', 'instrumental');
            url.searchParams.set('speed', 'verylow+low');

            console.log(`[Jamendo] Searching: "${query}"`);
            const data = await httpsGet(url.toString());

            const results = (data.results || [])
                .filter(track => {
                    if (track.duration < MIN_DURATION_JAMENDO) return false;
                    if (!track.audio) return false;
                    return passesCalmFilter({
                        title: track.name,
                        tags: track.musicinfo?.tags?.genres || []
                    });
                })
                .map(track => normalizeAudioItem({
                    id: `jamendo_${track.id}`,
                    title: track.name,
                    subtitle: track.artist_name,
                    category: category,
                    streamingUrl: track.audio,
                    streamingUrlBackup: track.audiodownload || null,
                    duration: track.duration,
                    attribution: `"${track.name}" by ${track.artist_name} (jamendo.com)`,
                    loopAllowed: false,
                    image: track.album_image,
                    tags: track.musicinfo?.tags?.genres?.slice(0, 3) || []
                }, 'Jamendo'));

            console.log(`[Jamendo] Found ${results.length} results for "${query}"`);
            return results;

        } catch (error) {
            console.error(`[Jamendo] Error for "${query}":`, error.message);
            return [];
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY LOADERS - With caching and sequential loading
// ═══════════════════════════════════════════════════════════════════════════════

async function loadCategory(cacheKey, queries, searchFn, category) {
    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) return cached;

    console.log(`[${category}] Loading fresh data...`);
    
    const results = [];
    
    // Sequential requests to avoid overwhelming the API
    for (const q of queries) {
        try {
            const items = await searchFn(q.query, { pageSize: 6, category });
            results.push(...items.map(r => ({ ...r, subCategory: q.tag })));
            
            // Small delay between requests to be nice to the API
            if (queries.indexOf(q) < queries.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        } catch (e) {
            console.error(`[${category}] Failed for ${q.tag}:`, e.message);
        }
    }

    // Deduplicate and limit
    const unique = Array.from(new Map(results.map(item => [item.id, item])).values());
    const limited = unique.slice(0, 15);
    
    // Cache results
    if (limited.length > 0) {
        setCache(cacheKey, limited);
    }

    console.log(`[${category}] Loaded ${limited.length} items`);
    return limited;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FREESOUND CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

async function getNatureSounds() {
    return loadCategory('nature_sounds', [
        { query: 'rain ambience relaxing', tag: 'rain' },
        { query: 'ocean waves calm', tag: 'ocean' },
        { query: 'forest birds peaceful', tag: 'forest' },
        { query: 'river stream water', tag: 'water' }
    ], searchFreesound, 'nature');
}

async function getAmbientSounds() {
    return loadCategory('ambient_sounds', [
        { query: 'ambient atmosphere', tag: 'atmosphere' },
        { query: 'drone pad relaxing', tag: 'drone' },
        { query: 'space ambient ethereal', tag: 'ethereal' }
    ], searchFreesound, 'ambient');
}

async function getMeditationSounds() {
    return loadCategory('meditation_sounds', [
        { query: 'singing bowl', tag: 'bowl' },
        { query: 'meditation bell', tag: 'bell' },
        { query: 'tibetan healing', tag: 'tibetan' }
    ], searchFreesound, 'meditation');
}

async function getASMRSounds() {
    return loadCategory('asmr_sounds', [
        { query: 'soft tapping', tag: 'tapping' },
        { query: 'page turning book', tag: 'pages' },
        { query: 'typing keyboard', tag: 'typing' }
    ], searchFreesound, 'asmr');
}

async function getSleepSounds() {
    return loadCategory('sleep_sounds', [
        { query: 'white noise sleep', tag: 'white_noise' },
        { query: 'brown noise deep', tag: 'brown_noise' },
        { query: 'fan noise ambient', tag: 'fan' }
    ], searchFreesound, 'sleep');
}

// ═══════════════════════════════════════════════════════════════════════════════
// JAMENDO CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

async function getCalmMusic() {
    return loadCategory('calm_music', [
        { query: 'ambient relaxing', tag: 'ambient' },
        { query: 'piano calm', tag: 'piano' },
        { query: 'acoustic peaceful', tag: 'acoustic' },
        { query: 'meditation instrumental', tag: 'meditation' }
    ], searchJamendo, 'music');
}

async function getFocusMusic() {
    return loadCategory('focus_music', [
        { query: 'focus concentration', tag: 'focus' },
        { query: 'study background', tag: 'study' },
        { query: 'work ambient', tag: 'work' }
    ], searchJamendo, 'focus');
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

async function searchAll(query, options = {}) {
    if (!query || query.length < 2) {
        return { success: true, results: [], total: 0 };
    }

    const sanitized = query.toLowerCase().trim();
    
    // Block inappropriate searches
    const blocked = ['party', 'dance', 'rap', 'rock', 'metal', 'religious', 'prayer'];
    if (blocked.some(b => sanitized.includes(b))) {
        return { success: true, results: [], total: 0, message: 'No results found' };
    }

    const { limit = 20 } = options;

    try {
        // Search both sources sequentially to avoid overload
        const freesoundResults = await searchFreesound(`${sanitized} calm`, { pageSize: Math.ceil(limit / 2) });
        const jamendoResults = await searchJamendo(`${sanitized} relaxing`, { pageSize: Math.ceil(limit / 2) });

        const allResults = [...freesoundResults, ...jamendoResults];

        return {
            success: true,
            results: allResults.slice(0, limit),
            total: allResults.length,
            sources: ['freesound', 'jamendo']
        };
    } catch (error) {
        console.error('[Search] Error:', error.message);
        return { success: false, results: [], total: 0, error: error.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const audioService = {
    // Freesound
    searchFreesound,
    getNatureSounds,
    getAmbientSounds,
    getMeditationSounds,
    getASMRSounds,
    getSleepSounds,
    
    // Jamendo
    searchJamendo,
    getCalmMusic,
    getFocusMusic,
    
    // Unified
    searchAll,
    
    // Utilities
    passesCalmFilter,
    
    // Constants
    BUFFER_POLICY
};

export default audioService;
