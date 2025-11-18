import type { VercelRequest, VercelResponse } from '@vercel/node';
import Statsig from "statsig-node";
import { preFilterRestaurants } from './services/filterService.js';
import { decideRoute, getMoreRestaurants, isShowMeMoreQuery, type RoutingContext } from './services/routingService.js';
import { parseQueryWithClaude, getHardcodedKeywordsForPrompt } from './services/parseQuery.js';
import { Restaurant, ExtractedKeywords, City, QueryContext } from '../src/types/restaurant.js';

/**
 * Check if query is specifically asking for Cynthia's favorites (should return ALL results)
 */
function isCynthiasFavoritesQuery(query: string, keywords?: ExtractedKeywords): boolean {
  const lowerQuery = query.toLowerCase();
  const hasCynthiasPattern = lowerQuery.includes("cynthia's favorites") || lowerQuery.includes("cynthias favorites");
  
  if (hasCynthiasPattern) {
    return true;
  }
  
  // Also check keywords if provided
  if (keywords && keywords.requiresCynthiasPick) {
    return true;
  }
  
  return false;
}


// Initialize Statsig server-side client
let statsigInitialized = false;

const initializeStatsig = async () => {
  if (!statsigInitialized) {
    const statsigSecret = process.env.STATSIG_SERVER_SECRET_KEY;
    
    console.log('[Statsig Debug] Environment check:');
    console.log('[Statsig Debug] - STATSIG_SERVER_SECRET_KEY exists:', !!statsigSecret);
    console.log('[Statsig Debug] - Value length:', statsigSecret ? statsigSecret.length : 0);
    console.log('[Statsig Debug] - All env vars with STATSIG:', Object.keys(process.env).filter(key => key.includes('STATSIG')));
    
    if (!statsigSecret) {
      throw new Error('STATSIG_SERVER_SECRET_KEY environment variable is not set');
    }
    
    await Statsig.initialize(
      statsigSecret,  // ✅ Use environment variable
      { environment: { tier: "production" } }
    );
    statsigInitialized = true;
    console.log('[Statsig Debug] Successfully initialized');
  }
};

// Supported cities
const SUPPORTED_CITIES: City[] = ['New York City', 'Tokyo', 'Paris', 'Seoul'];
const SUPPORTED_CITY_ALIASES: { [key: string]: City } = {
  'nyc': 'New York City',
  'new york': 'New York City',
  'new york city': 'New York City',
  'tokyo': 'Tokyo',
  'paris': 'Paris',
  'seoul': 'Seoul'
};

/**
 * Validate city parameter
 */
function validateCity(city: string | undefined): city is City {
  if (!city) return false;
  return SUPPORTED_CITIES.includes(city as City) || 
         Object.keys(SUPPORTED_CITY_ALIASES).includes(city.toLowerCase());
}

/**
 * Normalize city name to standard format
 */
function normalizeCity(city: string | undefined): City | undefined {
  if (!city) return undefined;
  const lowerCity = city.toLowerCase();
  if (SUPPORTED_CITIES.includes(city as City)) {
    return city as City;
  }
  return SUPPORTED_CITY_ALIASES[lowerCity];
}

/**
 * Detect unsupported cities in query
 */
function detectUnsupportedCityInQuery(query: string): string | null {
  const unsupportedCities = [
    'london', 'berlin', 'rome', 'madrid', 'barcelona', 'amsterdam',
    'dublin', 'vienna', 'prague', 'lisbon', 'athens', 'stockholm',
    'copenhagen', 'oslo', 'helsinki', 'warsaw', 'budapest', 'bucharest',
    'moscow', 'istanbul', 'dubai', 'singapore', 'hong kong', 'bangkok',
    'sydney', 'melbourne', 'toronto', 'vancouver', 'montreal', 'miami',
    'los angeles', 'san francisco', 'chicago', 'boston', 'seattle',
    'austin', 'denver', 'portland', 'philadelphia', 'washington'
  ];
  
  const lowerQuery = query.toLowerCase();
  for (const city of unsupportedCities) {
    if (lowerQuery.includes(city)) {
      return city;
    }
  }
  return null;
}


