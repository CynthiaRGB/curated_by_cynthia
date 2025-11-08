// Claude query parser with caching and context-aware follow-up support
// Parses ALL user queries into structured ExtractedKeywords using Claude API

import { ExtractedKeywords, QueryContext } from '../../src/types/restaurant.js';
import { extractKeywords } from './filterService.js';

// Cache entry structure
interface CacheEntry {
  keywords: ExtractedKeywords;
  timestamp: number;
  query: string; // Store original query for debugging
}

// In-memory cache store
const cache = new Map<string, CacheEntry>();

// Default TTL: 24 hours (86,400,000 ms)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Maximum cache size to prevent memory issues (200 entries)
const MAX_CACHE_SIZE = 200;

/**
 * Generate a cache key from query, city, and context
 * Normalizes the query (lowercase, trim, remove extra spaces) for better cache hits
 * Includes context hash for follow-up queries to ensure different cache keys
 */
function generateCacheKey(query: string, city?: string, context?: QueryContext): string {
  const normalizedQuery = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
  
  const cityKey = city ? `_${city.toLowerCase()}` : '';
  
  let key = `${normalizedQuery}${cityKey}`;
  
  // Add context hash if it's a follow-up query
  // This ensures "show me more" after "Italian restaurants" has a different cache key
  if (context) {
    // Create a stable hash from previous keywords
    // Sort keys to ensure consistent hash regardless of property order
    const sortedKeys = Object.keys(context.previousKeywords).sort();
    const contextHash = JSON.stringify(context.previousKeywords, sortedKeys);
    
    // Create a simple hash from the string (for deterministic short hash)
    // This is a simple hash function - in production you might use crypto.createHash
    let hash = 0;
    for (let i = 0; i < contextHash.length; i++) {
      const char = contextHash.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive hex string (8 chars)
    const shortHash = Math.abs(hash).toString(16).substring(0, 8);
    key += `_ctx_${shortHash}`;
  }
  
  return key;
}

/**
 * Get cached keywords if available and not expired
 */
function getCachedKeywords(key: string): ExtractedKeywords | null {
  const entry = cache.get(key);
  
  if (!entry) {
    console.log(`[Parse Cache] Miss: ${key.substring(0, 50)}...`);
    return null;
  }
  
  // Check if expired
  const age = Date.now() - entry.timestamp;
  if (age > DEFAULT_TTL_MS) {
    console.log(`[Parse Cache] Expired (age: ${Math.round(age / 1000 / 60)}min): ${key.substring(0, 50)}...`);
    cache.delete(key);
    return null;
  }
  
  console.log(`[Parse Cache] Hit (age: ${Math.round(age / 1000 / 60)}min): ${key.substring(0, 50)}...`);
  return entry.keywords;
}

/**
 * Store keywords in cache
 */
function setCachedKeywords(key: string, keywords: ExtractedKeywords, query: string): void {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    cache.delete(oldestKey);
    console.log(`[Parse Cache] Evicted oldest entry: ${oldestKey.substring(0, 50)}...`);
  }
  
  cache.set(key, {
    keywords,
    timestamp: Date.now(),
    query,
  });
  
  console.log(`[Parse Cache] Stored: ${key.substring(0, 50)}... (cache size: ${cache.size})`);
}

/**
 * Check if query is a follow-up question
 */
function isFollowUpQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  
  // Patterns that indicate follow-up queries
  const followUpPatterns = [
    /^(show me )?more/i,
    /^(are there )?(any )?(cheaper|more affordable|less expensive)/i,
    /^(are there )?(any )?(more expensive|upscale|fancier)/i,
    /^(are there )?(any )?(better|higher rated)/i,
    /^(what about|how about)/i,
    /^(any )?(other|different)/i,
    /^(show me )?(different|other)/i,
  ];
  
  return followUpPatterns.some(pattern => pattern.test(lowerQuery));
}

/**
 * Build prompt for Claude API query parsing
 */
