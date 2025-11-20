// Claude query parser with context-aware follow-up support
// Parses ALL user queries into structured ExtractedKeywords using Claude API

import { ExtractedKeywords, QueryContext } from '../../src/types/restaurant.js';

// ============================================================================
// CACHING SYSTEM FOR PARSED QUERIES
// ============================================================================

interface ParsedQueryCacheEntry {
  keywords: ExtractedKeywords;
  timestamp: number;
  ttl: number; // TTL in milliseconds
}

// In-memory cache store
const parsedQueryCache = new Map<string, ParsedQueryCacheEntry>();

// Default TTL: 30 days (2,592,000,000 ms)
// Parsed queries are deterministic for same query + city, so caching is safe
// The prompt template never changes, so results are stable long-term
const DEFAULT_PARSED_QUERY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Maximum cache size to prevent memory issues (200 entries)
const MAX_PARSED_QUERY_CACHE_SIZE = 200;

/**
 * Generate a cache key from query and city
 * Normalizes the query (lowercase, trim, remove extra spaces) for better cache hits
 */
function generateParsedQueryCacheKey(query: string, city?: string): string {
  // Normalize query
  const normalizedQuery = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
  
  // Include city if provided
  const cityKey = city ? '_city:' + city.toLowerCase() : '';
  
  return normalizedQuery + cityKey;
}

/**
 * Get cached parsed query if available and not expired
 */
function getCachedParsedQuery(query: string, city?: string): ExtractedKeywords | null {
  const cacheKey = generateParsedQueryCacheKey(query, city);
  const entry = parsedQueryCache.get(cacheKey);
  
  if (!entry) {
    return null;
  }
  
  // Check if expired
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    parsedQueryCache.delete(cacheKey);
    return null;
  }
  
  console.log('[Parse Query Cache] Hit: ' + cacheKey.substring(0, 50) + '...');
  return entry.keywords;
}

/**
 * Store parsed query in cache
 */
