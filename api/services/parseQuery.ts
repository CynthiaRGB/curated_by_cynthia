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
  const cityKey = city ? `_city:${city.toLowerCase()}` : '';
  
  return `${normalizedQuery}${cityKey}`;
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
  
  console.log(`[Parse Query Cache] Hit: ${cacheKey.substring(0, 50)}...`);
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
    console.log(`[Parse Query Cache] Evicted oldest entry: ${oldestKey.substring(0, 50)}...`);
  }
  
  const cacheKey = generateParsedQueryCacheKey(query, city);
  parsedQueryCache.set(cacheKey, {
    keywords,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
  
  console.log(`[Parse Query Cache] Stored: ${cacheKey.substring(0, 50)}... (cache size: ${parsedQueryCache.size})`);
}

/**
 * Restaurant Query Parser Prompt Template
 * 
 * This prompt parses natural language restaurant search queries into structured JSON data.
 * It handles location extraction, cuisine preferences, price levels, vibes, occasions, and special features.
 */
const RESTAURANT_QUERY_PARSER_PROMPT_TEMPLATE = `You are parsing a restaurant search query into structured data. Extract all relevant information from the user's query.

**CRITICAL:** If the query is NOT related to restaurant search (e.g., weather, time, general questions, jokes), return an error: {"error": "NOT_RESTAURANT_QUERY"}

**USER QUERY:** "{{query}}"

---

## QUICK REFERENCE: VALID VALUES

### Boroughs (NYC ONLY)
"manhattan", "brooklyn"

### Neighborhoods (Finite List - Only Extract These)
**NYC:** Crown Heights, Dumbo, East Village, Gramercy, Greenpoint, Greenwich Village, Lower East Side, Manhattan, Midtown, Midtown East, Midtown West, Murray Hill, Park Slope, SoHo, Southside, Tribeca, Upper East Side, Upper West Side, West Village, Williamsburg

**Tokyo:** Adachi City, Chiyoda City, Chuo City, Ginza, Koto City, Machida, Meguro City, Minato City, Musashino, Nihonbashiningyōchō, Setagaya City, Shibuya, Shinjuku City, Sumida City, Taito City, Toranomon, Toshima City

**Seoul:** Gangnam District, Gwanak-gu, Gwangjin District, Jongno, Jongno District, Mapo-gu, Seodaemun-gu, Seongdong-gu, Songpa District, Yongsan District

**Paris:** 1st-12th, 15th, 18th arrondissement

### Cities
"nyc", "tokyo", "seoul", "paris"

### Meal Types
"breakfast", "brunch", "lunch", "dinner"

### Price Levels
"budget", "moderate", "upscale", "luxury", "any"

### Occasion Types
"anniversary", "business_dinner", "business_lunch", "casual_meetup", "celebration", "coffee_break", "date_night", "family_friendly", "group_dining", "late_lunch", "late_night", "quick_meal", "solo_dining", "special_occasion", "tourist_friendly", "weekend_brunch"

**Note:** Do NOT use "first_date" or "second_date" as literal occasion values. See section 6 for date handling.

### Special Features
"cash_only", "chef_driven", "compact_seating", "counter_seating", "counter_service", "craft_driven", "hard_to_get_into", "hidden_gem", "historic_venue", "iconic_venue", "instagrammable", "outdoor_seating", "scenic_views", "speakeasy_vibe", "unique_concept"

### Noise Preferences
"quiet", "any"

---

## EXTRACTION RULES

### 1. Location Extraction

**Borough (NYC ONLY):**
- Extract ONLY from valid borough list: ["manhattan", "brooklyn"]
- Can be single string OR array: "manhattan" or ["manhattan", "brooklyn"]
- Do NOT extract borough for non-NYC cities

**Neighborhood:**
- Extract ONLY from valid neighborhood list (see Quick Reference)
- Can be single string OR array: "shibuya" or ["shibuya", "ginza"]
- **CRITICAL:** Do NOT extract landmarks as neighborhoods
  - ❌ "near the Louvre" → neighborhood: null (Louvre is a landmark, not neighborhood)
  - ✅ "in the 1st arrondissement" → neighborhood: "1st arrondissement"

**Landmark:**
- Extract when query mentions "near [landmark]" or "close to [landmark]"
- Can be single string OR array: "louvre" or ["louvre", "eiffel tower"]
- Examples: "Louvre", "Times Square", "Eiffel Tower", "Central Park", "Shibuya Crossing"
- If both neighborhood AND landmark mentioned, extract both (filterService prioritizes neighborhood)

**City:**
- Always extract from query OR use provided city parameter
- Lowercase: "nyc", "tokyo", "seoul", "paris"

**Examples:**
"pizza in Manhattan" → borough: "manhattan", neighborhood: null, landmark: null, city: "nyc"
"ramen in Shibuya or Ginza" → neighborhood: ["shibuya", "ginza"], city: "tokyo"
"restaurants near Times Square" → neighborhood: null, landmark: "times square", city: "nyc"
"Italian in West Village near Central Park" → neighborhood: "west village", landmark: "central park", city: "nyc"

---

### 2. Cuisine Extraction

**Cuisine Type (Broad Category):**
- Extract general cuisine category: "japanese", "italian", "chinese", "french", "korean", "bar", "barbecue", "seafood"
- Lowercase only
- **Wine-related queries → extract "bar":**
  - "wine and cheese" → cuisineType: "bar"
  - "wine bar" → cuisineType: "bar"
  - "cocktail bar" → cuisineType: "bar"
- **BBQ/Barbecue queries → extract "barbecue":**
  - "BBQ" / "bbq" / "barbecue" / "barbeque" → cuisineType: "barbecue"
  - "Korean BBQ" → cuisineType: "korean" (Korean cuisine, not necessarily BBQ-style)
  - "BBQ restaurant" → cuisineType: "barbecue"
  - This matches against "barbecue_restaurant" in restaurant types array

**Cuisine Specialty (Specific Dish):**
- Extract SPECIFIC DISH if mentioned (open-ended field)
- FilterService uses flexible matching against restaurant metadata, names, descriptions
- **Do NOT extract restaurant types/styles** (e.g., "izakaya", "bistro", "trattoria")
  - ❌ "traditional izakaya" → cuisineSpecialty: null
  - ✅ "yakitori restaurant" → cuisineSpecialty: "yakitori"

**Common Dish Examples:**
- Japanese: ramen, yakitori, sushi, sashimi, unagi, tonkatsu, tempura, udon, soba, curry, onigiri
- Italian: pizza, pasta, risotto
- French: galettes, crepes, duck confit, croissant
- Chinese: dim sum, hot pot, szechuan, peking duck
- Other: pho, pad thai, tacos, burritos

**Examples:**
"pizza in Manhattan" → cuisineType: "italian", cuisineSpecialty: "pizza"
"dim sum in Chinatown" → cuisineType: "chinese", cuisineSpecialty: "dim sum"
"traditional izakaya" → cuisineType: "japanese", cuisineSpecialty: null
"Italian restaurants" → cuisineType: "italian", cuisineSpecialty: null
"BBQ in Manhattan" → cuisineType: "barbecue", cuisineSpecialty: null
"barbecue restaurant" → cuisineType: "barbecue", cuisineSpecialty: null
"seafood in Brooklyn" → cuisineType: "seafood", cuisineSpecialty: null

---

### 3. Price Level Extraction

**CRITICAL - Price Level Mapping:**
- **"luxury"** ($$$$) = "expensive", "luxury", "high-end", "premium", "fine dining", "splurge", "omakase"
- **"upscale"** ($$$, $$$$) = "upscale", "fancy"
- **"moderate"** ($$) = "moderate", "mid-range"
- **"budget"** ($) = "budget", "cheap", "affordable", "inexpensive"

**Priority Rule:** If both upscale AND luxury indicators present, use "upscale" (more inclusive)

**Examples:**
"expensive restaurant" → priceLevel: "luxury"
"fine dining French" → priceLevel: "luxury"
"upscale Korean fine dining" → priceLevel: "upscale" (upscale wins - shows $$$ AND $$$$)
"fancy restaurant" → priceLevel: "upscale"
"cheap eats" → priceLevel: "budget"

---

### 4. Vibe Keywords

Extract as array of strings. Common vibes:
- Atmosphere: "cozy", "lively", "romantic", "intimate", "casual", "trendy"
- Style: "upscale", "sophisticated", "elegant", "rustic", "modern", "traditional", "authentic"

**Dual Extraction Rule:** Words describing BOTH price AND atmosphere extract to BOTH fields:
"upscale French" → priceLevel: "upscale", vibeKeywords: ["upscale"]
"fancy restaurant" → priceLevel: "upscale", vibeKeywords: ["upscale", "sophisticated", "elegant"]
"casual Italian" → vibeKeywords: ["casual"]

---

### 5. Special Features

Extract as array when explicitly mentioned or strongly implied. See Quick Reference for full list.

**Key Mapping Rules:**
- Instagram/photos → "instagrammable" + set requiresInstagrammable: true
- Hidden/local favorites → "hidden_gem"
- Cash payment → "cash_only"
- Chef-focused → "chef_driven"
- Outdoor space → "outdoor_seating"
- Rooftop/views → "scenic_views"
- Craft drinks → "craft_driven"
- Secret/hidden bars → "speakeasy_vibe"

**IMPORTANT - "Famous" vs "Iconic":**
- ❌ "famous bakeries" → Do NOT extract "iconic_venue" (general descriptor)
- ✅ "iconic restaurant" → Extract "iconic_venue" (special feature requirement)
- ✅ "legendary spot" → Extract "iconic_venue"
- ✅ "must-visit place" → Extract "iconic_venue"

**Examples:**
"hidden gems locals love" → specialFeatures: ["hidden_gem"]
"instagram-worthy with outdoor seating" → specialFeatures: ["instagrammable", "outdoor_seating"], requiresInstagrammable: true
"famous pizza place" → specialFeatures: [] (famous is general descriptor)

---

### 6. Occasion Type

Extract from query using exact occasion type values (see Quick Reference).

**CRITICAL - Date Handling:**
- **"first date"** → occasionType: "date_night" (NOT "first_date")
- **"second date"** → occasionType: "date_night" (NOT "second_date")
- **"third date"** / "fourth date" / etc. → occasionType: "date_night"
- **"date night"** / "date" / "romantic dinner" → occasionType: "date_night"
- **"anniversary"** / "anniversary dinner" → occasionType: "anniversary"

**Reasoning:** The occasion_tags field contains predefined values. "first date", "second date", etc. are variations of dates and should all map to the canonical "date_night" value. The only exception is "anniversary" which has its own specific tag.

**Other Occasion Mappings:**
- "business lunch/dinner" → "business_lunch" / "business_dinner"
- "late night" / "late-night" → "late_night" (NOT mealType)
- "family" / "with kids" → "family_friendly"
- "group" / "large party" → "group_dining"
- "solo" / "alone" → "solo_dining"
- "weekend brunch" → "weekend_brunch"

**Examples:**
"first date restaurant" → occasionType: "date_night"
"second date ideas" → occasionType: "date_night"
"romantic dinner" → occasionType: "date_night"
"anniversary dinner" → occasionType: "anniversary"
"business lunch" → occasionType: "business_lunch"
"late night food" → occasionType: "late_night"
"family dinner" → occasionType: "family_friendly"

---

### 7. Meal Type

Extract: "breakfast", "brunch", "lunch", "dinner", or null

**IMPORTANT:** Do NOT extract "late night" as mealType (use occasionType instead)

---

### 8. Boolean Flags

Set to true when explicitly mentioned, null otherwise:
- requiresInstagrammable: Instagram/photogenic mentions
- requiresMichelin: Michelin-starred requests
- requiresCynthiasPick: "Cynthia's favorites/pick"
- requiresCoffeeFocus: Coffee-focused establishment
- requiresDessertFocus: Dessert-focused establishment
- needsTakeout: Takeout availability required
- needsCoffee: Coffee availability required

**Field Removal Rule:** If user says "not X" or "remove X" (e.g., "actually, not Michelin"), set that field to null to REMOVE the filter entirely.

---

## HANDLING SUBJECTIVE/VAGUE TERMS

### Subjective Term Mapping Table

| Term | Extraction |
|------|------------|
| **"first date"** | occasionType: "date_night" (NOT "first_date") |
| **"second date"** | occasionType: "date_night" (NOT "second_date") |
| **"third/fourth/fifth date"** | occasionType: "date_night" |
| **"date night"** | occasionType: "date_night" |
| **"anniversary"** | occasionType: "anniversary" |
| **"street food"** | cuisineSpecialty: "street food", priceLevel: "budget", vibeKeywords: ["casual", "authentic"] |
| **"famous"** | Ignore (unless paired with specific feature: "famous for ramen" → cuisineSpecialty: "ramen") |
| **"the best"** | Ignore (subjective opinion, not filterable) |
| **"popular"** | vibeKeywords: ["popular", "trendy"] (do NOT extract as special feature) |
| **"must-try"** | Ignore (unless paired with dish: "must-try ramen" → cuisineSpecialty: "ramen") |
| **"recommended"** | Ignore (too vague) |
| **"top-rated"** | Ignore (rating-based, not a feature) |
| **"authentic"** | vibeKeywords: ["authentic"] |
| **"traditional"** | vibeKeywords: ["traditional", "authentic"] |
| **"modern"** | vibeKeywords: ["modern", "contemporary"] |
| **"classic"** | vibeKeywords: ["classic", "traditional"] |
| **"good vibes"** | vibeKeywords: ["cozy", "lively", "trendy", "casual"] |
| **"something nice"** | priceLevel: "moderate", vibeKeywords: ["upscale", "sophisticated"] |
| **"nice pictures"** | specialFeatures: ["instagrammable"], requiresInstagrammable: true |
| **"hidden gems"** | specialFeatures: ["hidden_gem"] |
| **"locals love"** | specialFeatures: ["hidden_gem"] |
| **"BBQ" / "bbq" / "barbecue" / "barbeque"** | cuisineType: "barbecue" |
| **"seafood"** | cuisineType: "seafood" |

### Extremely Vague Queries

For queries with no clear criteria (e.g., "where should I eat?"):
- Return minimal extraction: only city if provided
- Empty arrays for all array fields
- null for all optional fields

---

## CONFLICT RESOLUTION RULES

When query contains contradictory criteria, apply these priority rules:

### 1. Price Conflicts
"cheap Michelin restaurant" → priceLevel: "luxury" (Michelin overrides "cheap")
"casual fine dining" → priceLevel: "upscale", vibeKeywords: ["upscale"] (fine dining wins, ignore casual)

### 2. Occasion Conflicts
"quick romantic dinner" → occasionType: "date_night" (romantic overrides quick)
"business date" → occasionType: "business_dinner" (business context wins)

### 3. Location Conflicts
"upscale Italian near Times Square" → neighborhood: null, landmark: "times square"
(Times Square is landmark, not neighborhood - filterService uses landmark)

### 4. Feature Conflicts
"quiet lively bar" → noiseLevel: null, vibeKeywords: [] (contradictory - ignore both)
"intimate group dining" → occasionType: "group_dining" (group wins - can't be intimate for large group)

**General Rule:** When in doubt, prioritize the more specific/concrete criterion over vague/general ones.

---

## RESPONSE FORMAT

Return ONLY valid JSON (no markdown, no backticks, no extra text):

**Non-restaurant query:**
{
  "error": "NOT_RESTAURANT_QUERY"
}

**Restaurant query:**
{
  "neighborhood": null | string | string[],
  "borough": null | string | string[],
  "landmark": null | string | string[],
  "city": null | "nyc" | "tokyo" | "seoul" | "paris",
  "cuisineType": null | string,
  "cuisineSpecialty": null | string,
  "mealType": null | "breakfast" | "brunch" | "lunch" | "dinner",
  "priceLevel": null | "budget" | "moderate" | "upscale" | "luxury" | "any",
  "needsTakeout": boolean,
  "needsCoffee": boolean,
  "vibeKeywords": string[],
  "occasionType": null | string,
  "noiseLevel": null | "loud" | "moderate_noise" | "quiet_ambiance",
  "requiresInstagrammable": boolean | null,
  "requiresMichelin": boolean | null,
  "requiresCynthiasPick": boolean | null,
  "requiresCoffeeFocus": boolean | null,
  "requiresDessertFocus": boolean | null,
  "specialFeatures": string[]
}

---

## IMPORTANT NOTES

1. **Precision:** Only extract explicitly mentioned or strongly implied information
2. **Arrays:** Support single values OR arrays for: borough, neighborhood, landmark
3. **Flexible Matching:** FilterService handles normalization for cuisineSpecialty, vibeKeywords, neighborhoods
4. **Null vs Empty:** Use null for all unmentioned optional fields, [] for empty arrays
5. **Never Hallucinate:** If uncertain, omit the field rather than guess
6. **City Parameter:** Always include city from query OR provided parameter
7. **Landmarks ≠ Neighborhoods:** Landmarks (Louvre, Times Square, Central Park) cannot be neighborhoods

---

## EXAMPLES

### Example 1: Basic Query
**Query:** "pizza in Manhattan"
{
  "neighborhood": null,
  "borough": "manhattan",
  "landmark": null,
  "city": "nyc",
  "cuisineType": "italian",
  "cuisineSpecialty": "pizza",
  "mealType": null,
  "priceLevel": null,
  "needsTakeout": false,
  "needsCoffee": false,
  "vibeKeywords": [],
  "occasionType": null,
  "noiseLevel": null,
  "requiresInstagrammable": null,
  "requiresMichelin": null,
  "requiresCynthiasPick": null,
  "requiresCoffeeFocus": null,
  "requiresDessertFocus": null,
  "specialFeatures": []
}

### Example 2: Complex Query
**Query:** "upscale Japanese omakase in Shibuya or Ginza with scenic views for anniversary dinner"
{
  "neighborhood": ["shibuya", "ginza"],
  "borough": null,
  "landmark": null,
  "city": "tokyo",
  "cuisineType": "japanese",
  "cuisineSpecialty": null,
  "mealType": "dinner",
  "priceLevel": "upscale",
  "needsTakeout": false,
  "needsCoffee": false,
  "vibeKeywords": ["upscale"],
  "occasionType": "anniversary",
  "noiseLevel": null,
  "requiresInstagrammable": null,
  "requiresMichelin": null,
  "requiresCynthiasPick": null,
  "requiresCoffeeFocus": null,
  "requiresDessertFocus": null,
  "specialFeatures": ["scenic_views"]
}

### Example 3: Vague Query
**Query:** "something nice for dinner"
{
  "neighborhood": null,
  "borough": null,
  "landmark": null,
  "city": null,
  "cuisineType": null,
  "cuisineSpecialty": null,
  "mealType": "dinner",
  "priceLevel": "moderate",
  "needsTakeout": false,
  "needsCoffee": false,
  "vibeKeywords": ["upscale", "sophisticated"],
  "occasionType": null,
  "noiseLevel": null,
  "requiresInstagrammable": null,
  "requiresMichelin": null,
  "requiresCynthiasPick": null,
  "requiresCoffeeFocus": null,
  "requiresDessertFocus": null,
  "specialFeatures": []
}

### Example 4: Subjective Terms
**Query:** "famous street food locals love near Times Square"
{
  "neighborhood": null,
  "borough": null,
  "landmark": "times square",
  "city": "nyc",
  "cuisineType": null,
  "cuisineSpecialty": "street food",
  "mealType": null,
  "priceLevel": "budget",
  "needsTakeout": false,
  "needsCoffee": false,
  "vibeKeywords": ["casual", "authentic"],
  "occasionType": null,
  "noiseLevel": null,
  "requiresInstagrammable": null,
  "requiresMichelin": null,
  "requiresCynthiasPick": null,
  "requiresCoffeeFocus": null,
  "requiresDessertFocus": null,
  "specialFeatures": ["hidden_gem"]
}

### Example 5: Date Handling
**Query:** "romantic spot for a first date in West Village"
{
  "neighborhood": "west village",
  "borough": null,
  "landmark": null,
  "city": "nyc",
  "cuisineType": null,
  "cuisineSpecialty": null,
  "mealType": null,
  "priceLevel": null,
  "needsTakeout": false,
  "needsCoffee": false,
  "vibeKeywords": ["romantic", "intimate", "cozy"],
  "occasionType": "date_night",
  "noiseLevel": null,
  "requiresInstagrammable": null,
  "requiresMichelin": null,
  "requiresCynthiasPick": null,
  "requiresCoffeeFocus": null,
  "requiresDessertFocus": null,
  "specialFeatures": []
}

### Example 6: Non-Restaurant Query
**Query:** "What's the weather today?"
{
  "error": "NOT_RESTAURANT_QUERY"
}`;

/**
 * Build prompt for Claude API query parsing
 */
function buildQueryParsingPrompt(query: string, context?: QueryContext): string {
  // Replace the {{query}} placeholder with the actual query
  let prompt = RESTAURANT_QUERY_PARSER_PROMPT_TEMPLATE.replace("{{query}}", query);

  // Add context if this is a follow-up
  if (context) {
    const contextSection = `\n\n---\n\n## FOLLOW-UP QUERY CONTEXT\n\n**CONTEXT (Previous Query):** "${context.previousQuery}"\n**PREVIOUS KEYWORDS:** ${JSON.stringify(context.previousKeywords, null, 2)}\n\nThis is a follow-up question. The user wants to modify or refine their previous search.`;
    
    // Detect what type of modification
    const lowerQuery = query.toLowerCase();
    let modificationInstructions = '';
    
    if (lowerQuery.includes('cheaper') || lowerQuery.includes('more affordable') || lowerQuery.includes('less expensive')) {
      modificationInstructions = `\n\nThe user is asking for CHEAPER options. Update priceLevel to "budget" while keeping all other criteria from the previous search.`;
    } else if (lowerQuery.includes('more expensive') || lowerQuery.includes('upscale') || lowerQuery.includes('fancier')) {
      modificationInstructions = `\n\nThe user is asking for MORE EXPENSIVE/UPSCALE options. Update priceLevel to "upscale" while keeping all other criteria from the previous search.`;
    } else if (lowerQuery.includes('more') || lowerQuery.includes('other') || lowerQuery.includes('different')) {
      modificationInstructions = `\n\nThe user wants MORE results with the SAME criteria. Return the same keywords as the previous search.`;
    } else if (lowerQuery.includes('not') && (lowerQuery.includes('michelin') || lowerQuery.includes('instagram') || lowerQuery.includes('cynthia'))) {
      // Detect field removal requests
      if (lowerQuery.includes('michelin')) {
        modificationInstructions = `\n\nThe user wants to REMOVE the Michelin requirement. Set requiresMichelin to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.`;
      } else if (lowerQuery.includes('instagram')) {
        modificationInstructions = `\n\nThe user wants to REMOVE the Instagrammable requirement. Set requiresInstagrammable to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.`;
      } else if (lowerQuery.includes('cynthia')) {
        modificationInstructions = `\n\nThe user wants to REMOVE Cynthia's pick requirement. Set requiresCynthiasPick to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.`;
      }
    } else {
      modificationInstructions = `\n\nMerge any new criteria from the current query with the previous keywords. 
      
**CRITICAL RULES FOR FOLLOW-UP QUERIES:**
1. If the current query mentions something new or different (like a different price level, cuisine, or location), update ONLY that field.
2. PRESERVE ALL OTHER FIELDS from the previous keywords - do NOT set them to null or undefined. Copy them exactly as they were in the previous keywords.
3. If the user explicitly says "not X" or "remove X" (e.g., "not Michelin", "remove the Michelin requirement"), you should REMOVE that field by setting it to null or omitting it from the response. Do NOT set it to false - that means the filter is still active but set to false. Setting to null/undefined means the filter is removed entirely.

Example: If previous keywords had priceLevel: "upscale" and the new query only changes location, you MUST include priceLevel: "upscale" in your response (preserve it from previous).`;
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
    console.log(`[Parse Query] Parsing query: "${query}"${city ? ` (city: ${city})` : ''}${context ? ' (with context)' : ''}`);

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

    // Call Claude API with prompt caching enabled
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Parse Query] ERROR: Claude API call failed');
      console.error('[Parse Query] ERROR_TYPE: CLAUDE_API_ERROR');
      console.error('[Parse Query] ERROR_DETAILS:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText
      });
      throw new Error(`PARSE_ERROR_SERVICE_ISSUE: Claude API returned ${response.status} ${response.statusText}`);
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
      requiresInstagrammable: parsedKeywords.requiresInstagrammable === null ? undefined : (parsedKeywords.requiresInstagrammable ?? false),
      requiresMichelin: parsedKeywords.requiresMichelin === null ? undefined : (parsedKeywords.requiresMichelin ?? false),
      requiresCynthiasPick: parsedKeywords.requiresCynthiasPick === null ? undefined : (parsedKeywords.requiresCynthiasPick ?? false),
      requiresCoffeeFocus: parsedKeywords.requiresCoffeeFocus === null ? undefined : (parsedKeywords.requiresCoffeeFocus ?? false),
      requiresDessertFocus: parsedKeywords.requiresDessertFocus === null ? undefined : (parsedKeywords.requiresDessertFocus ?? false),
      specialFeatures: parsedKeywords.specialFeatures || [],
      neighborhood: parsedKeywords.neighborhood || undefined,
      borough: parsedKeywords.borough || undefined,
      landmark: parsedKeywords.landmark || undefined,
      // Always include city from input parameter (city pill is always selected in UI)
      // Claude may extract city from query, but we always use the input city as the source of truth
      // Normalize city to filterService format (e.g., "New York City" -> "nyc")
      city: city ? normalizeCityForFilter(city) : normalizeCityForFilter(parsedKeywords.city),
      cuisineType: parsedKeywords.cuisineType || undefined,
      cuisineSpecialty: parsedKeywords.cuisineSpecialty || null,
      mealType: parsedKeywords.mealType || null,
      priceLevel: parsedKeywords.priceLevel || undefined,
      needsTakeout: parsedKeywords.needsTakeout || false,
      needsCoffee: parsedKeywords.needsCoffee || false,
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
