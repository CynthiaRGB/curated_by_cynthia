// Claude query parser with context-aware follow-up support
// Parses ALL user queries into structured ExtractedKeywords using Claude API

import { ExtractedKeywords, QueryContext } from '../../src/types/restaurant.js';
import { extractKeywords } from './filterService.js';

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
- Cuisine specialty: Extract SPECIFIC DISH or SPECIALTY if mentioned (e.g., "pizza", "ramen", "yakitori", "unagi", "dim sum", "sushi", "pasta", "galettes", "crepes"). If no specific dish is mentioned, set to null. Examples:
  * "pizza in Manhattan" -> cuisineType: "italian", cuisineSpecialty: "pizza"
  * "dim sum in Chinatown" -> cuisineType: "chinese", cuisineSpecialty: "dim sum"
  * "yakitori in Tokyo" -> cuisineType: "japanese", cuisineSpecialty: "yakitori"
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
- Occasion type: Extract occasion (e.g., "date_night", "business_lunch", "family_friendly", "late_night", or null). IMPORTANT: If the query mentions "late night", "late-night", or "late night bites", extract as occasionType: "late_night" (not as mealType).
- Noise preference: Extract noise preference ("quiet", "any", or null)
- Special requirements: Extract boolean flags for instagrammable, michelin, cynthia's pick, coffee focus, dessert focus

HANDLING VAGUE QUERIES:
For vague or subjective queries, make reasonable inferences based on common interpretations:
- "good vibes" -> Extract common positive vibe keywords: ["cozy", "lively", "trendy", "casual"]
- "something nice" -> Interpret as upscale/sophisticated: vibeKeywords: ["upscale", "sophisticated"], priceLevel: "moderate"
- "nice pictures" / "take nice pictures" -> Implies instagrammable: requiresInstagrammable: true, vibeKeywords: ["aesthetic", "photogenic"]
- "where should I eat?" / "what should I eat?" -> No specific criteria, return minimal fields (just city if provided)
- If query is extremely vague with no clear criteria, return minimal extraction (only city if provided, empty arrays, null/undefined for optional fields)

IMPORTANT RULES:
1. Be precise - only extract information explicitly mentioned or strongly implied
2. For vague queries, make reasonable inferences based on common interpretations (see "HANDLING VAGUE QUERIES" above)
3. For cuisine descriptors like "traditional", "authentic", "modern", etc., include them as part of the cuisine context but don't extract as separate fields
4. Never extract "cynthia's favorites" or related phrases as neighborhoods
5. City names: Extract as city field ("nyc", "tokyo", "seoul", "paris", or undefined). NOTE: The city is also provided as a parameter, so always include it in the output.
6. Neighborhoods: Can be single string or array of strings
7. Cuisine type: Use lowercase, match common cuisine names (broad categories: italian, japanese, chinese, french, korean, etc.)
8. Cuisine specialty: Extract specific dishes/specialties separately from cuisine type. Common specialties include: pizza, ramen, yakitori, unagi, dim sum, sushi, pasta, galettes, crepes, pho, pad thai, etc. If no specific dish is mentioned, set to null.
9. For special queries like "Cynthia's favorites", set requiresCynthiasPick to true
10. Default all optional boolean fields to false if not mentioned (for initial queries)
11. Default arrays to empty arrays if not mentioned
12. For follow-up queries, merge new information with previous keywords (don't lose previous criteria unless explicitly changed)
13. FIELD REMOVAL: If the user explicitly says "not X" or "remove X" (e.g., "not Michelin", "actually, not Michelin", "remove the Michelin requirement"), set that boolean field to null (or omit it from the response) to REMOVE the filter entirely. Do NOT set it to false - false means the filter is active but set to false, while null/undefined means the filter is removed.

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
  "requiresDessertFocus": boolean | null
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
    console.error('[Parse Query] Error calling Claude API, falling back to deterministic extraction:', error);
    // Fallback to deterministic extraction on error
    // This ensures we still get useful keywords even if Claude fails
    try {
      const fallbackKeywords = extractKeywords(query);
      // Always include city from input parameter (city pill is always selected in UI)
      // Normalize city to filterService format (e.g., "New York City" -> "nyc")
      if (city) {
        fallbackKeywords.city = normalizeCityForFilter(city);
      }
      return fallbackKeywords;
    } catch (fallbackError) {
      console.error('[Parse Query] Fallback extraction also failed:', fallbackError);
      // Both Claude and fallback failed - throw error for recommend.ts to handle
      throw new Error("I don't quite get your question, try something else");
    }
  }
}