function setCachedParsedQuery(
  query: string,
  city: string | undefined,
  keywords: ExtractedKeywords,
  ttlMs: number = DEFAULT_PARSED_QUERY_TTL_MS
): void {
  // Evict oldest entries if cache is full
  if (parsedQueryCache.size >= MAX_PARSED_QUERY_CACHE_SIZE) {
    const oldestKey = Array.from(parsedQueryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    parsedQueryCache.delete(oldestKey);
    console.log('[Parse Query Cache] Evicted oldest entry: ' + oldestKey.substring(0, 50) + '...');
  }
  
  const cacheKey = generateParsedQueryCacheKey(query, city);
  parsedQueryCache.set(cacheKey, {
    keywords,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
  
  console.log('[Parse Query Cache] Stored: ' + cacheKey.substring(0, 50) + '... (cache size: ' + parsedQueryCache.size + ')');
}

/**
 * Utility: delay helper for retries
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Restaurant Query Parser Prompt Template
 * 
 * This prompt parses natural language restaurant search queries into structured JSON data.
 * It handles location extraction, cuisine preferences, price levels, vibes, occasions, and special features.
 */
const RESTAURANT_QUERY_PARSER_PROMPT_TEMPLATE = `You are parsing a restaurant search query into structured data. Extract all relevant information from the user's query.

Parse restaurant query to JSON. Return {"error":"NOT_RESTAURANT_QUERY"} if not restaurant-related.

**USER QUERY:** "{{query}}"

## VALID VALUES. Finite - use ONLY what's listed

Boroughs (NYC): manhattan, brooklyn

Neighborhoods (extract ONLY if mentioned):
NYC: Crown Heights, Dumbo, East Village, Gramercy, Greenpoint, Greenwich Village, Lower East Side, Manhattan, Midtown, Midtown East, Midtown West, Murray Hill, Park Slope, SoHo, Southside, Tribeca, Upper East Side, Upper West Side, West Village, Williamsburg
Tokyo: Adachi City, Chiyoda City, Chuo City, Koto City, Machida, Meguro City, Minato City, Musashino, Nihonbashiningyōchō, Setagaya City, Shibuya, Shinjuku City, Sumida City, Taito City, Toranomon, Toshima City
Seoul: Gangnam District, Gwanak-gu, Gwangjin District, Jongno, Jongno District, Jung District, Mapo-gu, Nonhyeon-dong, Seodaemun-gu, Seongdong-gu, Songpa District, Yongsan District
Paris: 10th arrondissement, 11th arrondissement, 12th arrondissement, 15th arrondissement, 18th arrondissement, 1st arrondissement, 2nd arrondissement, 3rd arrondissement, 4th arrondissement, 5th arrondissement, 6th arrondissement, 7th arrondissement, 8th arrondissement, 9th arrondissement

mealType: breakfast, brunch, lunch, dinner

priceLevel: budget, moderate, upscale, luxury, any

occasionType: anniversary, business_dinner, business_lunch, casual_meetup, celebration, coffee_break, date_night, family_friendly, group_dining, late_lunch, late_night, quick_meal, solo_dining, special_occasion, tourist_friendly, weekend_brunch

noiseLevel: loud, moderate_noise, quiet_ambiance

vibeKeywords: aesthetic, artistic, authentic, bright, bustling, busy, calm, casual, charming, chic, chill, classic, clean, comfortable, contemporary, cozy, cute, down_to_earth, easygoing, elegant, friendly, grand, hip, historic, homey, intimate, inviting, laid_back, lively, low_key, luxurious, minimalist, modern, moody, no_frills, peaceful, polished, quiet, quirky, refined, relaxed, relaxing, retro, romantic, rustic, serene, small, sophisticated, spacious, stylish, traditional, tranquil, trendy, unique, upscale, vibrant, warm, welcoming

specialFeature: cash_only, chef_driven, compact_seating, counter_seating, counter_service, craft_driven, hard_to_get_into, hidden_gem, historic_venue, iconic_venue, instagrammable, outdoor_seating, scenic_views, speakeasy_vibe, unique_concept

cuisineType: american_restaurant, bagel_shop, bakery, bar, barbecue_restaurant, cafe, cafeteria, chinese_restaurant, coffee_shop, confectionery, deli, dessert_restaurant, dessert_shop, donut_shop, french_restaurant, greek_restaurant, ice_cream_shop, italian_restaurant, japanese_restaurant, korean_restaurant, mediterranean_restaurant, mexican_restaurant, night_club, pub, sandwich_shop, seafood_restaurant, spanish_restaurant, steak_house, tea_house, thai_restaurant, vegan_restaurant, vegetarian_restaurant, vietnamese_restaurant, wine_bar

## RULES
**Context reset:** Before using prior context, first decide if the user is starting a brand new search versus a follow-up. If the query starts with phrases such as "actually", "instead", "never mind"/"nevermind", "forget that"/"forget about", "change my mind", "on second thought", "scratch that", "cancel that", "disregard", "ignore that", "wait"/"hold on", "just", "simply", "only", "new search", "start over", "something different", or similar corrections, treat it as a brand new search and IGNORE previous filters. Otherwise, treat it as a follow-up and preserve relevant context.

1. Location: Extract borough (NYC only), neighborhood (from list), landmark (if "near X")
   - Landmarks ≠ neighborhoods. "near Louvre" → landmark:"louvre", neighborhood:null
   - Support arrays: ["manhattan","brooklyn"] or "manhattan"
   - NOTE: Do NOT extract city - it is provided separately from the UI

2. Cuisine: 
cuisineType: Use ONLY values from list above. Match user's query to the CUISINE, not the style/quality descriptor.

CRITICAL - Descriptor Mapping (NOT cuisineType):
- "fine dining" / "splurge" / "fancy"→ priceLevel: "luxury" 
- "fast food" / "quick service" → priceLevel: "budget" 
- "brunch spot" / "brunch"→ mealType: "brunch" 
- "asian food" / "asian cuisine" / "asian restaurant" → cuisineType:["chinese_restaurant","japanese_restaurant","korean_restaurant","thai_restaurant","vietnamese_restaurant"]

Cuisine Extraction Logic:
1. Identify the FOOD TYPE first (Italian, Japanese, etc.)
2. Map descriptors to correct fields (fine dining → price, breakfast → meal)
3. If query only has descriptor (e.g., "fine dining" with no cuisine), set cuisineType: null

Examples:
"fine dining French" → cuisineType: "french_restaurant", priceLevel: "luxury"
"fast food burger place" → cuisineType: "american_restaurant", cuisineSpecialty: "burger", priceLevel: "budget"
"breakfast spot" → mealType: "breakfast", cuisineType: null
"pizza restaurant" → cuisineType: "italian_restaurant", cuisineSpecialty: "pizza"

3. Price: "luxury"=expensive/fine dining/omakase/premium; "upscale"=upscale/fancy; "moderate"=mid-range; "budget"=cheap
If both upscale + luxury → use "upscale"

4. Vibes: Use ONLY values from list above
   - Dual extraction: "upscale French" → priceLevel:"upscale" + vibeKeywords:["upscale"]

5. Occasions: Use ONLY values from list above
   - occasionType can be a string OR an array of strings for interchangeable concepts
   - "first/second/third date" → occasionType:"date_night" (NOT "first_date")
   - "anniversary" → occasionType:【"anniversary"，"date_night","celebration"]
   - "late night" → occasionType:"late_night" (NOT mealType)

6. Special Features: 
   - specialFeatures is an array - use arrays to capture interchangeable concepts
   - If the user cares about visuals/photography, include "instagrammable" in specialFeatures. Trigger words/phrases include: "instagram", "ig", "photo", "photos", "photogenic", "picture-worthy", "beautiful", "pretty", "aesthetic", "scenic views", "scenic view", "good for pictures", "camera ready", "look great on instagram". Apply only when these words describe the **space/ambiance**, not the food.
   - "aesthetic" / "beautiful space" / "pretty" → specialFeatures:["instagrammable","scenic_views"] (interchangeable - return results matching either)

7. Booleans: null = remove filter, false = explicit false, true = explicit true
   - "not Michelin" / "remove Michelin" → requiresMichelin:null

8. Subjective terms:

Ignore descriptive words that imply quality/popularity:
- Superlatives: "the best", "top", "top-rated", "highest rated", "must-try", "must-visit"
- Recommendations: "recommended", "should try", "worth going"
- Quality indicators: "good", "great", "excellent", "amazing", "outstanding"
- Popularity: Apply pattern below

Pattern-based extraction:
- "famous for ramen" → cuisineSpecialty:"ramen"
- "famous pizza place" → ignore "famous", extract cuisineSpecialty:"pizza"
- "popular" / "trending" / "hot spot" → vibeKeywords:["trendy"]
- "authentic" / "real" / "genuine" / "local favorite" / "loved by locals" → vibeKeywords:["authentic"], specialFeatures:["hidden_gem"]
- "traditional" / "classic" / "old-school" → vibeKeywords:["traditional","classic"]
- "modern" / "contemporary" / "new" → vibeKeywords:["modern","contemporary"]
- "vibes" / "good vibes"/ "atmosphere" / "cool spot" → vibeKeywords:["cozy","lively","trendy"]
- "street food" / "street eats" → priceLevel:"budget"

**General rule for unlisted subjective terms:**
- If term describes ATMOSPHERE/VIBE → add to vibeKeywords
- If term describes QUALITY without actionable meaning → ignore (e.g., "delicious", "tasty", "flavorful")
- If term describes PRICE → map to priceLevel
- If term describes POPULARITY → add to vibeKeywords:["trendy"]
- When uncertain → ignore rather than guess

9. Conflicts: Prioritize specific over vague
   - "cheap Michelin" → priceLevel:"luxury"
   - "quick romantic dinner" → occasionType:"date_night"
   - "casual fine dining" → priceLevel:"luxury"

## OUTPUT
Return raw JSON (no markdown):
{
"neighborhood": null|string|string[],
"borough": null|string|string[],
"landmark": null|string|string[],
"cuisineType": null|string|string[],
"cuisineSpecialty": null|string|string[],
"mealType": null|"breakfast"|"brunch"|"lunch"|"dinner",
"priceLevel": null|"budget"|"moderate"|"upscale"|"luxury"|"any",
"vibeKeywords": string[],
"occasionType": null|string|string[],
"noisePreference": null|string,
"requiresMichelin": boolean|null,
"requiresCynthiasPick": boolean|null,
"specialFeatures": string[]
}

Examples:
"pizza in Manhattan or Brooklyn" → {"borough":["manhattan","brooklyn"],"cuisineType":"italian_restaurant","cuisineSpecialty":"pizza"}
"pizza or pasta" → {"cuisineType":"italian_restaurant","cuisineSpecialty":["pizza","pasta"]}
"asian food" → {"cuisineType":["chinese_restaurant","japanese_restaurant","korean_restaurant","thai_restaurant","vietnamese_restaurant"]}
"upscale Japanese in Shibuya for anniversary" → {"neighborhood":"shibuya","cuisineType":"japanese_restaurant","priceLevel":"upscale","occasionType":"anniversary","vibeKeywords":["upscale"]}
"romantic restaurant for anniversary" → {"occasionType":["date_night","anniversary","celebration"],"vibeKeywords":["romantic","intimate"]}
"aesthetic cafes" → {"cuisineType":["coffee_shop","cafe","cafeteria"],"specialFeatures":["instagrammable","scenic_views"]}
"famous street food locals love near Times Square" → {"landmark":"times square","priceLevel":"budget"}
"coffee shops" → {"cuisineType":["cafe", "cafeteria","coffee_shop"]}
"desserts" or "sweets" or "confectionery" → {"cuisineType":["dessert_restaurant","confectionery","dessert_shop","ice_cream_shop"]}
"bakery" or "bakeries" or "pastry" or "pastries" or "bread" → {"cuisineType":["bakery", "bagel_shop","donut_shop"]}
"bar" or "drinks" or "cocktails" or "beer" or "wine" → {"cuisineType":["bar","night_club","pub","wine_bar"]}
`;

/**
 * Build prompt for Claude API query parsing
 */
function buildQueryParsingPrompt(query: string, context?: QueryContext): string {
  // Replace the {{query}} placeholder with the actual query
  let prompt = RESTAURANT_QUERY_PARSER_PROMPT_TEMPLATE.replace("{{query}}", query);

  // Add context if this is a follow-up
  if (context) {
    const contextSection = '\n\n---\n\n## FOLLOW-UP QUERY CONTEXT\n\n**CONTEXT (Previous Query):** "' + context.previousQuery + '"\n**PREVIOUS KEYWORDS:** ' + JSON.stringify(context.previousKeywords, null, 2) + '\n\nThis is a follow-up question. The user wants to modify or refine their previous search.';
    
    // Detect what type of modification
    const lowerQuery = query.toLowerCase();
    let modificationInstructions = '';
    
    if (lowerQuery.includes('cheaper') || lowerQuery.includes('more affordable') || lowerQuery.includes('less expensive')) {
      modificationInstructions = '\n\nThe user is asking for CHEAPER options. Update priceLevel to "budget" while keeping all other criteria from the previous search.';
    } else if (lowerQuery.includes('more expensive') || lowerQuery.includes('upscale') || lowerQuery.includes('fancier')) {
      modificationInstructions = '\n\nThe user is asking for MORE EXPENSIVE/UPSCALE options. Update priceLevel to "upscale" while keeping all other criteria from the previous search.';
    } else if (lowerQuery.includes('more') || lowerQuery.includes('other') || lowerQuery.includes('different')) {
      modificationInstructions = '\n\nThe user wants MORE results with the SAME criteria. Return the same keywords as the previous search.';
    } else if (lowerQuery.includes('not') && (lowerQuery.includes('michelin') || lowerQuery.includes('instagram') || lowerQuery.includes('cynthia'))) {
      // Detect field removal requests
      if (lowerQuery.includes('michelin')) {
        modificationInstructions = '\n\nThe user wants to REMOVE the Michelin requirement. Set requiresMichelin to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.';
      } else if (lowerQuery.includes('cynthia')) {
        modificationInstructions = '\n\nThe user wants to REMOVE Cynthia\'s pick requirement. Set requiresCynthiasPick to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.';
      }
    } else {
      modificationInstructions = '\n\nMerge any new criteria from the current query with the previous keywords. \n\n**CRITICAL RULES FOR FOLLOW-UP QUERIES:**\n\n**1. REPLACE vs MERGE/ADD – understand intent**\nWhen the user mentions a DIFFERENT or contradictory value for a field, REPLACE the entire field value. When the user ADDS complementary criteria, MERGE/ADD to the existing values.\n\n- **Fields that should REPLACE when different:**\n  - cuisineType (Italian → Japanese)\n  - cuisineSpecialty (pizza → pasta)\n  - priceLevel (upscale → budget)\n  - occasionType (date_night → business_dinner)\n  - mealType (dinner → lunch)\n  - neighborhood/borough (Manhattan → Brooklyn)\n  - vibeKeywords when vibes conflict (romantic/intimate → casual)\n\n- **Fields that can MERGE/ADD when complementary:**\n  - vibeKeywords when vibes complement each other (romantic + intimate)\n  - neighborhood/borough when user explicitly wants multiple areas (Manhattan AND Brooklyn)\n  - cuisineSpecialty when the user lists multiple specialties in the SAME sentence (pizza AND pasta)\n  - specialFeatures when the user adds more requirements (instagrammable AND outdoor seating)\n\n**2. Detecting intent**\n- Adding criteria: phrases like "and make it", "also", "with", "plus" → MERGE/ADD\n- Changing criteria: phrases like "what about", "how about", "somewhere", "make it", "rather", "prefer", "instead" → REPLACE the field that changed\n\n**3. Preserve everything else**\nCopy all other fields exactly as they were in the previous keywords. Do NOT set them to null or undefined unless the user explicitly removes them.\n\n**4. Explicit removal**\nIf the user says "not X" or "remove X", remove that field by setting it to null/undefined. Do NOT set it to false unless the user explicitly wants false.\n\n**Examples:**\n- Previous: {"vibeKeywords":["romantic","intimate"],"mealType":"dinner","occasionType":"date_night"}\n  Query: "what about somewhere casual?" → {"vibeKeywords":["casual"],"mealType":"dinner","occasionType":"date_night"}\n- Previous: {"cuisineType":"italian_restaurant","cuisineSpecialty":"pizza"}\n  Query: "can it be Japanese?" → {"cuisineType":"japanese_restaurant","cuisineSpecialty":null}\n- Previous: {"vibeKeywords":["romantic"],"mealType":"dinner"}\n  Query: "and make it intimate" → {"vibeKeywords":["romantic","intimate"],"mealType":"dinner"}';
    }
    
    // Insert context section before the EXAMPLES section
    const examplesIndex = prompt.indexOf('## EXAMPLES');
    if (examplesIndex !== -1) {
      prompt = prompt.slice(0, examplesIndex) + contextSection + modificationInstructions + '\n\n---\n\n' + prompt.slice(examplesIndex);
    } else {
      // If EXAMPLES section not found, append at the end
      prompt += contextSection + modificationInstructions;
    }
  }

  return prompt;
}

/**
 * Normalize city name to filterService format
 * Converts "New York City" -> "nyc", etc.
 */
function normalizeCityForFilter(city: string | undefined): string | undefined {
  if (!city) return undefined;
  const lowerCity = city.toLowerCase();
  
  // Map to filterService expected format
  if (lowerCity === 'new york city' || lowerCity === 'new york' || lowerCity === 'nyc') {
    return 'nyc';
  }
  if (lowerCity === 'tokyo') return 'tokyo';
  if (lowerCity === 'seoul') return 'seoul';
  if (lowerCity === 'paris') return 'paris';
  
  // If already in correct format, return as-is
  return lowerCity;
}

/**
 * Get hardcoded ExtractedKeywords for city-prompt-items
 * This avoids Claude API calls for predefined prompts that are likely high-traffic
 * 
 * @param query - The user's query string (may include " in [city]" suffix)
 * @param city - The selected city (will be added to keywords)
 * @returns ExtractedKeywords if query matches a city-prompt-item, null otherwise
 */
export function getHardcodedKeywordsForPrompt(
  query: string,
  city?: string
): ExtractedKeywords | null {
  // Normalize query: remove " in [city]" suffix, strip emojis, and trim
  // Emojis are UI decoration and shouldn't affect matching (e.g., "Cynthia's favorites 👑")
  const normalizedQuery = query
    .toLowerCase()
    .trim()
    .replace(/\s+in\s+(new\s+york\s+city|tokyo|paris|seoul|nyc)$/i, '')
    // Remove emojis and other Unicode symbols (preserves letters, numbers, spaces, apostrophes, hyphens)
    .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+|[\u2600-\u26FF]|[\u2700-\u27BF]/g, '')
    .trim();
  
  // Map of normalized prompt text to ExtractedKeywords (without city)
  const promptKeywordMap: Record<string, Omit<ExtractedKeywords, 'city'>> = {
    "cynthia's favorites": {
      vibeKeywords: [],
      requiresCynthiasPick: true,
    },
    "cynthias favorites": {
      vibeKeywords: [],
      requiresCynthiasPick: true,
    },
    "sushi restaurants loved by locals": {
      vibeKeywords: [],
      cuisineType: "sushi",
    },
    "coffee shops": {
      vibeKeywords: [],
      cuisineType: ["coffee_shop", "cafe", "cafeteria", "cafeteira"],
    },
    "traditional japanese food": {
      vibeKeywords: [],
      cuisineType: "japanese_restaurant",
    },
    "brunch restaurants": {
      vibeKeywords: [],
      mealType: "brunch",
      cuisineType: "brunch_restaurant",
    },
    "romantic dinner": {
      vibeKeywords: ["romantic", "intimate"],
      mealType: "dinner",
      occasionType: "date_night",
    },
    "best thai restaurants": {
      vibeKeywords: [],
      cuisineType: "thai_restaurant",
    },
    "traditional french fare": {
      vibeKeywords: [],
      cuisineType: "french_restaurant",
    },
    "galettes and crepes": {
      vibeKeywords: [],
      cuisineType: "french_restaurant",
      cuisineSpecialty: "crepes",
    },
    "korean restaurant": {
      vibeKeywords: [],
      cuisineType: "korean_restaurant",
    },
  };
  
  // Check if normalized query matches any prompt
  const matchedKeywords = promptKeywordMap[normalizedQuery];
  if (!matchedKeywords) {
    return null;
  }
  
  // Build full ExtractedKeywords with city
  const keywords: ExtractedKeywords = {
    ...matchedKeywords,
    city: city ? normalizeCityForFilter(city) : undefined,
  };
  
  console.log('[Parse Query] Using hardcoded keywords for prompt: "' + normalizedQuery + '"');
  return keywords;
}

/**
 * Parse user query into structured ExtractedKeywords using Claude API
 * Supports follow-up questions with context merging
 * 
 * @param query - The user's query string
 * @param city - Optional city (for logging/debugging)
 * @param context - Optional context from previous query for follow-ups
 * @returns ExtractedKeywords matching the query intent
 */
export async function parseQueryWithClaude(
  query: string,
  city?: string,
  context?: QueryContext
): Promise<ExtractedKeywords> {
  try {
    console.log('[Parse Query] Parsing query: "' + query + '"' + (city ? ' (city: ' + city + ')' : '') + (context ? ' (with context)' : ''));

    // IMPORTANT: Don't cache if context is provided (follow-up queries need fresh parsing)
    // Check cache only for queries without context
    if (!context) {
      const cachedKeywords = getCachedParsedQuery(query, city);
      if (cachedKeywords) {
        console.log('[Parse Query] Using cached parsed query (skipping Claude API call)');
        return cachedKeywords;
      }
    }

    // Get API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!anthropicApiKey) {
      console.error('[Parse Query] ERROR: ANTHROPIC_API_KEY not set - Claude API is required');
      console.error('[Parse Query] ERROR_TYPE: MISSING_API_KEY');
      console.error('[Parse Query] ERROR_DETAILS: Environment variable ANTHROPIC_API_KEY is missing');
      throw new Error("PARSE_ERROR_SERVICE_ISSUE: Missing API key configuration");
    }

    // Build the prompt
    const prompt = buildQueryParsingPrompt(query, context);

    // Use Claude's prompt caching to cache the static template
    // The template (instructions) is static and can be cached
    // Only the user query and context (if present) change per request
    
    // Find where the user query section starts
    const querySectionStart = prompt.indexOf('**USER QUERY:**');
    
    let cacheableTemplate = '';
    let dynamicContent = '';
    
    if (querySectionStart !== -1) {
      // Split: everything before "**USER QUERY:**" is the static template (cacheable)
      // Everything from "**USER QUERY:**" onwards is dynamic (query + context if present)
      cacheableTemplate = prompt.substring(0, querySectionStart).trim();
      dynamicContent = prompt.substring(querySectionStart).trim();
    } else {
      // Fallback: if we can't find the query section, can't use caching
      console.warn('[Parse Query] Could not find query section, sending full prompt without caching');
      cacheableTemplate = '';
      dynamicContent = prompt;
    }

    // Build messages with cacheable content
    const messages: any[] = [];
    
    if (cacheableTemplate && cacheableTemplate.length > 0) {
      // Add cacheable template (static instructions)
      // Minimum 1024 tokens for Sonnet, our template is ~7000 tokens, so it qualifies
      // This will be cached on Claude's side for ~5 minutes (resets on access)
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: cacheableTemplate,
            cache_control: { type: 'ephemeral' }
          }
        ]
      });
    }
    
    // Add dynamic content (user query + context if present) - not cacheable
    if (dynamicContent && dynamicContent.trim().length > 0) {
      messages.push({
        role: 'user',
        content: dynamicContent
      });
    } else {
      // Fallback: send full prompt if splitting failed
      messages.push({
        role: 'user',
        content: prompt
      });
    }

    // Call Claude API with retries on overloaded/network errors
    const maxRetries = 3;
    const baseDelayMs = 200;
    const retryableStatuses = new Set([429, 500, 502, 503, 504, 529]);
    let response: Response | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31', // Enable prompt caching
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: messages,
        }),
      });

      if (response.ok) {
        break;
      }

      const status = response.status;
      const shouldRetry = retryableStatuses.has(status) && attempt < maxRetries - 1;
      const errorText = await response.text();

      console.warn(`[Parse Query] Claude API call failed (status ${status}). Attempt ${attempt + 1}/${maxRetries}. Retry: ${shouldRetry}`);
      console.warn('[Parse Query] ERROR_DETAILS:', {
        status,
        statusText: response.statusText,
        errorText: errorText
      });

      if (shouldRetry) {
        const backoffMs = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
        console.log(`[Parse Query] Retrying Claude request in ${backoffMs}ms...`);
        await delay(backoffMs);
      } else {
        throw new Error('PARSE_ERROR_SERVICE_ISSUE: Claude API returned ' + status + ' ' + response.statusText);
      }
    }

    if (!response) {
      throw new Error('PARSE_ERROR_SERVICE_ISSUE: Failed to contact Claude API');
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    console.log('[Parse Query] Raw Claude response:', responseText.slice(0, 200) + '...');

    // Parse Claude's JSON response
    // Strip any markdown formatting that might be present
    const backtick = String.fromCharCode(96);
    const backtickPattern = new RegExp(backtick + backtick + backtick + 'json\\n?', 'g');
    const backtickPattern2 = new RegExp(backtick + backtick + backtick + '\\n?', 'g');
    const cleanedResponse = responseText
      .replace(backtickPattern, '')
      .replace(backtickPattern2, '')
      .trim();

    let parsedKeywords: any;
    try {
      parsedKeywords = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('[Parse Query] ERROR: Failed to parse Claude response as JSON');
      console.error('[Parse Query] ERROR_TYPE: INVALID_JSON_RESPONSE');
      console.error('[Parse Query] ERROR_DETAILS:', {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        cleanedResponse: cleanedResponse.substring(0, 500), // Log first 500 chars to avoid huge logs
        responseLength: cleanedResponse.length
      });
      throw new Error('PARSE_ERROR_INVALID_QUERY: Claude returned invalid JSON');
    }

    // Check if Claude detected an irrelevant query
    if (parsedKeywords.error === 'NOT_RESTAURANT_QUERY') {
      console.log('[Parse Query] Claude detected non-restaurant query');
      throw new Error("I'm designed to answer restaurant-related questions only, try a different search!");
    }

    // Ensure all required fields are present with proper defaults
    // For boolean fields: null means "remove field" (set to undefined), false means "set to false", true means "set to true"
    const keywords: ExtractedKeywords = {
      vibeKeywords: parsedKeywords.vibeKeywords || [],
      occasionType: parsedKeywords.occasionType || null,
      noiseLevel: parsedKeywords.noiseLevel || null,
      // Handle null as field removal (undefined), preserve false/true, default to false if not present
      requiresMichelin: parsedKeywords.requiresMichelin === null ? undefined : (parsedKeywords.requiresMichelin ?? false),
      requiresCynthiasPick: parsedKeywords.requiresCynthiasPick === null ? undefined : (parsedKeywords.requiresCynthiasPick ?? false),
      specialFeatures: parsedKeywords.specialFeatures || [],
      neighborhood: parsedKeywords.neighborhood || undefined,
      borough: parsedKeywords.borough || undefined,
      landmark: parsedKeywords.landmark || undefined,
      // Always include city from input parameter (city pill is always selected in UI)
      // City is NOT extracted by Claude - it comes from the UI selection
      // Normalize city to filterService format (e.g., "New York City" -> "nyc")
      city: city ? normalizeCityForFilter(city) : undefined,
      cuisineType: parsedKeywords.cuisineType || undefined,
      cuisineSpecialty: parsedKeywords.cuisineSpecialty || null,
      mealType: parsedKeywords.mealType || null,
      priceLevel: parsedKeywords.priceLevel || undefined,
      needsTakeout: parsedKeywords.needsTakeout || false,
    };

    console.log('[Parse Query] Parsed keywords:', JSON.stringify(keywords, null, 2));

    // Cache the result (only if no context - follow-up queries shouldn't be cached)
    if (!context) {
      setCachedParsedQuery(query, city, keywords);
    }

    return keywords;

  } catch (error) {
    // If error already has a specific type (PARSE_ERROR_*), re-throw it as-is
    if (error instanceof Error && (
      error.message.includes('PARSE_ERROR_SERVICE_ISSUE') ||
      error.message.includes('PARSE_ERROR_INVALID_QUERY') ||
      error.message.includes("I'm designed to answer restaurant-related questions only")
    )) {
      throw error; // Re-throw specific errors as-is
    }
    
    // For unexpected errors, log and throw generic error
    console.error('[Parse Query] ERROR: Unexpected error in parseQueryWithClaude');
    console.error('[Parse Query] ERROR_TYPE: UNEXPECTED_ERROR');
    console.error('[Parse Query] ERROR_DETAILS:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error("I don't quite get your question, try something else");
  }
}