function buildQueryParsingPrompt(query: string, context?: QueryContext): string {
  let prompt = `You are parsing a restaurant search query into structured data. Extract all relevant information from the user's query.

USER QUERY: "${query}"`;

  // Add context if this is a follow-up
  if (context) {
    prompt += `\n\nCONTEXT (Previous Query): "${context.previousQuery}"
PREVIOUS KEYWORDS: ${JSON.stringify(context.previousKeywords, null, 2)}

This is a follow-up question. The user wants to modify or refine their previous search.`;
    
    // Detect what type of modification
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('cheaper') || lowerQuery.includes('more affordable') || lowerQuery.includes('less expensive')) {
      prompt += `\n\nThe user is asking for CHEAPER options. Update priceLevel to "budget" while keeping all other criteria from the previous search.`;
    } else if (lowerQuery.includes('more expensive') || lowerQuery.includes('upscale') || lowerQuery.includes('fancier')) {
      prompt += `\n\nThe user is asking for MORE EXPENSIVE/UPSCALE options. Update priceLevel to "upscale" while keeping all other criteria from the previous search.`;
    } else if (lowerQuery.includes('more') || lowerQuery.includes('other') || lowerQuery.includes('different')) {
      prompt += `\n\nThe user wants MORE results with the SAME criteria. Return the same keywords as the previous search.`;
    } else {
      prompt += `\n\nMerge any new criteria from the current query with the previous keywords. If the current query mentions something new (like a different price level, cuisine, or location), update that field. Otherwise, keep the previous values.`;
    }
  }

  prompt += `\n\nExtract the following information:
- Location (neighborhood, borough, city): Extract any location mentions. Support single neighborhood or array for multiple (e.g., "Shibuya or Ginza" -> ["shibuya", "ginza"])
- Cuisine type: Extract BROAD cuisine category (e.g., "japanese", "italian", "chinese", "french", "korean"). This is the general cuisine category.
- Cuisine specialty: Extract SPECIFIC DISH or SPECIALTY if mentioned (e.g., "pizza", "ramen", "yakitori", "unagi", "dim sum", "sushi", "pasta", "galettes", "crepes"). If no specific dish is mentioned, set to null. Examples:
  * "pizza in Manhattan" -> cuisineType: "italian", cuisineSpecialty: "pizza"
  * "dim sum in Chinatown" -> cuisineType: "chinese", cuisineSpecialty: "dim sum"
  * "yakitori in Tokyo" -> cuisineType: "japanese", cuisineSpecialty: "yakitori"
  * "Italian restaurants" -> cuisineType: "italian", cuisineSpecialty: null
- Meal type: Extract meal time preference ("breakfast", "brunch", "lunch", "dinner", "late-night", or null)
- Price level: Extract price preference ("budget", "moderate", "upscale", "any", or undefined)
- Amenities: Extract any amenity requirements (takeout, coffee availability)
- Vibes: Extract vibe keywords as an array (e.g., ["cozy", "lively", "romantic"])
- Occasion type: Extract occasion (e.g., "date_night", "business_lunch", "family_friendly", or null)
- Noise preference: Extract noise preference ("quiet", "any", or null)
- Special requirements: Extract boolean flags for instagrammable, michelin, cynthia's pick, coffee focus, dessert focus

IMPORTANT RULES:
1. Be precise - only extract information explicitly mentioned or strongly implied
2. For cuisine descriptors like "traditional", "authentic", "modern", etc., include them as part of the cuisine context but don't extract as separate fields
3. Never extract "cynthia's favorites" or related phrases as neighborhoods
4. City names: Extract as city field ("nyc", "tokyo", "seoul", "paris", or undefined)
5. Neighborhoods: Can be single string or array of strings
6. Cuisine type: Use lowercase, match common cuisine names (broad categories: italian, japanese, chinese, french, korean, etc.)
7. Cuisine specialty: Extract specific dishes/specialties separately from cuisine type. Common specialties include: pizza, ramen, yakitori, unagi, dim sum, sushi, pasta, galettes, crepes, pho, pad thai, etc. If no specific dish is mentioned, set to null.
8. For special queries like "Cynthia's favorites", set requiresCynthiasPick to true
9. Default all optional boolean fields to false if not mentioned
10. Default arrays to empty arrays if not mentioned
11. For follow-up queries, merge new information with previous keywords (don't lose previous criteria unless explicitly changed)

RESPONSE FORMAT:
Respond with ONLY valid JSON matching this exact structure (no markdown, no backticks, no extra text):
{
  "neighborhood": null | string | string[],
  "borough": null | "brooklyn" | "manhattan",
  "city": null | "nyc" | "tokyo" | "seoul" | "paris",
  "cuisineType": null | string,
  "cuisineSpecialty": null | string,
  "mealType": null | "breakfast" | "brunch" | "lunch" | "dinner" | "late-night",
  "priceLevel": null | "budget" | "moderate" | "upscale" | "any",
  "needsTakeout": boolean,
  "needsCoffee": boolean,
  "vibeKeywords": string[],
  "occasionType": null | string,
  "noisePreference": null | "quiet" | "any",
  "requiresInstagrammable": boolean,
  "requiresMichelin": boolean,
  "requiresCynthiasPick": boolean,
  "requiresCoffeeFocus": boolean,
  "requiresDessertFocus": boolean
}

DO NOT include markdown formatting. DO NOT include backticks. Return ONLY the raw JSON object.`;

  return prompt;
}

