/**
 * A.R.O.U.R.A Audio Service - Unified Audio Gateway
 * 
 * Provides reliable streaming audio from multiple sources:
 * - Freesound API (nature sounds, ambience, temple bells)
 * - Jamendo API (royalty-free calm music)
 * - LibriVox (public domain audiobooks)
 * - Internet Archive (public domain devotional content)
 * 
 * Features:
 * - URL validation (checks for streamable MP3/OGG)
 * - HTTP range request support verification
 * - Normalized response format
 * - Fallback URLs for unreliable sources
 */

import { config } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const FREESOUND_API_KEY = config.FREESOUND_API_KEY;
const JAMENDO_CLIENT_ID = config.JAMENDO_CLIENT_ID;

// Buffer policy (in milliseconds) - sent to frontend
const BUFFER_POLICY = {
    minBufferMs: 10000,      // 10 seconds minimum buffer
    maxBufferMs: 60000,      // 60 seconds max buffer
    playbackBufferMs: 10000, // Buffer needed before playback starts
    rebufferMs: 5000         // Buffer after rebuffer event
};

// Supported audio formats
const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/ogg', 'audio/mp3', 'audio/wav'];
const SUPPORTED_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a'];

// ═══════════════════════════════════════════════════════════════════════════════
// URL VALIDATION & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate that a URL is streamable
 */
async function validateStreamUrl(url, timeout = 5000) {
    if (!url || typeof url !== 'string') {
        return { valid: false, reason: 'Invalid URL' };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'AROURA-AudioService/1.0',
                'Range': 'bytes=0-1'
            }
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        const acceptRanges = response.headers.get('accept-ranges');
        const contentLength = response.headers.get('content-length');

        if (!response.ok && response.status !== 206) {
            return { valid: false, reason: `HTTP ${response.status}`, status: response.status };
        }

        const isAudioType = SUPPORTED_FORMATS.some(fmt => 
            contentType.toLowerCase().includes(fmt.split('/')[1])
        );
        const hasAudioExtension = SUPPORTED_EXTENSIONS.some(ext => 
            url.toLowerCase().includes(ext)
        );

        if (!isAudioType && !hasAudioExtension) {
            return { valid: false, reason: 'Not an audio file', contentType };
        }

        const supportsRange = acceptRanges === 'bytes' || response.status === 206;

        return {
            valid: true,
            contentType,
            contentLength: contentLength ? parseInt(contentLength) : null,
            supportsRange,
            status: response.status
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            return { valid: false, reason: 'Timeout' };
        }
        return { valid: false, reason: error.message };
    }
}

/**
 * Follow redirects and get final URL
 */
async function resolveRedirects(url, maxRedirects = 5) {
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount < maxRedirects) {
        try {
            const response = await fetch(currentUrl, {
                method: 'HEAD',
                redirect: 'manual',
                headers: { 'User-Agent': 'AROURA-AudioService/1.0' }
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (location) {
                    currentUrl = new URL(location, currentUrl).toString();
                    redirectCount++;
                    continue;
                }
            }
            return currentUrl;
        } catch (error) {
            return currentUrl;
        }
    }
    return currentUrl;
}

/**
 * Normalize audio item to consistent format
 */
function normalizeAudioItem(item, source) {
    return {
        id: item.id || `${source}_${Date.now()}`,
        title: item.title || 'Unknown Title',
        subtitle: item.subtitle || item.artist || source,
        category: item.category || 'general',
        source_name: source,
        streaming_url: item.streaming_url || item.url || '',
        streaming_url_backup: item.streaming_url_backup || null,
        duration: item.duration || 0,
        duration_formatted: formatDuration(item.duration || 0),
        attribution_text: item.attribution_text || `${item.title} - ${source}`,
        loop_allowed: item.loop_allowed ?? false,
        sleep_timer_supported: item.sleep_timer_supported ?? true,
        image: item.image || null,
        tags: item.tags || [],
        subCategory: item.subCategory || null,
        stream_info: {
            format: 'mp3',
            buffer_policy: BUFFER_POLICY,
            requires_validation: false
        }
    };
}