// Helper function to extract cuisine type from search query
const getCuisineTypeFromQuery = (query: string): string => {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('sushi') || lowerQuery.includes('japanese')) return 'japanese';
  if (lowerQuery.includes('italian')) return 'italian';
  if (lowerQuery.includes('chinese')) return 'chinese';
  if (lowerQuery.includes('korean')) return 'korean';
  if (lowerQuery.includes('french')) return 'french';
  if (lowerQuery.includes('mexican')) return 'mexican';
  if (lowerQuery.includes('thai')) return 'thai';
  if (lowerQuery.includes('indian')) return 'indian';
  if (lowerQuery.includes('pizza')) return 'pizza';
  if (lowerQuery.includes('burger')) return 'burger';
  if (lowerQuery.includes('steak')) return 'steak';
  if (lowerQuery.includes('seafood')) return 'seafood';
  if (lowerQuery.includes('coffee') || lowerQuery.includes('cafe')) return 'cafe';
  if (lowerQuery.includes('brunch')) return 'brunch';
  if (lowerQuery.includes('romantic')) return 'romantic';
  if (lowerQuery.includes("cynthia's favorites")) return 'cynthias_picks';
  
  return 'general';
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Statsig server-side client
    await initializeStatsig();
    
    const { 
      query, 
      city, // Selected city pill (required)
      userId = 'api-user',
      context // Optional: { previousQuery, previousKeywords, previousResultIds, city }
    } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('[API] Query received:', query);
    console.log('[API] City received:', city);
    if (context) {
      console.log('[API] Context provided:', {
        hasPreviousQuery: !!context.previousQuery,
        previousResultIdsCount: context.previousResultIds?.length || 0,
        previousCity: context.city
      });
    }

    // Step 1: Validate city parameter
    if (!validateCity(city)) {
      return res.status(400).json({ 
        error: 'Invalid city',
        message: 'City must be one of: New York City, Tokyo, Paris, or Seoul'
      });
    }

    // Normalize city to standard format
    const normalizedCity = normalizeCity(city)!;
    console.log('[API] Normalized city:', normalizedCity);

    // Step 2: Check for unsupported cities in query
    const unsupportedCity = detectUnsupportedCityInQuery(query);
    if (unsupportedCity) {
      return res.status(200).json({
        recommendations: [],
        summary: "We only support restaurants in New York City, Tokyo, Paris, and Seoul. Please select one of these cities.",
        usedClaude: false,
        usedClaudeRanking: false,
        route: 'parseAndFilter',
        context: undefined
      });
    }

    // Default configuration values
    const maxResults = 10;

    const apiStartTime = Date.now();

    // Step 3: Decide routing strategy (simplified - just check if irrelevant)
    const routingContext: RoutingContext | undefined = context ? {
      previousQuery: context.previousQuery,
      previousResults: context.previousResults?.map((r: any) => r as Restaurant),
      previousRoute: context.previousRoute,
    } : undefined;
    
    const routeDecision = decideRoute(query, routingContext);
    console.log('[Routing] Decision:', routeDecision.route, '-', routeDecision.reason);

    // Step 4: Handle irrelevant queries (fast pre-check - returns immediately, no Claude API call)
    if (routeDecision.route === 'irrelevant') {
      return res.status(200).json({
        recommendations: [],
        summary: "I'm designed to answer restaurant-related questions only, try a different search!",
        usedClaude: false,
        usedClaudeRanking: false,
        route: 'irrelevant',
        context: undefined
      });
    }

    // Step 5: Parse query (use previous query for "show me more" to preserve filters)
    const queryToFilter = isShowMeMoreQuery(query) && context?.previousQuery 
      ? context.previousQuery 
      : query;
    
    let parsedKeywords: ExtractedKeywords | undefined;
    let usedClaudeForParsing = false;
    
    // Build query context for follow-ups
    const queryContext: QueryContext | undefined = context ? {
      previousQuery: context.previousQuery,
      previousKeywords: context.previousKeywords,
      previousResultIds: context.previousResultIds || [],
      city: normalizedCity
    } : undefined;
    
    // OPTIMIZATION: For "show me more" queries, reuse previous keywords from context
    // This avoids Claude API calls and saves costs (we already have the keywords from the first query)
    if (isShowMeMoreQuery(query)) {
      if (context?.previousKeywords) {
        console.log('[API] "Show me more" query detected - reusing previous keywords (skipping Claude API call)');
        parsedKeywords = context.previousKeywords;
        usedClaudeForParsing = false; // No Claude API call needed
        console.log('[API] Confirmed: parsedKeywords set from context, Claude API call will be skipped');
      } else {
        console.warn('[API] "Show me more" query detected but context.previousKeywords is missing! This should not happen.');
        console.warn('[API] Context available:', !!context, 'PreviousKeywords:', context?.previousKeywords);
        // Return error instead of calling Claude - "Show me more" requires context
        return res.status(200).json({
          recommendations: [],
          summary: "I need a previous search to show more results. Please start with a new search!",
          usedClaude: false,
          usedClaudeRanking: false,
          route: 'parseAndFilter',
          context: undefined,
          hasMoreResults: false,
          debug: {
            maxResults: 10,
            routingReason: 'Show me more query without context',
            parsedKeywords: undefined
          }
        });
      }
    }
    
    // OPTIMIZATION: Check if this is a city-prompt-item and use hardcoded keywords
    // This avoids Claude API calls for predefined prompts (saves costs and improves latency)
    // Only check for hardcoded keywords if there's no context (follow-up queries need Claude)
    // Skip if we already have keywords from "show me more" optimization above
    if (!parsedKeywords && !queryContext) {
      const hardcodedKeywords = getHardcodedKeywordsForPrompt(queryToFilter, normalizedCity);
      if (hardcodedKeywords) {
        console.log('[API] Using hardcoded keywords for city-prompt-item (skipping Claude API call)');
        parsedKeywords = hardcodedKeywords;
        usedClaudeForParsing = false; // No Claude API call needed
      }
    }
    
    // If no hardcoded keywords found and not a "show me more" query, use Claude API to parse the query
    // IMPORTANT: "Show me more" queries should NEVER call Claude (handled above)
    if (!parsedKeywords && !isShowMeMoreQuery(query)) {
      console.log('[API] ⚠️ WARNING: parsedKeywords is undefined/null, calling Claude API');
      console.log('[API] Debug info - isShowMeMoreQuery:', isShowMeMoreQuery(query), 'hasContext:', !!context, 'hasPreviousKeywords:', !!context?.previousKeywords);
      const claudeParseStartTime = Date.now();
      try {
        parsedKeywords = await parseQueryWithClaude(queryToFilter, normalizedCity, queryContext);
        usedClaudeForParsing = true;
        const claudeParseTime = Date.now() - claudeParseStartTime;
        console.log(`[Performance] Claude query parsing took ${claudeParseTime}ms`);
        console.log('[API] Successfully parsed query with Claude');
      } catch (parseError: any) {
      // Check if Claude detected irrelevant query (fallback - in case pattern matching missed it)
      // parseQuery throws this specific error message when NOT_RESTAURANT_QUERY is detected
      if (parseError.message && parseError.message.includes("I'm designed to answer restaurant-related questions only")) {
        return res.status(200).json({
          recommendations: [],
          summary: "I'm designed to answer restaurant-related questions only, try a different search!",
          usedClaude: false,
          usedClaudeRanking: false,
          route: 'irrelevant',
          context: undefined
        });
      }
      
      // Check for service issues (missing API key, Claude API errors)
      if (parseError.message && parseError.message.includes("PARSE_ERROR_SERVICE_ISSUE")) {
        console.error('[API] Service error in parseQuery - user will see generic error message');
        console.error('[API] Parse error details:', parseError.message);
        return res.status(200).json({
          recommendations: [],
          summary: "Oops, something went wrong with the service. Please try again.",
          usedClaude: false,
          usedClaudeRanking: false,
          route: routeDecision.route,
          context: undefined
        });
      }
      
      // Check for invalid JSON response (Claude returned malformed JSON)
      if (parseError.message && parseError.message.includes("PARSE_ERROR_INVALID_QUERY")) {
        console.error('[API] Invalid JSON from Claude - user will see "try something else" message');
        console.error('[API] Parse error details:', parseError.message);
        return res.status(200).json({
          recommendations: [],
          summary: "I don't quite get your question, try something else",
          usedClaude: false,
          usedClaudeRanking: false,
          route: routeDecision.route,
          context: undefined
        });
      }
      
      // Fallback for any other parse errors
      console.error('[API] Unexpected error parsing query with Claude:', parseError);
      console.error('[API] Error message:', parseError.message);
      console.error('[API] Error stack:', parseError.stack);
      return res.status(200).json({
        recommendations: [],
        summary: "I don't quite get your question, try something else",
        usedClaude: false,
        usedClaudeRanking: false,
        route: routeDecision.route,
        context: undefined
      });
      }
    }
    
    // Normalize city in keywords to use selected city (ignore city from query parsing if different)
    if (parsedKeywords) {
      // Map normalized city to filterService format
      const cityMap: { [key in City]: string } = {
        'New York City': 'nyc',
        'Tokyo': 'tokyo',
        'Paris': 'paris',
        'Seoul': 'seoul'
      };
      parsedKeywords.city = cityMap[normalizedCity];
      
      // Clean up keywords: remove fields with false/null/empty values for cleaner filtering
      const cleanedKeywords: ExtractedKeywords = {
        vibeKeywords: parsedKeywords.vibeKeywords || [] // Required field, always include
      };
      if (parsedKeywords.borough) cleanedKeywords.borough = parsedKeywords.borough;
      if (parsedKeywords.city) cleanedKeywords.city = parsedKeywords.city;
      if (parsedKeywords.neighborhood) cleanedKeywords.neighborhood = parsedKeywords.neighborhood;
      if (parsedKeywords.landmark) cleanedKeywords.landmark = parsedKeywords.landmark;
      if (parsedKeywords.cuisineType) cleanedKeywords.cuisineType = parsedKeywords.cuisineType;
      if (parsedKeywords.cuisineSpecialty) cleanedKeywords.cuisineSpecialty = parsedKeywords.cuisineSpecialty;
      if (parsedKeywords.mealType) cleanedKeywords.mealType = parsedKeywords.mealType;
      if (parsedKeywords.priceLevel) cleanedKeywords.priceLevel = parsedKeywords.priceLevel;
      if (parsedKeywords.occasionType) cleanedKeywords.occasionType = parsedKeywords.occasionType;
      if (parsedKeywords.noiseLevel) cleanedKeywords.noiseLevel = parsedKeywords.noiseLevel;
      if (parsedKeywords.needsTakeout) cleanedKeywords.needsTakeout = parsedKeywords.needsTakeout;
      if (parsedKeywords.needsCoffee) cleanedKeywords.needsCoffee = parsedKeywords.needsCoffee;
      if (parsedKeywords.requiresInstagrammable) cleanedKeywords.requiresInstagrammable = parsedKeywords.requiresInstagrammable;
      if (parsedKeywords.requiresMichelin) cleanedKeywords.requiresMichelin = parsedKeywords.requiresMichelin;
      if (parsedKeywords.requiresCynthiasPick) cleanedKeywords.requiresCynthiasPick = parsedKeywords.requiresCynthiasPick;
      if (parsedKeywords.specialFeatures && parsedKeywords.specialFeatures.length > 0) cleanedKeywords.specialFeatures = parsedKeywords.specialFeatures;
      
      parsedKeywords = cleanedKeywords;
    }
    
    // Step 6: Pre-filter with filterService (using parsed keywords if available)
    console.log('[API] Pre-filtering restaurants with filterService');
    console.log(`[API] Using query for filtering: "${queryToFilter}" (original query: "${query}")`);
    console.log('[API] Parsed keywords being passed to filterService:', JSON.stringify(parsedKeywords, null, 2));
    const filterStartTime = Date.now();
    let filteredRestaurants = await preFilterRestaurants(queryToFilter, parsedKeywords);
    const filterTime = Date.now() - filterStartTime;
    console.log(`[Performance] Filter service took ${filterTime}ms and returned ${filteredRestaurants.length} restaurants`);

    // Step 7: Get final keywords to check if this is a Cynthia's favorites query
    if (!parsedKeywords) {
      return res.status(200).json({
        recommendations: [],
        summary: "I don't quite get your question, try something else",
        usedClaude: false,
        usedClaudeRanking: false,
        route: routeDecision.route,
        context: undefined
      });
    }
    const isCynthiasFavorites = isCynthiasFavoritesQuery(queryToFilter, parsedKeywords);
    
    if (isCynthiasFavorites) {
      console.log('[API] Query is for Cynthia\'s favorites - will return ALL matching restaurants (no limit)');
    }

    // Step 8: Handle "show me more" follow-ups - exclude previously shown results
    if (isShowMeMoreQuery(query) && context?.previousResultIds && context.previousResultIds.length > 0) {
      const previousRestaurants = filteredRestaurants.filter(r => 
        context.previousResultIds!.includes(r.google_place_id)
      );
      console.log(`[API] Excluding ${previousRestaurants.length} previously shown restaurants`);
      filteredRestaurants = getMoreRestaurants(filteredRestaurants, previousRestaurants);
      console.log(`[API] After excluding previous results: ${filteredRestaurants.length} restaurants`);
    }

    if (filteredRestaurants.length === 0) {
      return res.status(200).json({
        recommendations: [],
        summary: "No more spots found matching your criteria. Try a different search!",
        usedClaude: false,
        usedClaudeRanking: false,
        route: routeDecision.route,
        context: undefined
      });
    }

    // Step 9: Use filterService ranking (restaurants are already sorted by filterService)
    let finalRestaurants: Restaurant[] = [];
    let summary = '';
    const usedClaudeRanking = false; // Always false now - using filterService ranking only
    
    // Special case: Cynthia's favorites queries should return ALL results, not limited by maxResults
    let hasMoreResults = false;
    if (isCynthiasFavorites) {
      console.log(`[API] Returning ALL ${filteredRestaurants.length} Cynthia's favorites (no limit applied)`);
      finalRestaurants = filteredRestaurants; // Return all, no slice
      summary = `Curated ${finalRestaurants.length} spots just for you`;
      hasMoreResults = false; // Cynthia's favorites returns all, so no more results
    } else {
      finalRestaurants = filteredRestaurants.slice(0, maxResults);
      summary = `Curated ${finalRestaurants.length} spots just for you`;
      hasMoreResults = filteredRestaurants.length > maxResults; // Check if there are more results available
    }

    // Step 10: Build context for next query (for follow-ups)
    // For "show me more" queries, preserve the original query from context, not "show me more"
    // Also accumulate previousResultIds (don't replace - we need all shown restaurants, not just the latest batch)
    const newResultIds = finalRestaurants.map(r => r.google_place_id);
    const accumulatedResultIds = isShowMeMoreQuery(query) && context?.previousResultIds
      ? [...context.previousResultIds, ...newResultIds] // Accumulate: add new IDs to existing ones
      : newResultIds; // First query: just use the new IDs
    
    const nextContext: QueryContext = {
      previousQuery: isShowMeMoreQuery(query) && context?.previousQuery 
        ? context.previousQuery 
        : query,
      previousKeywords: parsedKeywords,
      previousResultIds: accumulatedResultIds,
      city: normalizedCity
    };

    // Log server-side API performance event
    const apiProcessingTime = Date.now() - apiStartTime;
    console.log(`[Performance] Total API processing time: ${apiProcessingTime}ms`);

    // Log restaurant search event using the correct Statsig format
    try {
      Statsig.logEvent(
        { userID: userId },
        'restaurant_search_completed',
        finalRestaurants.length,
        {
          search_query: query,
          city: normalizedCity,
          cuisine_type: getCuisineTypeFromQuery(query),
          results_found: finalRestaurants.length.toString(),
          cynthias_picks_count: finalRestaurants.filter(r => r.cynthias_pick).length.toString(),
          processing_time_ms: apiProcessingTime.toString(),
          used_claude: (usedClaudeForParsing || usedClaudeRanking).toString(),
          used_claude_ranking: usedClaudeRanking.toString(),
          route: routeDecision.route
        }
      );
    } catch (statsigLogError) {
      console.error('[Statsig] Error logging event:', statsigLogError);
    }

    return res.status(200).json({
      recommendations: finalRestaurants,
      summary,
      usedClaude: usedClaudeForParsing || usedClaudeRanking,
      usedClaudeRanking,
      route: routeDecision.route,
      context: nextContext, // Return context for follow-up queries
      hasMoreResults, // Indicate if there are more results available (for "Show me more" quick action)
      debug: {
        maxResults,
        routingReason: routeDecision.reason,
        parsedKeywords: parsedKeywords
      }
    });

  } catch (error: any) {
    console.error('[API] Error:', error);
    
    // Log server-side error event
    try {
      Statsig.logEvent(
        { userID: 'api-user' },
        'api_error',
        null,
        {
          error_message: error.message || 'Unknown error',
          error_type: error.name || 'Error',
          timestamp: new Date().toISOString()
        }
      );
    } catch (statsigError) {
      console.error('[API] Failed to log error to Statsig:', statsigError);
    }
    
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}