/**
 * Parse user query into structured ExtractedKeywords using Claude API
 * Supports follow-up questions with context merging
 * 
 * @param query - The user's query string
 * @param city - Optional city to include in cache key
 * @param context - Optional context from previous query for follow-ups
 * @returns ExtractedKeywords matching the query intent
 */
export async function parseQueryWithClaude(
  query: string,
  city?: string,
  context?: QueryContext
): Promise<ExtractedKeywords> {
  try {
    console.log(`[Parse Query] Parsing query: "${query}"${city ? ` (city: ${city})` : ''}${context ? ' (with context)' : ''}`);

    // Check cache first (include context in cache key for follow-up queries)
    const cacheKey = generateCacheKey(query, city, context);
    const cachedKeywords = getCachedKeywords(cacheKey);
    
    if (cachedKeywords) {
      return cachedKeywords;
    }

    // Get API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!anthropicApiKey) {
      console.warn('[Parse Query] ANTHROPIC_API_KEY not set, falling back to deterministic extraction');
      // Fallback to deterministic extraction
      try {
        return extractKeywords(query);
      } catch (fallbackError) {
        console.error('[Parse Query] Fallback extraction failed:', fallbackError);
        // Both API key missing and fallback failed - throw error
        throw new Error("I don't quite get your question, try something else");
      }
    }

    // Build the prompt
    const prompt = buildQueryParsingPrompt(query, context);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Parse Query] Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    console.log('[Parse Query] Raw Claude response:', responseText.slice(0, 200) + '...');

    // Parse Claude's JSON response
    // Strip any markdown formatting that might be present
    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsedKeywords: ExtractedKeywords;
    try {
      parsedKeywords = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('[Parse Query] Failed to parse Claude response:', cleanedResponse);
      throw new Error('Claude returned invalid JSON for query parsing');
    }

    // Ensure all required fields are present with proper defaults
    const keywords: ExtractedKeywords = {
      vibeKeywords: parsedKeywords.vibeKeywords || [],
      occasionType: parsedKeywords.occasionType || null,
      noisePreference: parsedKeywords.noisePreference || null,
      requiresInstagrammable: parsedKeywords.requiresInstagrammable || false,
      requiresMichelin: parsedKeywords.requiresMichelin || false,
      requiresCynthiasPick: parsedKeywords.requiresCynthiasPick || false,
      requiresCoffeeFocus: parsedKeywords.requiresCoffeeFocus || false,
      requiresDessertFocus: parsedKeywords.requiresDessertFocus || false,
      neighborhood: parsedKeywords.neighborhood || undefined,
      borough: parsedKeywords.borough || undefined,
      city: parsedKeywords.city || undefined,
      cuisineType: parsedKeywords.cuisineType || undefined,
      cuisineSpecialty: parsedKeywords.cuisineSpecialty || null,
      mealType: parsedKeywords.mealType || null,
      priceLevel: parsedKeywords.priceLevel || undefined,
      needsTakeout: parsedKeywords.needsTakeout || false,
      needsCoffee: parsedKeywords.needsCoffee || false,
    };

    console.log('[Parse Query] Parsed keywords:', JSON.stringify(keywords, null, 2));

    // Cache the result (cache key already includes context if present)
    setCachedKeywords(cacheKey, keywords, query);

    return keywords;

  } catch (error) {
    console.error('[Parse Query] Error calling Claude API, falling back to deterministic extraction:', error);
    // Fallback to deterministic extraction on error
    // This ensures we still get useful keywords even if Claude fails
    try {
      return extractKeywords(query);
    } catch (fallbackError) {
      console.error('[Parse Query] Fallback extraction also failed:', fallbackError);
      // Both Claude and fallback failed - throw error for recommend.ts to handle
      throw new Error("I don't quite get your question, try something else");
    }
  }
}

/**
 * Get empty ExtractedKeywords object (fallback on error)
 */
function getEmptyKeywords(): ExtractedKeywords {
  return {
    vibeKeywords: [],
    occasionType: null,
    noisePreference: null,
    requiresInstagrammable: false,
    requiresMichelin: false,
    requiresCynthiasPick: false,
    requiresCoffeeFocus: false,
    requiresDessertFocus: false,
  };
}

/**
 * Clear all cache entries (useful for testing or cache invalidation)
 */
export function clearParseCache(): void {
  cache.clear();
  console.log('[Parse Cache] Cleared all entries');
}

/**
 * Get cache statistics (for monitoring/debugging)
 */
export function getParseCacheStats(): {
  size: number;
  maxSize: number;
  entries: Array<{ key: string; age: number; query: string }>;
} {
  const entries = Array.from(cache.entries()).map(([key, entry]) => ({
    key: key.substring(0, 50) + '...',
    age: Date.now() - entry.timestamp,
    query: entry.query.substring(0, 50),
  }));
  
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    entries,
  };
}

