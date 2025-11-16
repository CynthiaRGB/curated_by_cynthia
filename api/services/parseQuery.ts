// Claude query parser with context-aware follow-up support
// Parses ALL user queries into structured ExtractedKeywords using Claude API

import { ExtractedKeywords, QueryContext } from '../../src/types/restaurant.js';

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
    } else if (lowerQuery.includes('not') && (lowerQuery.includes('michelin') || lowerQuery.includes('instagram') || lowerQuery.includes('cynthia'))) {
      // Detect field removal requests
      if (lowerQuery.includes('michelin')) {
        prompt += `\n\nThe user wants to REMOVE the Michelin requirement. Set requiresMichelin to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.`;
      } else if (lowerQuery.includes('instagram')) {
        prompt += `\n\nThe user wants to REMOVE the Instagrammable requirement. Set requiresInstagrammable to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.`;
      } else if (lowerQuery.includes('cynthia')) {
        prompt += `\n\nThe user wants to REMOVE Cynthia's pick requirement. Set requiresCynthiasPick to null (or omit it from the response) to remove this filter. Keep all other criteria from the previous search.`;
      }
    } else {
      prompt += `\n\nMerge any new criteria from the current query with the previous keywords. 
      
CRITICAL RULES FOR FOLLOW-UP QUERIES:
1. If the current query mentions something new or different (like a different price level, cuisine, or location), update ONLY that field.
2. PRESERVE ALL OTHER FIELDS from the previous keywords - do NOT set them to null or undefined. Copy them exactly as they were in the previous keywords.
3. If the user explicitly says "not X" or "remove X" (e.g., "not Michelin", "remove the Michelin requirement"), you should REMOVE that field by setting it to null or omitting it from the response. Do NOT set it to false - that means the filter is still active but set to false. Setting to null/undefined means the filter is removed entirely.

Example: If previous keywords had priceLevel: 2 and the new query only changes location, you MUST include priceLevel: 2 in your response (preserve it from previous).`;
    }
  }

  prompt += `\n\nExtract the following information:
- Location (neighborhood, borough, city): Extract any location mentions. Support single neighborhood or array for multiple (e.g., "Shibuya or Ginza" -> ["shibuya", "ginza"])
- Cuisine type: Extract BROAD cuisine category (e.g., "japanese", "italian", "chinese", "french", "korean"). This is the general cuisine category.
- Cuisine specialty: Extract SPECIFIC DISH or SPECIALTY if mentioned. This is open-ended - extract any dish name the user mentions. The filterService uses flexible matching against restaurant metadata, names, and descriptions. Common examples:
  * Japanese: "ramen", "yakitori", "sushi", "sashimi", "unagi", "tonkatsu", "katsu", "tempura", "udon", "soba", "okonomiyaki", "curry", "onigiri", "takoyaki", "teriyaki", "sukiyaki", "shabu shabu", "kaiseki", "omurice"
  * Italian: "pizza", "pasta", "risotto"
  * French: "galettes", "crepes", "duck confit", "croissant"
  * Chinese: "dim sum", "hot pot", "szechuan", "peking duck"
  * Other: "pho", "vermicelli", "pad thai", "tacos", "burritos"
  Examples:
  * "pizza in Manhattan" -> cuisineType: "italian", cuisineSpecialty: "pizza"
  * "dim sum in Chinatown" -> cuisineType: "chinese", cuisineSpecialty: "dim sum"
  * "yakitori in Tokyo" -> cuisineType: "japanese", cuisineSpecialty: "yakitori"
  * "tonkatsu restaurant" -> cuisineType: "japanese", cuisineSpecialty: "tonkatsu"
  * "Italian restaurants" -> cuisineType: "italian", cuisineSpecialty: null
- Meal type: Extract meal time preference ("breakfast", "brunch", "lunch", "dinner", or null). IMPORTANT: "late night", "late-night", "late night bites" should be extracted as occasionType: "late_night", NOT as mealType.
- Price level: Extract price preference ("budget", "moderate", "upscale", "any", or undefined)
- Amenities: Extract any amenity requirements (takeout, coffee availability)
- Vibes: Extract vibe keywords as an array (e.g., ["cozy", "lively", "romantic"]). IMPORTANT: Words that describe both price AND atmosphere should be extracted in BOTH fields. Examples:
  * "upscale French" -> priceLevel: "upscale", vibeKeywords: ["upscale"]
  * "fancy restaurant" -> priceLevel: "upscale", vibeKeywords: ["upscale", "sophisticated", "elegant"]
  * "casual Italian" -> priceLevel: undefined (or "moderate"), vibeKeywords: ["casual"]
  * "romantic dinner" -> vibeKeywords: ["romantic", "intimate", "cozy"]
  Common vibe keywords that may also indicate price: "upscale", "fancy", "casual", "budget-friendly", "cheap", "expensive"
- Occasion type: Extract occasion. Available occasion types (use exact values):
  * "anniversary": "anniversary", "anniversary dinner"
  * "business_dinner": "business dinner", "client dinner", "work dinner"
  * "business_lunch": "business lunch", "client lunch", "work lunch", "lunch meeting"
  * "casual_meetup": "casual meetup", "hanging out", "catch up"
  * "celebration": "celebration", "celebrating", "party"
  * "coffee_break": "coffee break", "coffee meeting"
  * "date_night": "date night", "date", "romantic dinner", "dinner date"
  * "family_friendly": "family", "with kids", "family dinner", "kids friendly"
  * "first_date": "first date"
  * "group_dining": "group", "large group", "group dinner", "party of"
  * "late_lunch": "late lunch"
  * "late_night": "late night", "late-night", "late night bites", "late night food"
  * "quick_meal": "quick", "fast", "quick bite", "quick lunch"
  * "second_date": "second date"
  * "solo_dining": "solo", "alone", "by myself", "solo dining"
  * "special_occasion": "special occasion", "special event"
  * "tourist_friendly": "tourist", "visiting", "tourist spot"
  * "weekend_brunch": "weekend brunch", "sunday brunch", "saturday brunch"
  
  IMPORTANT: If the query mentions "late night", "late-night", or "late night bites", extract as occasionType: "late_night" (not as mealType). If no occasion is mentioned, set to null.
- Noise preference: Extract noise preference ("quiet", "any", or null)
- Special requirements: Extract boolean flags for instagrammable, michelin, cynthia's pick, coffee focus, dessert focus
- Special features: Extract special features as an array of strings. Available special features and their indicators:
  * "cash_only": "cash only", "cash payment", "no credit cards", "cash accepted"
  * "chef_driven": "chef's restaurant", "chef-driven", "chef-owned", "chef's table", "chef's menu"
  * "compact_seating": "small space", "intimate seating", "cozy seating", "tight seating", "compact"
  * "counter_seating": "counter seats", "bar seating", "counter dining", "sit at counter"
  * "counter_service": "counter service", "order at counter", "fast casual", "self-service"
  * "craft_driven": "craft cocktails", "craft beer", "artisanal", "handcrafted", "craft-focused"
  * "hard_to_get_into": "hard to get into", "difficult reservation", "exclusive", "hard to book", "popular spot"
  * "hidden_gem": "hidden gem", "hidden gems", "off the beaten path", "underrated", "locals love", "local favorite", "secret spot", "undiscovered"
  * "historic_venue": "historic", "historical", "landmark", "heritage", "oldest", "classic venue"
  * "iconic_venue": "iconic", "famous", "legendary", "must-visit", "landmark restaurant"
  * "instagrammable": "instagram", "photogenic", "aesthetic", "nice pictures", "beautiful space", "pretty", "instagram-worthy"
  * "outdoor_seating": "outdoor", "patio", "terrace", "garden seating", "al fresco", "outdoor dining"
  * "scenic_views": "scenic view", "ocean view", "city view", "waterfront", "rooftop", "panoramic view"
  * "speakeasy_vibe": "speakeasy", "hidden bar", "secret bar", "prohibition-style", "underground"
  * "unique_concept": "unique", "unusual", "one-of-a-kind", "creative concept", "innovative", "different"
  
  Examples:
  * "hidden gems locals love" -> specialFeatures: ["hidden_gem"]
  * "instagrammable restaurant with outdoor seating" -> specialFeatures: ["instagrammable", "outdoor_seating"]
  * "chef-driven spot that's hard to get into" -> specialFeatures: ["chef_driven", "hard_to_get_into"]
  * "cash only ramen shop with counter seating" -> specialFeatures: ["cash_only", "counter_seating"]
  * "speakeasy with craft cocktails" -> specialFeatures: ["speakeasy_vibe", "craft_driven"]

HANDLING VAGUE QUERIES:
For vague or subjective queries, make reasonable inferences based on common interpretations:
- "good vibes" -> Extract common positive vibe keywords: ["cozy", "lively", "trendy", "casual"]
- "something nice" -> Interpret as upscale/sophisticated: vibeKeywords: ["upscale", "sophisticated"], priceLevel: "moderate"
- "nice pictures" / "take nice pictures" -> Implies instagrammable: specialFeatures: ["instagrammable"], requiresInstagrammable: true, vibeKeywords: ["aesthetic", "photogenic"]
- "hidden gems" / "locals love" / "local favorite" -> specialFeatures: ["hidden_gem"]
- "where should I eat?" / "what should I eat?" -> No specific criteria, return minimal fields (just city if provided)
- If query is extremely vague with no clear criteria, return minimal extraction (only city if provided, empty arrays, null/undefined for optional fields)

IMPORTANT FOR SPECIAL FEATURES:
- Extract special features ONLY when explicitly mentioned or strongly implied in the query
- If a query mentions "instagram", "photogenic", or "nice pictures", include BOTH specialFeatures: ["instagrammable"] AND requiresInstagrammable: true (for backward compatibility)
- "hidden gems", "locals love", "local favorite", "off the beaten path" should extract specialFeatures: ["hidden_gem"]
- Be smart about synonyms: "cash only" = "cash_only", "chef's restaurant" = "chef_driven", "patio" = "outdoor_seating", etc.

IMPORTANT RULES:
1. Be precise - only extract information explicitly mentioned or strongly implied
2. For vague queries, make reasonable inferences based on common interpretations (see "HANDLING VAGUE QUERIES" above)
3. For cuisine descriptors like "traditional", "authentic", "modern", etc., include them as part of the cuisine context but don't extract as separate fields
4. Never extract "cynthia's favorites" or related phrases as neighborhoods
5. City names: Extract as city field ("nyc", "tokyo", "seoul", "paris", or undefined). NOTE: The city is also provided as a parameter, so always include it in the output.
6. Neighborhoods: Can be single string or array of strings
7. Cuisine type: Use lowercase, match common cuisine names (broad categories: italian, japanese, chinese, french, korean, etc.)
8. Cuisine specialty: Extract specific dishes/specialties separately from cuisine type. This field is open-ended - extract any dish name mentioned. The filterService uses flexible matching (checks restaurant metadata, names, and descriptions) so exact spelling isn't critical, but try to match common dish names. If no specific dish is mentioned, set to null.
9. For special queries like "Cynthia's favorites", set requiresCynthiasPick to true
10. Default all optional boolean fields to false if not mentioned (for initial queries)
11. Default arrays to empty arrays if not mentioned
12. For follow-up queries, merge new information with previous keywords (don't lose previous criteria unless explicitly changed)
13. FIELD REMOVAL: If the user explicitly says "not X" or "remove X" (e.g., "not Michelin", "actually, not Michelin", "remove the Michelin requirement"), set that boolean field to null (or omit it from the response) to REMOVE the filter entirely. Do NOT set it to false - false means the filter is active but set to false, while null/undefined means the filter is removed.
14. FLEXIBLE MATCHING: For open-ended fields like cuisine specialty, vibe keywords, and neighborhoods, the filterService uses flexible matching. This means:
    - Cuisine specialty: Matches against restaurant metadata (primaryType, specificType, types), restaurant names, and descriptions with normalization (handles accents, plural/singular variations)
    - Vibe keywords: Matches against restaurant vibe_tags array (exact match required)
    - Neighborhoods: Matches against neighborhood_extracted field with partial matching
    - You don't need to worry about exact spelling variations - extract what the user says, and the filterService will handle matching

RESPONSE FORMAT:
Respond with ONLY valid JSON matching this exact structure (no markdown, no backticks, no extra text):
{
  "neighborhood": null | string | string[],
  "borough": null | "brooklyn" | "manhattan",
  "city": null | "nyc" | "tokyo" | "seoul" | "paris",
  "cuisineType": null | string,
  "cuisineSpecialty": null | string,
  "mealType": null | "breakfast" | "brunch" | "lunch" | "dinner",
  "priceLevel": null | "budget" | "moderate" | "upscale" | "any",
  "needsTakeout": boolean,
  "needsCoffee": boolean,
  "vibeKeywords": string[],
  "occasionType": null | string,
  "noisePreference": null | "quiet" | "any",
  "requiresInstagrammable": boolean | null,
  "requiresMichelin": boolean | null,
  "requiresCynthiasPick": boolean | null,
  "requiresCoffeeFocus": boolean | null,
  "requiresDessertFocus": boolean | null,
  "specialFeatures": string[]
}

DO NOT include markdown formatting. DO NOT include backticks. Return ONLY the raw JSON object.`;

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

    // Get API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!anthropicApiKey) {
      console.error('[Parse Query] ANTHROPIC_API_KEY not set - Claude API is required');
      throw new Error("I don't quite get your question, try something else");
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
    // For boolean fields: null means "remove field" (set to undefined), false means "set to false", true means "set to true"
    const keywords: ExtractedKeywords = {
      vibeKeywords: parsedKeywords.vibeKeywords || [],
      occasionType: parsedKeywords.occasionType || null,
      noisePreference: parsedKeywords.noisePreference || null,
      // Handle null as field removal (undefined), preserve false/true, default to false if not present
      requiresInstagrammable: parsedKeywords.requiresInstagrammable === null ? undefined : (parsedKeywords.requiresInstagrammable ?? false),
      requiresMichelin: parsedKeywords.requiresMichelin === null ? undefined : (parsedKeywords.requiresMichelin ?? false),
      requiresCynthiasPick: parsedKeywords.requiresCynthiasPick === null ? undefined : (parsedKeywords.requiresCynthiasPick ?? false),
      requiresCoffeeFocus: parsedKeywords.requiresCoffeeFocus === null ? undefined : (parsedKeywords.requiresCoffeeFocus ?? false),
      requiresDessertFocus: parsedKeywords.requiresDessertFocus === null ? undefined : (parsedKeywords.requiresDessertFocus ?? false),
      specialFeatures: parsedKeywords.specialFeatures || [],
      neighborhood: parsedKeywords.neighborhood || undefined,
      borough: parsedKeywords.borough || undefined,
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

    return keywords;

  } catch (error) {
    console.error('[Parse Query] Error calling Claude API:', error);
    // Claude API is required - throw error for recommend.ts to handle
    throw new Error("I don't quite get your question, try something else");
  }
}
