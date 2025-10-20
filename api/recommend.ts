import type { VercelRequest, VercelResponse } from '@vercel/node';
import Statsig from "statsig-node";
import { preFilterRestaurants } from './services/filterService.js';

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
    
    const { query, userId = 'api-user' } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('[API] Query received:', query);

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

    // Use the filter service to process query
    console.log('[API] Using filter service to process query');
    const filteredRestaurants = preFilterRestaurants(query);
    console.log(`[API] Filter service returned ${filteredRestaurants.length} restaurants`);

    // Log server-side API performance event
    const apiProcessingTime = Date.now() - apiStartTime;

    if (filteredRestaurants.length === 0) {
      return res.status(200).json({
        recommendations: [],
        summary: "No spots found matching your criteria. Try a different search!",
        usedClaude: false,
      });
    }

    // Return top results based on Statsig config
    const topResults = filteredRestaurants.slice(0, maxResults);

    // Log restaurant search event using the correct Statsig format
    try {
      Statsig.logEvent(
        statsigUser,
        'restaurant_search_completed',
        topResults.length,
        {
          search_query: query,
          city: query.toLowerCase().includes(' in ') ? query.split(' in ')[1] : 'unknown',
          cuisine_type: getCuisineTypeFromQuery(query),
          results_found: topResults.length.toString(),
          cynthias_picks_count: topResults.filter(r => r.cynthias_pick).length.toString(),
          processing_time_ms: apiProcessingTime.toString()
        }
      );
    } catch (statsigLogError) {
      console.error('[Statsig] Error logging event:', statsigLogError);
    }

    return res.status(200).json({
      recommendations: topResults,
      summary: `Curated ${topResults.length} spots just for you`,
      usedClaude: false,
      debug: {
        cynthiaBoost,
        maxResults,
        statsigConfigFetched,
        statsigClientInitialized: statsigInitialized,
        errorMessage: statsigError
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