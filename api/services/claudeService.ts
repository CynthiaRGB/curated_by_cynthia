// Server-side Claude API service
import { Restaurant } from '../../src/types/restaurant';

interface ClaudeRecommendation {
  restaurantName: string;
  reason: string;
  matchScore: number;
  address: string;
  neighborhood?: string;
  priceRange?: string;
  rating?: number;
  reviewCount?: number;
  highlights: string[];
  cynthiasPick?: boolean;
}

export interface ClaudeResponse {
  recommendations: ClaudeRecommendation[];
  summary: string;
}

/**
 * Prepare restaurant data for Claude (minimal to save tokens)
 */
function prepareRestaurantData(restaurants: Restaurant[], maxRestaurants = 20) {
  const limitedRestaurants = restaurants.slice(0, maxRestaurants);
  
  return limitedRestaurants.map(r => ({
    name: r.google_data.displayName.text,
    address: r.original_place.properties.location.address,
    neighborhood: r.neighborhood_extracted,
    rating: r.google_data.rating,
    reviewCount: r.google_data.userRatingCount,
    priceRange: r.price_display,
    cuisineType: r.specific_type,
    types: r.google_data.types?.slice(0, 3),
    summary: r.google_data.generativeSummary?.overview?.text?.slice(0, 200) || '',
    reviewHighlights: r.google_data.reviewSummary?.text?.text?.slice(0, 250) || '',
    cynthiasPick: r.cynthias_pick || false,
    servesBreakfast: r.google_data.servesBreakfast,
    servesBrunch: r.google_data.servesBrunch,
    servesLunch: r.google_data.servesLunch,
    servesDinner: r.google_data.servesDinner,
  }));
}

/**
 * Build the prompt for Claude
 */
function buildPrompt(query: string, restaurants: any[]): string {
  return `You are Cynthia, a restaurant curator with impeccable taste. A user asked: "${query}"

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
    console.log(`[Claude] Preparing to rank ${filteredRestaurants.length} restaurants...`);

    // Prepare minimal data to save tokens (max 20 restaurants)
    const restaurantData = prepareRestaurantData(filteredRestaurants, 20);
    
    console.log(`[Claude] Sending ${restaurantData.length} restaurants (~${JSON.stringify(restaurantData).length} chars)`);
    
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
      console.error('[Claude] API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    console.log('[Claude] Response received, parsing...');

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
      console.error('[Claude] Failed to parse response:', cleanedResponse);
      throw new Error('Claude returned invalid JSON');
    }

    console.log(`[Claude] Successfully parsed ${claudeResponse.recommendations.length} recommendations`);
    return claudeResponse;

  } catch (error) {
    console.error('[Claude] Error calling Claude API:', error);
    throw error;
  }
}