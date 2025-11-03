// Claude API service for smart restaurant ranking
// Takes pre-filtered restaurants and returns personalized recommendations

import { Restaurant, ExtractedKeywords } from '../types/restaurant';

interface ClaudeRecommendation {
  restaurantName: string;
  reason: string;
  matchScore: number; // 1-10
  address: string;
  priceRange?: string;
  highlights: string[];
}

export interface ClaudeResponse {
  recommendations: ClaudeRecommendation[];
  summary: string;
}

/**
 * Prepare restaurant data for Claude API
 * Strips down to only essential fields to minimize tokens
 */
function prepareRestaurantData(restaurants: Restaurant[], maxRestaurants = 20) {
  // Limit to top N restaurants to control token usage
  const limitedRestaurants = restaurants.slice(0, maxRestaurants);
  
  return limitedRestaurants.map(r => ({
    name: r.google_data.displayName.text,
    address: r.original_place.properties.location.address,
    neighborhood: r.neighborhood_extracted,
    rating: r.google_data.rating,
    reviewCount: r.google_data.userRatingCount,
    priceRange: r.price_display,
    cuisineType: r.specific_type,
    types: r.google_data.types?.slice(0, 3), // Limit types array
    summary: r.google_data.generativeSummary?.overview?.text?.slice(0, 200) || '', // Truncate long summaries
    reviewHighlights: r.google_data.reviewSummary?.text?.text?.slice(0, 250) || '', // Truncate
    cynthiasPick: r.cynthias_pick || false,
    servesBreakfast: r.google_data.servesBreakfast,
    servesBrunch: r.google_data.servesBrunch,
    servesLunch: r.google_data.servesLunch,
    servesDinner: r.google_data.servesDinner,
    takeout: r.google_data.takeout,
    servesCoffee: r.google_data.servesCoffee,
  }));
}

/**
 * Build the prompt for Claude
 */
function buildPrompt(query: string, restaurants: any[]): string {
  return `You are Cynthia, a restaurant curator with impeccable taste. A user is asking: "${query}"

I've pre-filtered ${restaurants.length} restaurants that match the basic criteria. Your job is to analyze these and recommend the TOP 3-5 that best match the user's request.

RESTAURANTS TO ANALYZE:
${JSON.stringify(restaurants, null, 2)}

IMPORTANT GUIDELINES:
1. **STRONGLY prioritize restaurants where cynthiasPick is true** - these are your personal favorites and should almost always be included if they match
2. Consider the user's specific request (cuisine, vibe, occasion, price, etc.)
3. Pay close attention to ratings AND review highlights - reviews reveal the true character of a place
4. Be opinionated and personal - the user wants YOUR curated picks, not just a sorted list
5. Explain WHY each restaurant is perfect for their specific request
6. If the user's query is vague, make educated guesses based on your taste

RESPONSE FORMAT:
Respond with ONLY valid JSON in this exact format (no markdown, no backticks, no extra text):
{
  "recommendations": [
    {
      "restaurantName": "Exact name from the data",
      "reason": "2-3 sentences explaining why this is perfect for their request. Be specific and personal.",
      "matchScore": 9,
      "address": "Full address from the data",
      "priceRange": "$ or $$ or $$$ or $$$$",
      "highlights": ["Specific feature 1", "Specific feature 2", "Specific feature 3"]
    }
  ],
  "summary": "A warm, conversational 1-2 sentence intro in Cynthia's voice"
}

DO NOT include markdown formatting. DO NOT include backticks. Return ONLY the raw JSON object.`;
}

/**
 * Call Claude API to rank restaurants (server-side only)
 */
export async function rankRestaurantsWithClaude(
  query: string,
  filteredRestaurants: Restaurant[],
  apiKey: string
): Promise<ClaudeResponse> {
  try {
    console.log(`Sending ${filteredRestaurants.length} restaurants to Claude for ranking...`);

    // Prepare minimal data to save tokens (max 20 restaurants)
    const restaurantData = prepareRestaurantData(filteredRestaurants, 20);
    
    console.log(`Prepared data: ${restaurantData.length} restaurants, ~${JSON.stringify(restaurantData).length} characters`);
    
    // Build the prompt
    const prompt = buildPrompt(query, restaurantData);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
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
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    console.log('Raw Claude response:', responseText.slice(0, 200) + '...');

    // Parse Claude's JSON response
    // Strip any markdown formatting that might be present
    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let claudeResponse: ClaudeResponse;
    try {
      claudeResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', cleanedResponse);
      throw new Error('Claude returned invalid JSON');
    }

    console.log(`Claude returned ${claudeResponse.recommendations.length} recommendations`);
    return claudeResponse;

  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

/**
 * Get full restaurant data for recommendations
 * Maps Claude's recommendations back to full Restaurant objects
 */
export function enrichRecommendations(
  recommendations: ClaudeRecommendation[],
  allRestaurants: Restaurant[]
): Restaurant[] {
  return recommendations
    .map(rec => {
      const restaurant = allRestaurants.find(
        r => r.google_data.displayName.text === rec.restaurantName
      );
      return restaurant;
    })
    .filter((r): r is Restaurant => r !== undefined);
}

/**
 * Build the prompt for query parsing
 */
function buildQueryParsingPrompt(query: string): string {
  return `You are parsing a restaurant search query into structured data. Extract all relevant information from the user's query.

USER QUERY: "${query}"

Extract the following information:
- Location (neighborhood, borough, city): Extract any location mentions. Support single neighborhood or array for multiple (e.g., "Shibuya or Ginza" -> ["shibuya", "ginza"])
- Cuisine type: Extract cuisine or food type (e.g., "japanese", "italian", "sushi", "coffee", "cafe", "dessert", "pastry")
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
6. Cuisine type: Use lowercase, match common cuisine names
7. For special queries like "Cynthia's favorites", set requiresCynthiasPick to true
8. Default all optional boolean fields to false if not mentioned
9. Default arrays to empty arrays if not mentioned

RESPONSE FORMAT:
Respond with ONLY valid JSON matching this exact structure (no markdown, no backticks, no extra text):
{
  "neighborhood": null | string | string[],
  "borough": null | "brooklyn" | "manhattan",
  "city": null | "nyc" | "tokyo" | "seoul" | "paris",
  "cuisineType": null | string,
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
}

/**
 * Parse user query into structured ExtractedKeywords using Claude API
 */
export async function parseQueryWithClaude(
  query: string,
  apiKey: string
): Promise<ExtractedKeywords> {
  try {
    console.log(`[Claude Parser] Parsing query: "${query}"`);

    // Build the prompt
    const prompt = buildQueryParsingPrompt(query);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
      console.error('[Claude Parser] Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    console.log('[Claude Parser] Raw Claude response:', responseText.slice(0, 200) + '...');

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
      console.error('[Claude Parser] Failed to parse Claude response:', cleanedResponse);
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
      mealType: parsedKeywords.mealType || null,
      priceLevel: parsedKeywords.priceLevel || undefined,
      needsTakeout: parsedKeywords.needsTakeout || false,
      needsCoffee: parsedKeywords.needsCoffee || false,
    };

    console.log('[Claude Parser] Parsed keywords:', JSON.stringify(keywords, null, 2));
    return keywords;

  } catch (error) {
    console.error('[Claude Parser] Error calling Claude API:', error);
    throw error;
  }
}