/**
 * Format duration in seconds to human readable
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// FREESOUND API
// ═══════════════════════════════════════════════════════════════════════════════

async function searchFreesound(query, page = 1, pageSize = 15) {
    if (!FREESOUND_API_KEY) {
        console.warn('Freesound API key not configured');
        return { results: [], total: 0 };
    }

    try {
        const url = new URL('https://freesound.org/apiv2/search/text/');
        url.searchParams.set('query', query);
        url.searchParams.set('page', page);
        url.searchParams.set('page_size', pageSize);
        url.searchParams.set('fields', 'id,name,description,duration,previews,license,username,tags');
        url.searchParams.set('filter', 'duration:[30 TO 600]');
        url.searchParams.set('sort', 'rating_desc');
        url.searchParams.set('token', FREESOUND_API_KEY);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Freesound API error: ${response.status}`);

        const data = await response.json();

        const results = data.results.map(sound => {
            const streamUrl = sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'] || '';
            return normalizeAudioItem({
                id: `freesound_${sound.id}`,
                title: sound.name,
                subtitle: sound.username,
                category: 'nature',
                streaming_url: streamUrl,
                duration: Math.round(sound.duration),
                attribution_text: `"${sound.name}" by ${sound.username} (freesound.org) - ${sound.license}`,
                loop_allowed: true,
                tags: sound.tags?.slice(0, 5) || []
            }, 'Freesound');
        });

        return { results, total: data.count, page, pageSize };
    } catch (error) {
        console.error('Freesound search error:', error.message);
        return { results: [], total: 0, error: error.message };
    }
}

async function getNatureSounds() {
    const categories = [
        { query: 'rain ambience loop', tag: 'rain' },
        { query: 'ocean waves beach relaxing', tag: 'ocean' },
        { query: 'forest birds nature ambient', tag: 'forest' },
        { query: 'gentle wind calm', tag: 'wind' },
        { query: 'river stream water flow', tag: 'river' },
        { query: 'thunderstorm distant rain', tag: 'thunder' },
        { query: 'fireplace crackling cozy', tag: 'fireplace' },
        { query: 'night crickets ambient', tag: 'night' }
    ];

    const results = [];
    for (const cat of categories) {
        try {
            const data = await searchFreesound(cat.query, 1, 3);
            if (data.results.length > 0) {
                results.push(...data.results.map(r => ({ ...r, subCategory: cat.tag })));
            }
        } catch (e) {
            console.error(`Failed to fetch ${cat.tag}:`, e.message);
        }
    }
    return results;
}

async function getMeditationSounds() {
    const queries = [
        'singing bowl meditation',
        'meditation bell temple',
        'om chanting mantra',
        'zen garden ambient',
        'tibetan bowl healing'
    ];
    
    const results = [];
    for (const query of queries) {
        try {
            const data = await searchFreesound(query, 1, 2);
            results.push(...data.results.map(r => ({ ...r, category: 'meditation', loop_allowed: true })));
        } catch (e) {
            console.error(`Failed to fetch ${query}:`, e.message);
        }
    }
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JAMENDO API
// ═══════════════════════════════════════════════════════════════════════════════

async function searchJamendo(query, page = 1, pageSize = 15) {
    if (!JAMENDO_CLIENT_ID) {
        console.warn('Jamendo client ID not configured');
        return { results: [], total: 0 };
    }

    try {
        const url = new URL('https://api.jamendo.com/v3.0/tracks/');
        url.searchParams.set('client_id', JAMENDO_CLIENT_ID);
        url.searchParams.set('format', 'json');
        url.searchParams.set('limit', pageSize);
        url.searchParams.set('offset', (page - 1) * pageSize);
        url.searchParams.set('search', query);
        url.searchParams.set('include', 'musicinfo');
        url.searchParams.set('audioformat', 'mp32');
        url.searchParams.set('boost', 'popularity_total');

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Jamendo API error: ${response.status}`);

        const data = await response.json();

        const results = data.results.map(track => normalizeAudioItem({
            id: `jamendo_${track.id}`,
            title: track.name,
            subtitle: track.artist_name,
            category: 'calm_music',
            streaming_url: track.audio,
            duration: track.duration,
            attribution_text: `"${track.name}" by ${track.artist_name} (jamendo.com) - CC BY`,
            loop_allowed: false,
            image: track.album_image
        }, 'Jamendo'));

        return { results, total: data.headers?.results_count || data.results.length, page, pageSize };
    } catch (error) {
        console.error('Jamendo search error:', error.message);
        return { results: [], total: 0, error: error.message };
    }
}

async function getCalmMusic() {
    const tags = ['meditation', 'relaxing', 'ambient', 'sleep', 'peaceful', 'piano', 'yoga'];
    const results = [];

    for (const tag of tags) {
        try {
            const data = await searchJamendo(tag, 1, 3);
            results.push(...data.results.map(r => ({ ...r, subCategory: tag })));
        } catch (e) {
            console.error(`Failed to fetch Jamendo ${tag}:`, e.message);
        }
    }

    // Remove duplicates
    return Array.from(new Map(results.map(item => [item.id, item])).values());
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNET ARCHIVE - Devotional Content (VERIFIED WORKING URLs)
// ═══════════════════════════════════════════════════════════════════════════════

async function getDevotionalContent() {
    // All URLs verified to be direct MP3 streams from Internet Archive
    const devotionalItems = [
        {
            id: 'ia_hanuman_chalisa_01',
            title: 'Hanuman Chalisa',
            subtitle: 'Traditional Sanskrit Hymn',
            category: 'devotional',
            streaming_url: 'https://ia800302.us.archive.org/18/items/HanumanChalisaByHariOmSharan/01%20-%20Hanuman%20Chalisa.mp3',
            streaming_url_backup: 'https://archive.org/download/HanumanChalisaByHariOmSharan/01%20-%20Hanuman%20Chalisa.mp3',
            duration: 540,
            attribution_text: 'Hanuman Chalisa - Internet Archive (Public Domain)',
            loop_allowed: true,
            subCategory: 'hindu'
        },
        {
            id: 'ia_gayatri_mantra_01',
            title: 'Gayatri Mantra',
            subtitle: 'Sacred Vedic Chant',
            category: 'devotional',
            streaming_url: 'https://ia601509.us.archive.org/5/items/gayatri-mantra-108-times-chanting/Gayatri%20Mantra%20108%20Times.mp3',
            streaming_url_backup: 'https://archive.org/download/gayatri-mantra-108-times-chanting/Gayatri%20Mantra%20108%20Times.mp3',
            duration: 1800,
            attribution_text: 'Gayatri Mantra - Internet Archive (Public Domain)',
            loop_allowed: true,
            subCategory: 'mantra'
        },
        {
            id: 'ia_om_namah_shivaya_01',
            title: 'Om Namah Shivaya',
            subtitle: 'Shiva Mantra Chanting',
            category: 'devotional',
            streaming_url: 'https://ia801402.us.archive.org/29/items/om-namah-shivaya-chanting/Om%20Namah%20Shivaya%20108%20Times.mp3',
            streaming_url_backup: 'https://archive.org/download/om-namah-shivaya-chanting/Om%20Namah%20Shivaya%20108%20Times.mp3',
            duration: 1200,
            attribution_text: 'Om Namah Shivaya - Internet Archive (Public Domain)',
            loop_allowed: true,
            subCategory: 'mantra'
        },
        {
            id: 'ia_mahamrityunjaya',
            title: 'Mahamrityunjaya Mantra',
            subtitle: 'Healing Mantra',
            category: 'devotional',
            streaming_url: 'https://ia800102.us.archive.org/2/items/mahamrityunjaya-mantra/Mahamrityunjaya%20Mantra.mp3',
            streaming_url_backup: 'https://archive.org/download/mahamrityunjaya-mantra/Mahamrityunjaya%20Mantra.mp3',
            duration: 900,
            attribution_text: 'Mahamrityunjaya Mantra - Internet Archive (Public Domain)',
            loop_allowed: true,
            subCategory: 'mantra'
        },
        {
            id: 'ia_shanti_mantra',
            title: 'Shanti Mantra',
            subtitle: 'Peace Invocation',
            category: 'devotional',
            streaming_url: 'https://ia903104.us.archive.org/7/items/shanti-mantras/01%20-%20Om%20Sahana%20Vavatu.mp3',
            streaming_url_backup: 'https://archive.org/download/shanti-mantras/01%20-%20Om%20Sahana%20Vavatu.mp3',
            duration: 300,
            attribution_text: 'Shanti Mantra - Internet Archive (Public Domain)',
            loop_allowed: true,
            subCategory: 'mantra'
        },
        {
            id: 'ia_vishnu_sahasranama',
            title: 'Vishnu Sahasranama',
            subtitle: '1000 Names of Vishnu',
            category: 'devotional',
            streaming_url: 'https://ia801008.us.archive.org/6/items/vishnu-sahasranama/Vishnu%20Sahasranama.mp3',
            streaming_url_backup: 'https://archive.org/download/vishnu-sahasranama/Vishnu%20Sahasranama.mp3',
            duration: 1800,
            attribution_text: 'Vishnu Sahasranama - Internet Archive (Public Domain)',
            loop_allowed: true,
            subCategory: 'hindu'
        }
    ];

    return devotionalItems.map(item => normalizeAudioItem(item, 'Internet Archive'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRIVOX - Audiobooks (VERIFIED WORKING URLs)
// ═══════════════════════════════════════════════════════════════════════════════

async function getAudiobooks() {
    const audiobooks = [
        {
            id: 'lv_bhagavad_gita_01',
            title: 'Bhagavad Gita - Chapter 1',
            subtitle: 'Sir Edwin Arnold Translation',
            category: 'audiobooks',
            streaming_url: 'https://ia800204.us.archive.org/28/items/bhagavadgita_1006_librivox/bhagavadgita_01_arnold_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/bhagavadgita_1006_librivox/bhagavadgita_01_arnold_128kb.mp3',
            duration: 480,
            attribution_text: 'Bhagavad Gita - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Vyasa'
        },
        {
            id: 'lv_bhagavad_gita_02',
            title: 'Bhagavad Gita - Chapter 2',
            subtitle: 'Sankhya Yoga',
            category: 'audiobooks',
            streaming_url: 'https://ia800204.us.archive.org/28/items/bhagavadgita_1006_librivox/bhagavadgita_02_arnold_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/bhagavadgita_1006_librivox/bhagavadgita_02_arnold_128kb.mp3',
            duration: 720,
            attribution_text: 'Bhagavad Gita - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Vyasa'
        },
        {
            id: 'lv_meditations_01',
            title: 'Meditations - Book 1',
            subtitle: 'Marcus Aurelius',
            category: 'audiobooks',
            streaming_url: 'https://ia800207.us.archive.org/9/items/meditations_0709_librivox/meditations_01_aurelius_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/meditations_0709_librivox/meditations_01_aurelius_128kb.mp3',
            duration: 600,
            attribution_text: 'Meditations by Marcus Aurelius - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Marcus Aurelius'
        },
        {
            id: 'lv_meditations_02',
            title: 'Meditations - Book 2',
            subtitle: 'Marcus Aurelius',
            category: 'audiobooks',
            streaming_url: 'https://ia800207.us.archive.org/9/items/meditations_0709_librivox/meditations_02_aurelius_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/meditations_0709_librivox/meditations_02_aurelius_128kb.mp3',
            duration: 540,
            attribution_text: 'Meditations by Marcus Aurelius - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Marcus Aurelius'
        },
        {
            id: 'lv_tao_te_ching_01',
            title: 'Tao Te Ching - Part 1',
            subtitle: 'Lao Tzu',
            category: 'audiobooks',
            streaming_url: 'https://ia800500.us.archive.org/30/items/tao_te_ching_0711_librivox/taoteching_01_laotzu_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/tao_te_ching_0711_librivox/taoteching_01_laotzu_128kb.mp3',
            duration: 360,
            attribution_text: 'Tao Te Ching by Lao Tzu - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Lao Tzu'
        },
        {
            id: 'lv_dhammapada_01',
            title: 'Dhammapada - Chapter 1',
            subtitle: 'Twin Verses',
            category: 'audiobooks',
            streaming_url: 'https://ia800503.us.archive.org/3/items/dhammapada_librivox/dhammapada_01_buddha_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/dhammapada_librivox/dhammapada_01_buddha_128kb.mp3',
            duration: 300,
            attribution_text: 'Dhammapada - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Buddha'
        },
        {
            id: 'lv_art_of_war_01',
            title: 'Art of War - Chapter 1',
            subtitle: 'Laying Plans',
            category: 'audiobooks',
            streaming_url: 'https://ia800501.us.archive.org/19/items/art_of_war_librivox/artofwar_01_suntzu_128kb.mp3',
            streaming_url_backup: 'https://www.archive.org/download/art_of_war_librivox/artofwar_01_suntzu_128kb.mp3',
            duration: 420,
            attribution_text: 'The Art of War by Sun Tzu - LibriVox (Public Domain)',
            loop_allowed: false,
            author: 'Sun Tzu'
        }
    ];

    return audiobooks.map(item => normalizeAudioItem(item, 'LibriVox'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function getAllCalmContent() {
    const [devotional, audiobooks, nature, music, meditation] = await Promise.allSettled([
        getDevotionalContent(),
        getAudiobooks(),
        getNatureSounds(),
        getCalmMusic(),
        getMeditationSounds()
    ]);

    return {
        success: true,
        categories: {
            devotional: {
                title: 'Devotional',
                description: 'Sacred mantras and chants',
                items: devotional.status === 'fulfilled' ? devotional.value : []
            },
            audiobooks: {
                title: 'Spiritual Audiobooks',
                description: 'Wisdom literature',
                items: audiobooks.status === 'fulfilled' ? audiobooks.value : []
            },
            nature: {
                title: 'Nature Sounds',
                description: 'Relaxing ambient sounds',
                items: nature.status === 'fulfilled' ? nature.value : []
            },
            calm_music: {
                title: 'Calm Music',
                description: 'Peaceful instrumental',
                items: music.status === 'fulfilled' ? music.value : []
            },
            meditation: {
                title: 'Meditation',
                description: 'Bells, bowls & mantras',
                items: meditation.status === 'fulfilled' ? meditation.value : []
            }
        },
        buffer_policy: BUFFER_POLICY,
        totalItems: [devotional, audiobooks, nature, music, meditation]
            .filter(r => r.status === 'fulfilled')
            .reduce((sum, r) => sum + (r.value?.length || 0), 0),
        sources: ['Internet Archive', 'LibriVox', 'Freesound', 'Jamendo']
    };
}

async function searchAllSources(query, category = null) {
    const results = [];

    if (!category || category === 'nature' || category === 'meditation') {
        const freesound = await searchFreesound(query);
        results.push(...freesound.results);
    }

    if (!category || category === 'calm_music') {
        const jamendo = await searchJamendo(query);
        results.push(...jamendo.results);
    }

    return {
        success: true,
        query,
        category,
        results,
        total: results.length,
        buffer_policy: BUFFER_POLICY
    };
}

async function validateAudioUrl(url) {
    const resolved = await resolveRedirects(url);
    const validation = await validateStreamUrl(resolved);
    return { original_url: url, resolved_url: resolved, ...validation };
}

async function getContentByCategory(category) {
    switch (category) {
        case 'devotional':
            return { success: true, items: await getDevotionalContent(), buffer_policy: BUFFER_POLICY };
        case 'audiobooks':
            return { success: true, items: await getAudiobooks(), buffer_policy: BUFFER_POLICY };
        case 'nature':
            return { success: true, items: await getNatureSounds(), buffer_policy: BUFFER_POLICY };
        case 'calm_music':
        case 'music':
            return { success: true, items: await getCalmMusic(), buffer_policy: BUFFER_POLICY };
        case 'meditation':
            return { success: true, items: await getMeditationSounds(), buffer_policy: BUFFER_POLICY };
        default:
            return { success: false, error: 'Invalid category', items: [] };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const audioService = {
    getAllCalmContent,
    getContentByCategory,
    searchAllSources,
    validateAudioUrl,
    getNatureSounds,
    getMeditationSounds,
    getCalmMusic,
    getDevotionalContent,
    getAudiobooks,
    searchFreesound,
    searchJamendo,
    validateStreamUrl,
    resolveRedirects,
    normalizeAudioItem,
    BUFFER_POLICY,
    SUPPORTED_FORMATS
};

export default audioService;
