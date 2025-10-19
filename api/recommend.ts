import type { VercelRequest, VercelResponse } from '@vercel/node';
import Statsig from "statsig-node";

// Initialize Statsig server-side client
let statsigInitialized = false;

const initializeStatsig = async () => {
  if (!statsigInitialized) {
    await Statsig.initialize(
      "secret-DbvINwRbZkGrethf1bSYq5ZZ12htEQFj5hBiKyT71QY",
      { environment: { tier: "production" } }
    );
    statsigInitialized = true;
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

    // Load restaurant data from local enriched file
    const fs = require('fs');
    const path = require('path');
    
    console.log(`[API] Loading enriched restaurant data from local file`);
    
    let restaurants;
    try {
      const filePath = path.join(process.cwd(), 'api', 'data', '285_restaurants_enriched.json');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const restaurantData = JSON.parse(fileContent);
      restaurants = restaurantData.places || restaurantData; // Handle both array and object formats
      console.log(`[API] Loaded ${restaurants.length} restaurants from blob storage`);
    } catch (error) {
      console.error('[API] Failed to load from blob, using fallback data:', error);
      
      // Fallback to embedded data if blob fails
      restaurants = [
        {
          google_data: {
            displayName: { text: "Don Angie" },
            rating: 4.5,
            userRatingCount: 1200,
            primaryType: "restaurant",
            types: ["restaurant", "italian"]
          },
          original_place: {
            properties: {
              location: {
                address: "103 Greenwich Ave, New York, NY 10014, USA",
                country_code: "US"
              }
            },
            geometry: {
              coordinates: [-74.0014, 40.7379] as [number, number],
              type: "Point" as const
            },
            type: "Feature" as const
          },
          neighborhood_extracted: "West Village",
          specific_type: "italian",
          place_classification: "restaurant",
          enrichment_status: "success",
          enrichment_date: "2024-01-01T00:00:00Z",
          cynthias_pick: true,
          price_display: "$$$",
          city: "New York City"
        },
        {
          google_data: {
            displayName: { text: "L'Artusi" },
            rating: 4.4,
            userRatingCount: 800,
            primaryType: "restaurant",
            types: ["restaurant", "italian"]
          },
          original_place: {
            properties: {
              location: {
                address: "228 W 10th St, New York, NY 10014, USA",
                country_code: "US"
              }
            },
            geometry: {
              coordinates: [-74.0014, 40.7379] as [number, number],
              type: "Point" as const
            },
            type: "Feature" as const
          },
          neighborhood_extracted: "West Village",
          specific_type: "italian",
          place_classification: "restaurant",
          enrichment_status: "success",
          enrichment_date: "2024-01-01T00:00:00Z",
          cynthias_pick: true,
          price_display: "$$$",
          city: "New York City"
        },
        {
          google_data: {
            displayName: { text: "Blue Bottle Coffee" },
            rating: 4.2,
            userRatingCount: 400,
            primaryType: "cafe",
            types: ["cafe", "coffee_shop"],
            servesCoffee: true
          },
          original_place: {
            properties: {
              location: {
                address: "54 Mint St, New York, NY 10013, USA",
                country_code: "US"
              }
            },
            geometry: {
              coordinates: [-74.0014, 40.7379] as [number, number],
              type: "Point" as const
            },
            type: "Feature" as const
          },
          neighborhood_extracted: "SoHo",
          specific_type: "cafe",
          place_classification: "restaurant",
          enrichment_status: "success",
          enrichment_date: "2024-01-01T00:00:00Z",
          cynthias_pick: true,
          price_display: "$$",
          city: "New York City"
        }
      ];
      console.log(`[API] Using fallback data with ${restaurants.length} restaurants`);
    }

    // Enhanced filtering logic with tiered ranking
    const lowerQuery = query.toLowerCase();
    
    // Extract city from query
    let targetCity = null;
    if (lowerQuery.includes('new york') || lowerQuery.includes('nyc') || lowerQuery.includes('manhattan') || lowerQuery.includes('brooklyn')) {
      targetCity = 'New York City';
    } else if (lowerQuery.includes('paris')) {
      targetCity = 'Paris';
    } else if (lowerQuery.includes('seoul')) {
      targetCity = 'Seoul';
    } else if (lowerQuery.includes('tokyo') || lowerQuery.includes('shibuya')) {
      targetCity = 'Tokyo';
    }
    
    console.log(`[API] Detected target city: ${targetCity}`);
    
    // Helper function to check if restaurant matches city
    const matchesCity = (restaurant) => {
      if (!targetCity) return true;
      if (targetCity === 'Tokyo') {
        // Include all Tokyo districts and Shibuya
        return restaurant.google_data?.postalAddress?.administrativeArea === 'Tokyo' || 
               restaurant.city === 'Shibuya' ||
               (restaurant.city && restaurant.city.includes('City') && restaurant.city !== 'New York City');
      } else {
        return restaurant.city === targetCity;
      }
    };
    
    // Helper function to calculate quality score
    const calculateQualityScore = (restaurant) => {
      const rating = restaurant.google_data?.rating || 0;
      const reviewCount = restaurant.google_data?.userRatingCount || 0;
      const baseScore = rating * Math.log(Math.max(reviewCount, 1));
      
      // Apply Cynthia's boost from Statsig config
      if (restaurant.cynthias_pick) {
        return baseScore * cynthiaBoost;  // Use variable instead of hardcoded 1.5
      }
      return baseScore;
    };
    
    // Helper function to check if restaurant matches cuisine type
    const matchesCuisineType = (restaurant, cuisineType) => {
      const primaryType = restaurant.google_data?.primaryType?.toLowerCase();
      const specificType = restaurant.specific_type?.toLowerCase();
      const types = restaurant.google_data?.types || [];
      
      // Tier 1: Primary type match (highest priority)
      if (primaryType === cuisineType || specificType === cuisineType) {
        return { tier: 1, matches: true };
      }
      
      // Tier 2: Types array match (medium priority)
      const filteredTypes = types.filter(type => 
        !['establishment', 'point_of_interest', 'store', 'food'].includes(type.toLowerCase())
      );
      if (filteredTypes.some(type => type.toLowerCase().includes(cuisineType))) {
        return { tier: 2, matches: true };
      }
      
      return { tier: 0, matches: false };
    };
    
    // Determine cuisine type from query
    let cuisineType = null;
    if (lowerQuery.includes('coffee') || lowerQuery.includes('cafe')) {
      cuisineType = 'cafe';
    } else if (lowerQuery.includes('italian')) {
      cuisineType = 'italian';
    } else if (lowerQuery.includes('sushi') || lowerQuery.includes('japanese')) {
      cuisineType = 'japanese';
    } else if (lowerQuery.includes('chinese')) {
      cuisineType = 'chinese';
    } else if (lowerQuery.includes('korean')) {
      cuisineType = 'korean';
    } else if (lowerQuery.includes('french')) {
      cuisineType = 'french';
    } else if (lowerQuery.includes('mexican')) {
      cuisineType = 'mexican';
    } else if (lowerQuery.includes('thai')) {
      cuisineType = 'thai';
    } else if (lowerQuery.includes('indian')) {
      cuisineType = 'indian';
    } else if (lowerQuery.includes('pizza')) {
      cuisineType = 'pizza';
    } else if (lowerQuery.includes('burger')) {
      cuisineType = 'burger';
    } else if (lowerQuery.includes('steak')) {
      cuisineType = 'steak';
    } else if (lowerQuery.includes('seafood')) {
      cuisineType = 'seafood';
    }
    
    console.log(`[API] Detected cuisine type: ${cuisineType}`);
    
    let filteredRestaurants = [];
    
    // Check for "Cynthia's favorites" - special case
    if (lowerQuery.includes("cynthia's favorites") || lowerQuery.includes("cynthias favorites")) {
      filteredRestaurants = restaurants.filter(r => {
        const isCynthiasPick = r.cynthias_pick === true;
        return isCynthiasPick && matchesCity(r);
      });
      console.log(`[API] Filtered to ${filteredRestaurants.length} Cynthia's picks in ${targetCity || 'all cities'}`);
    }
    // Apply tiered ranking for cuisine-based queries
    else if (cuisineType) {
      const tier1Matches = [];
      const tier2Matches = [];
      
      restaurants.forEach(restaurant => {
        if (!matchesCity(restaurant)) return;
        
        const matchResult = matchesCuisineType(restaurant, cuisineType);
        if (matchResult.matches) {
          const qualityScore = calculateQualityScore(restaurant);
          const restaurantWithScore = { ...restaurant, qualityScore };
          
          if (matchResult.tier === 1) {
            tier1Matches.push(restaurantWithScore);
          } else if (matchResult.tier === 2) {
            tier2Matches.push(restaurantWithScore);
          }
        }
      });
      
      // Sort each tier by quality score (descending)
      tier1Matches.sort((a, b) => b.qualityScore - a.qualityScore);
      tier2Matches.sort((a, b) => b.qualityScore - a.qualityScore);
      
      // Combine tiers: Tier 1 first, then Tier 2
      filteredRestaurants = [...tier1Matches, ...tier2Matches];
      
      console.log(`[API] Tier 1 matches: ${tier1Matches.length}, Tier 2 matches: ${tier2Matches.length}`);
      console.log(`[API] Total filtered to ${filteredRestaurants.length} ${cuisineType} restaurants in ${targetCity || 'all cities'}`);
    }
    // If no specific cuisine filter, just filter by city if specified
    else if (targetCity) {
      filteredRestaurants = restaurants.filter(matchesCity);
      console.log(`[API] Filtered to ${filteredRestaurants.length} restaurants in ${targetCity}`);
    }
    // If no filters at all, return all restaurants
    else {
      filteredRestaurants = restaurants;
      console.log(`[API] No filters applied, returning all ${filteredRestaurants.length} restaurants`);
    }

    console.log(`[API] Final filtered to ${filteredRestaurants.length} matches`);

    // Log server-side API performance event
    const apiProcessingTime = Date.now() - apiStartTime;
    // Temporarily disabled Statsig logging
    // statsigClient.logEvent('api_request_completed', statsigUser, {
    //   query: query,
    //   results_count: filteredRestaurants.length.toString(),
    //   processing_time_ms: apiProcessingTime.toString(),
    //   has_results: (filteredRestaurants.length > 0).toString(),
    //   timestamp: new Date().toISOString()
    // });

    if (filteredRestaurants.length === 0) {
      // Log no results event
      // Temporarily disabled Statsig logging
      // statsigClient.logEvent('api_no_results', statsigUser, {
      //   query: query,
      //   processing_time_ms: apiProcessingTime.toString(),
      //   timestamp: new Date().toISOString()
      // });

      return res.status(200).json({
        recommendations: [],
        summary: "No spots found matching your criteria. Try a different search!",
        usedClaude: false,
      });
    }

    // Return top results based on Statsig config
    const topResults = filteredRestaurants.slice(0, maxResults);  // Use variable instead of hardcoded 10

    // Log successful API response
    // Temporarily disabled Statsig logging
    // statsigClient.logEvent('api_success', statsigUser, {
    //   query: query,
    //   results_returned: topResults.length.toString(),
    //   total_matches: filteredRestaurants.length.toString(),
    //   processing_time_ms: apiProcessingTime.toString(),
    //   timestamp: new Date().toISOString()
    // });

    // Log restaurant search event using the correct Statsig format
    // Temporarily disabled Statsig logging
    // statsigClient.logEvent(
    //   statsigUser,
    //   "restaurant_search_completed",
    //   topResults.length,
    //   {
    //     search_query: query,
    //     city: query.toLowerCase().includes(' in ') ? query.split(' in ')[1] : 'unknown',
    //     cuisine_type: getCuisineTypeFromQuery(query),
    //     results_found: topResults.length.toString(),
    //     cynthias_picks_count: topResults.filter(r => r.cynthias_pick).length.toString(),
    //     processing_time_ms: apiProcessingTime.toString()
    //   }
    // );

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
    // Temporarily disabled Statsig logging
    // try {
    //   const statsigClient = await initializeStatsig();
    //   const errorUser = { userID: 'api-user', customIDs: {}, custom: {}, privateAttributes: {}, email: undefined, ip: undefined, userAgent: undefined, country: undefined, locale: undefined, appVersion: undefined };
    //   statsigClient.logEvent('api_error', errorUser, {
    //     error_message: error.message || 'Unknown error',
    //     error_type: error.name || 'Error',
    //     timestamp: new Date().toISOString()
    //   });
    // } catch (statsigError) {
    //   console.error('[API] Failed to log error to Statsig:', statsigError);
    // }
    
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}