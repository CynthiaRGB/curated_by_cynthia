import type { VercelRequest, VercelResponse } from '@vercel/node';
import Statsig from "statsig-node";
import { preFilterRestaurants, isCityPromptItem, extractKeywords } from './services/filterService.js';
import { decideRoute, getMoreRestaurants, isShowMeMoreQuery, type RoutingContext } from './services/routingService.js';
import { rankRestaurantsWithClaude, enrichRecommendations, parseQueryWithClaude } from '../src/claudeService.js';
import { getCachedResponse, setCachedResponse, generateCacheKey } from './services/claudeCache.js';
import { Restaurant, ExtractedKeywords } from '../src/types/restaurant.js';

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
      userId = 'api-user',
      context // Optional: { previousQuery, previousResults, previousRoute }
    } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('[API] Query received:', query);
    if (context) {
      console.log('[API] Context provided:', {
        hasPreviousQuery: !!context.previousQuery,
        previousResultsCount: context.previousResults?.length || 0,
        previousRoute: context.previousRoute
      });
    }

    // Create Statsig user object
    const statsigUser = {
      userID: userId
    };

    // Try to fetch Dynamic Config from Statsig
    let cynthiaBoost = 1.5; // Default fallback
    let maxResults = 10; // Default fallback
    let statsigConfigFetched = false;
    let statsigError = 'No error';
    
    try {
      console.log('[Statsig Config] Attempting to fetch Dynamic Config...');
      const rankingConfig = Statsig.getConfig(statsigUser, 'results_ranking');
      
      console.log('[Statsig Config] Config object:', rankingConfig);
      console.log('[Statsig Config] Config type:', typeof rankingConfig);
      
      if (rankingConfig) {
        cynthiaBoost = rankingConfig.get('cynthias_pick_multiplier', 1.5);
        maxResults = rankingConfig.get('max_results', 10);
        statsigConfigFetched = true;
        console.log('[Statsig Config] Successfully fetched config values');
      } else {
        statsigError = 'Config object is null or undefined';
        console.log('[Statsig Config] Config object is null/undefined');
      }
    } catch (error) {
      statsigError = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Statsig Config] Error fetching config:', error);
    }
    
    console.log('[Statsig Config] Final values - Cynthia boost:', cynthiaBoost);
    console.log('[Statsig Config] Final values - Max results:', maxResults);
    console.log('[Statsig Config] Config fetched:', statsigConfigFetched);
    console.log('[Statsig Config] Error:', statsigError);

    const apiStartTime = Date.now();

    // Step 1: Decide routing strategy
    // Pass the CURRENT query to detect "show me more" pattern, but we'll use previous query for filtering
    const routingContext: RoutingContext | undefined = context ? {
      previousQuery: context.previousQuery,
      previousResults: context.previousResults?.map((r: any) => r as Restaurant),
      previousRoute: context.previousRoute,
    } : undefined;
    
    // Use current query for routing decision (to detect "show me more" pattern)
    // But for "show me more", we'll force filterService route and use previous query for filtering
    const routeDecision = decideRoute(query, routingContext);
    console.log('[Routing] Decision:', routeDecision.route, '-', routeDecision.reason);

    // Step 2: Handle irrelevant queries
    if (routeDecision.route === 'default') {
      return res.status(200).json({
        recommendations: [],
        summary: "Sorry, I'm designed to only answer questions related to restaurants. Try another question.",
        usedClaude: false,
        route: 'default',
      });
    }

    // Step 3: Parse query with Claude API (unless it's a city-prompt-item, which is deterministic)
    // For "show me more" queries, use the previous query to preserve filters (cuisine, location, etc.)
    const queryToFilter = isShowMeMoreQuery(query) && context?.previousQuery 
      ? context.previousQuery 
      : query;
    
    let parsedKeywords: ExtractedKeywords | undefined;
    const isPromptItem = isCityPromptItem(queryToFilter);
    
    if (!isPromptItem) {
      // Use Claude API to parse the query into structured keywords
      console.log('[API] Parsing query with Claude API (not a city-prompt-item)');
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      
      if (!anthropicApiKey) {
        console.warn('[API] ANTHROPIC_API_KEY not set, falling back to deterministic keyword extraction');
      } else {
        try {
          parsedKeywords = await parseQueryWithClaude(queryToFilter, anthropicApiKey);
          console.log('[API] Successfully parsed query with Claude');
        } catch (parseError: any) {
          console.error('[API] Error parsing query with Claude, falling back to deterministic extraction:', parseError);
          // Fallback to deterministic extraction on error
        }
      }
    } else {
      console.log('[API] Query is a city-prompt-item, using deterministic keyword extraction');
    }
    
    // Step 4: Pre-filter with filterService (using parsed keywords if available)
    console.log('[API] Pre-filtering restaurants with filterService');
    console.log(`[API] Using query for filtering: "${queryToFilter}" (original query: "${query}")`);
    let filteredRestaurants = preFilterRestaurants(queryToFilter, parsedKeywords);
    console.log(`[API] Filter service returned ${filteredRestaurants.length} restaurants`);

    // Step 4.5: Get final keywords to check if this is a Cynthia's favorites query
    // (Use parsed keywords if available, otherwise extract them)
    const finalKeywords = parsedKeywords || extractKeywords(queryToFilter);
    const isCynthiasFavorites = isCynthiasFavoritesQuery(queryToFilter, finalKeywords);
    
    if (isCynthiasFavorites) {
      console.log('[API] Query is for Cynthia\'s favorites - will return ALL matching restaurants (no limit)');
    }

    // Step 5: Handle "show me more" follow-ups - exclude previously shown results
    if (isShowMeMoreQuery(query) && context?.previousResults) {
      const previousRestaurants = (context.previousResults as Restaurant[]) || [];
      console.log(`[API] Excluding ${previousRestaurants.length} previously shown restaurants`);
      filteredRestaurants = getMoreRestaurants(filteredRestaurants, previousRestaurants);
      console.log(`[API] After excluding previous results: ${filteredRestaurants.length} restaurants`);
    }

    if (filteredRestaurants.length === 0) {
      return res.status(200).json({
        recommendations: [],
        summary: "No more spots found matching your criteria. Try a different search!",
        usedClaude: false,
        route: routeDecision.route,
      });
    }

    // Step 6: Execute routing decision
    // FORCE filterService route for "show me more" queries - never call Claude
    const shouldUseFilterServiceOnly = isShowMeMoreQuery(query);
    
    let finalRestaurants: Restaurant[] = [];
    let summary = '';
    let usedClaude = false;

    if (!shouldUseFilterServiceOnly && routeDecision.route === 'claude' && routeDecision.needsClaude) {
      // Use Claude API for nuanced queries
      console.log('[API] Using Claude API for nuanced query');
      usedClaude = true;

      // Check cache first
      const restaurantIds = filteredRestaurants.map(r => r.google_place_id);
      const cacheKey = generateCacheKey(query, restaurantIds);
      let claudeResponse = getCachedResponse(query, restaurantIds);

      if (!claudeResponse) {
        // Cache miss - call Claude API
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!anthropicApiKey) {
          console.warn('[API] ANTHROPIC_API_KEY not set, falling back to filterService');
          // Fallback to filterService
          // Special case: Cynthia's favorites queries should return ALL results
          if (isCynthiasFavorites) {
            finalRestaurants = filteredRestaurants; // Return all, no slice
          } else {
            finalRestaurants = filteredRestaurants.slice(0, maxResults);
          }
          summary = `Curated ${finalRestaurants.length} spots just for you`;
          usedClaude = false;
        } else {
          try {
            claudeResponse = await rankRestaurantsWithClaude(
              query,
              filteredRestaurants,
              anthropicApiKey
            );
            
            // Cache the response
            setCachedResponse(query, claudeResponse, restaurantIds);
            
            // Map Claude recommendations back to full Restaurant objects
            finalRestaurants = enrichRecommendations(
              claudeResponse.recommendations,
              filteredRestaurants
            );
            
            summary = claudeResponse.summary || `Curated ${finalRestaurants.length} spots just for you`;
          } catch (claudeError: any) {
            console.error('[API] Claude API error, falling back to filterService:', claudeError);
            // Fallback to filterService on error
            // Special case: Cynthia's favorites queries should return ALL results
            if (isCynthiasFavorites) {
              finalRestaurants = filteredRestaurants; // Return all, no slice
            } else {
              finalRestaurants = filteredRestaurants.slice(0, maxResults);
            }
            summary = `Curated ${finalRestaurants.length} spots just for you`;
            usedClaude = false;
          }
        }
      } else {
        // Cache hit - use cached response
        console.log('[API] Using cached Claude response');
        finalRestaurants = enrichRecommendations(
          claudeResponse.recommendations,
          filteredRestaurants
        );
        summary = claudeResponse.summary || `Curated ${finalRestaurants.length} spots just for you`;
      }
    } else {
      // Use filterService only
      console.log('[API] Using filterService only');
      
      // Special case: Cynthia's favorites queries should return ALL results, not limited by maxResults
      if (isCynthiasFavorites) {
        console.log(`[API] Returning ALL ${filteredRestaurants.length} Cynthia's favorites (no limit applied)`);
        finalRestaurants = filteredRestaurants; // Return all, no slice
        summary = `Curated ${finalRestaurants.length} spots just for you`;
      } else {
        finalRestaurants = filteredRestaurants.slice(0, maxResults);
        summary = `Curated ${finalRestaurants.length} spots just for you`;
      }
      usedClaude = false;
    }

    // Log server-side API performance event
    const apiProcessingTime = Date.now() - apiStartTime;

    // Log restaurant search event using the correct Statsig format
    try {
      Statsig.logEvent(
        statsigUser,
        'restaurant_search_completed',
        finalRestaurants.length,
        {
          search_query: query,
          city: query.toLowerCase().includes(' in ') ? query.split(' in ')[1] : 'unknown',
          cuisine_type: getCuisineTypeFromQuery(query),
          results_found: finalRestaurants.length.toString(),
          cynthias_picks_count: finalRestaurants.filter(r => r.cynthias_pick).length.toString(),
          processing_time_ms: apiProcessingTime.toString(),
          used_claude: usedClaude.toString(),
          route: routeDecision.route
        }
      );
    } catch (statsigLogError) {
      console.error('[Statsig] Error logging event:', statsigLogError);
    }

    return res.status(200).json({
      recommendations: finalRestaurants,
      summary,
      usedClaude,
      route: routeDecision.route,
      debug: {
        cynthiaBoost,
        maxResults,
        statsigConfigFetched,
        statsigClientInitialized: statsigInitialized,
        errorMessage: statsigError,
        routingReason: routeDecision.reason
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