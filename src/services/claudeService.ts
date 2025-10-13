// Client-side Claude API service for Vite
import { Restaurant } from '../types/restaurant';

// ⚠️ SECURITY WARNING: In production, this should be on a backend
// For now, we'll use it client-side (API key exposed in browser)
const ANTHROPIC_API_KEY = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

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
    summary: r.google_data.generativeSummary?.overview?.text?.slice(0, 200) || '',
    reviewHighlights: r.google_data.reviewSummary?.text?.text?.slice(0, 250) || '',
    cynthiasPick: r.cynthias_pick || false,
  }));
}

/**
 * Build the prompt for Claude
 */
function buildPrompt(query: string, restaurants: any[]): string {
  return `You are Cynthia, a restaurant curator. A user asked: "${query}"

I've pre-filtered ${restaurants.length} restaurants. Recommend the TOP 3-5 that best match their request.

RESTAURANTS:
${JSON.stringify(restaurants, null, 2)}

GUIDELINES:
1. STRONGLY prioritize restaurants where cynthiasPick is true
2. Consider the user's specific request (vibe, occasion, cuisine)
3. Be opinionated and personal
4. Explain WHY each is perfect

Respond with ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "restaurantName": "Exact name",
      "reason": "2-3 sentences why this is perfect",
      "matchScore": 9,
      "address": "Full address",
      "priceRange": "$$",
      "highlights": ["Feature 1", "Feature 2", "Feature 3"]
    }
  ],
  "summary": "Warm 1-2 sentence intro"
}`;
}

/**
 * Call Claude API from the browser
 */
export async function rankRestaurantsWithClaude(
  query: string,
  filteredRestaurants: Restaurant[]
): Promise<ClaudeResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured. Add VITE_ANTHROPIC_API_KEY to .env');
  }

  try {
    console.log(`Calling Claude API with ${filteredRestaurants.length} restaurants...`);

    const restaurantData = prepareRestaurantData(filteredRestaurants, 20);
    const prompt = buildPrompt(query, restaurantData);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const claudeResponse: ClaudeResponse = JSON.parse(cleanedResponse);
    console.log(`Claude returned ${claudeResponse.recommendations.length} recommendations`);
    
    return claudeResponse;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

/**
 * Map Claude recommendations back to Restaurant objects
 */
export function mapClaudeRecommendations(
  claudeResponse: ClaudeResponse,
  allRestaurants: Restaurant[]
): Restaurant[] {
  return claudeResponse.recommendations
    .map(rec => {
      const restaurant = allRestaurants.find(
        r => r.google_data.displayName.text === rec.restaurantName
      );
      if (restaurant) {
        // Add Claude's custom fields for display
        return {
          ...restaurant,
          _claudeReason: rec.reason,
          _claudeHighlights: rec.highlights,
          _claudeScore: rec.matchScore,
        } as any;
      }
      return null;
    })
    .filter((r): r is any => r !== null);
}