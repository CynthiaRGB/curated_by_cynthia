// Braintrust evaluation for filterService
// Tests filtering accuracy with enhanced metadata (vibes, occasions, noise, etc.)

import { Eval } from "braintrust";
import { preFilterRestaurants } from "../../api/services/filterService";

// ============================================================================
// TEST CASES
// ============================================================================

const TEST_CASES = [
  // Category 1: Basic Functionality
  {
    input: {
      query: "Italian restaurant"
    },
    expected: {
      mustHave: { hasResults: true }
    },
    metadata: { category: "basic", test: "has_results" }
  },
  
  // Category 2: Location Filtering
  {
    input: {
      query: "restaurant in Brooklyn"
    },
    expected: {
      mustHave: { location: { borough: "brooklyn" } }
    },
    metadata: { category: "location", test: "borough_match" }
  },
  {
    input: {
      query: "restaurant in West Village"
    },
    expected: {
      mustHave: { location: { neighborhood: "west village" } }
    },
    metadata: { category: "location", test: "neighborhood_match" }
  },
  {
    input: {
      query: "restaurant in Tokyo"
    },
    expected: {
      mustHave: { location: { city: "tokyo" } }
    },
    metadata: { category: "location", test: "city_match" }
  },
  
  // Category 3: Cuisine Filtering
  {
    input: {
      query: "Italian restaurant"
    },
    expected: {
      mustHave: { cuisine: "italian" }
    },
    metadata: { category: "cuisine", test: "exact_match" }
  },
  {
    input: {
      query: "Asian restaurant"
    },
    expected: {
      mustHave: {
        cuisine: "asian",
        anyOf: ["japanese", "chinese", "korean", "thai", "vietnamese", "indian"]
      }
    },
    metadata: { category: "cuisine", test: "umbrella_match" }
  },
  {
    input: {
      query: "ramen restaurant"
    },
    expected: {
      mustHave: { cuisine: "ramen" }
    },
    metadata: { category: "cuisine", test: "specific_dish" }
  },
  
  // Category 4: Coffee Focus
  {
    input: {
      query: "coffee shop in Tokyo"
    },
    expected: {
      mustHave: {
        coffeeFocus: true,
        location: { city: "tokyo" }
      }
    },
    metadata: { category: "focus", test: "coffee_strict" }
  },
  
  // Category 5: Dessert Focus
  {
    input: {
      query: "dessert place"
    },
    expected: {
      mustHave: { dessertFocus: true }
    },
    metadata: { category: "focus", test: "dessert_strict" }
  },
  
  // Category 6: Brunch Focus
  {
    input: {
      query: "brunch restaurant"
    },
    expected: {
      mustHave: { brunchFocus: true }
    },
    metadata: { category: "focus", test: "brunch_strict" }
  },
  
  // Category 7: Vibe Filtering
  {
    input: {
      query: "romantic restaurant"
    },
    expected: {
      mustHave: { vibe: "romantic" }
    },
    metadata: { category: "vibe", test: "romantic" }
  },
  {
    input: {
      query: "cozy cafe"
    },
    expected: {
      mustHave: { vibe: "cozy" }
    },
    metadata: { category: "vibe", test: "cozy" }
  },
  
  // Category 8: Occasion Filtering
  {
    input: {
      query: "first date restaurant"
    },
    expected: {
      mustHave: { occasion: "first_date" }
    },
    metadata: { category: "occasion", test: "first_date" }
  },
  {
    input: {
      query: "business lunch restaurant"
    },
    expected: {
      mustHave: { occasion: "business_lunch" }
    },
    metadata: { category: "occasion", test: "business_lunch" }
  },
  
  // Category 9: Multi-Criteria (2 Keywords)
  {
    input: {
      query: "Italian restaurant in Brooklyn"
    },
    expected: {
      mustHave: {
        location: { borough: "brooklyn" },
        cuisine: "italian"
      }
    },
    metadata: { category: "multi_2", test: "location_cuisine" }
  },
  {
    input: {
      query: "ramen in Manhattan"
    },
    expected: {
      mustHave: {
        location: { borough: "manhattan" },
        cuisine: "ramen"
      }
    },
    metadata: { category: "multi_2", test: "location_cuisine" }
  },
  
  // Category 10: Multi-Criteria (3 Keywords)
  {
    input: {
      query: "romantic Italian in Brooklyn"
    },
    expected: {
      mustHave: {
        location: { borough: "brooklyn" },
        cuisine: "italian",
        vibe: "romantic"
      }
    },
    metadata: { category: "multi_3", test: "location_cuisine_vibe" }
  },
  {
    input: {
      query: "cozy cafe in Manhattan"
    },
    expected: {
      mustHave: {
        location: { borough: "manhattan" },
        cuisine: "cafe",
        vibe: "cozy"
      }
    },
    metadata: { category: "multi_3", test: "location_cuisine_vibe" }
  },
  {
    input: {
      query: "business lunch Italian in Manhattan"
    },
    expected: {
      mustHave: {
        location: { borough: "manhattan" },
        cuisine: "italian",
        occasion: "business_lunch"
      }
    },
    metadata: { category: "multi_3", test: "location_cuisine_occasion" }
  },
  
  // Category 11: Price Filtering
  {
    input: {
      query: "cheap Italian restaurant"
    },
    expected: {
      mustHave: {
        cuisine: "italian",
        priceLevel: "budget"
      }
    },
    metadata: { category: "price", test: "budget" }
  }
];

// ============================================================================
// SCORERS
// ============================================================================

/**
 * Scorer 1: Has Results
 * Checks if query returns any results
 */
function scoreHasResults({ input, output, expected }) {
  if (!expected.mustHave?.hasResults) return null;
  
  const hasResults = output.length > 0;
  
  return {
    name: "has_results",
    score: hasResults ? 1 : 0,
    metadata: {
      resultCount: output.length
    }
  };
}

/**
 * Scorer 2: Location Match
 * Checks if ALL results match the expected location
 * This must match the logic in matchesLocation() in filterService.ts
 */
function scoreLocationMatch({ input, output, expected }) {
  if (!expected.mustHave?.location) return null;
  
  const { borough, neighborhood, city } = expected.mustHave.location;
  
  if (output.length === 0) {
    return {
      name: "location_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  // Check if ALL results match location using same logic as matchesLocation()
  const allMatch = output.every(restaurant => {
    let matches = false;
    
    // Check neighborhood match - only check neighborhood_extracted field
    if (neighborhood) {
      const restaurantNeighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
      
      // Handle both single neighborhood and array (for union logic)
      const neighborhoods = Array.isArray(neighborhood) ? neighborhood : [neighborhood];
      
      // Match if restaurant is in ANY of the neighborhoods (union)
      matches = neighborhoods.some(neighborhoodKeyword => {
        const keyword = neighborhoodKeyword.toLowerCase();
        return restaurantNeighborhood.includes(keyword) || keyword.includes(restaurantNeighborhood);
      });
    }
    
    // Check borough match - simplified: only Brooklyn and Manhattan
    if (borough) {
      const boroughKeyword = borough.toLowerCase();
      const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
      
      if (boroughKeyword === 'brooklyn' || boroughKeyword === 'bk') {
        // Brooklyn query: only return if address contains "brooklyn"
        if (address.includes('brooklyn')) {
          matches = true;
        }
      } else if (boroughKeyword === 'manhattan') {
        // Manhattan query: return if address does NOT contain "brooklyn" (meaning it's Manhattan)
        if (!address.includes('brooklyn')) {
          matches = true;
        }
      }
    }
    
    // Check city match - use restaurant.city property if available, otherwise fall back to address parsing
    if (city) {
      const restaurantCity = restaurant.city?.toLowerCase();
      const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
      
      // Map keywords.city to expected city names
      const cityMap: { [key: string]: string[] } = {
        'nyc': ['new york city', 'new york', 'nyc'],
        'tokyo': ['tokyo'],
        'seoul': ['seoul'],
        'paris': ['paris']
      };
      
      const cityKeyword = city.toLowerCase();
      const expectedCities = cityMap[cityKeyword] || [cityKeyword];
      
      // First check restaurant.city property (more reliable)
      if (restaurantCity) {
        for (const expectedCity of expectedCities) {
          if (restaurantCity.includes(expectedCity) || expectedCity.includes(restaurantCity)) {
            matches = true;
            break;
          }
        }
      }
      
      // Fall back to address parsing if restaurant.city didn't match
      if (!matches) {
        switch (cityKeyword) {
          case 'nyc':
            // For NYC queries, show all restaurants (both Manhattan and Brooklyn)
            // Since we only have Manhattan and Brooklyn data, any NYC address matches
            if (address.includes('new york') || address.includes('nyc') || address.includes('brooklyn')) {
              matches = true;
            }
            break;
          case 'tokyo':
            if (address.includes('tokyo') || address.includes('japan')) {
              matches = true;
            }
            break;
          case 'seoul':
            if (address.includes('seoul') || address.includes('korea')) {
              matches = true;
            }
            break;
          case 'paris':
            if (address.includes('paris') || address.includes('france')) {
              matches = true;
            }
            break;
        }
      }
    }
    
    return matches;
  });
  
  return {
    name: "location_match",
    score: allMatch ? 1 : 0,
    metadata: {
      totalResults: output.length,
      expectedLocation: borough || neighborhood || city,
      allMatch
    }
  };
}

/**
 * Scorer 3: Cuisine Match
 * Checks if results match the expected cuisine (70%+ threshold)
 * This must match the logic in matchesCuisine() in filterService.ts
 */
function scoreCuisineMatch({ input, output, expected }) {
  if (!expected.mustHave?.cuisine) return null;
  
  const expectedCuisine = expected.mustHave.cuisine.toLowerCase();
  const anyOf = expected.mustHave.anyOf?.map(c => c.toLowerCase()) || [];
  
  if (output.length === 0) {
    return {
      name: "cuisine_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  // Normalize accents and handle plural/singular variations for matching
  // e.g., "crepes" should match "crepe", "crêpe", "crêperie"
  const normalizeForMatching = (text: string): string => {
    return text
      .normalize('NFD') // Decompose characters with diacritics
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/s$/, ''); // Remove trailing 's' for plural handling
  };
  
  const normalizedCuisineKeyword = normalizeForMatching(expectedCuisine);
  
  // Asian cuisines that should match when user searches for "asian"
  // Must match ASIAN_CUISINES array in filterService.ts exactly
  const ASIAN_CUISINES = [
    'japanese', 'chinese', 'korean', 'thai', 'vietnamese', 'indian',
    'ramen', 'sushi', 'sashimi', 'dim sum', 'dimsum', 'hot pot', 
    'szechuan', 'peking duck', 'pho', 'vermicelli', 'pad thai',
    'yakitori', 'katsu', 'tonkatsu', 'tempura', 'udon', 'soba',
    'okonomiyaki', 'curry', 'onigiri', 'takoyaki', 'teriyaki',
    'sukiyaki', 'shabu shabu', 'shabushabu', 'kaiseki', 'omurice'
  ];
  
  // Count matches using the same logic as matchesCuisine()
  const matchCount = output.filter(restaurant => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const specificType = restaurant.specific_type?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map(t => t.toLowerCase()) || [];
    const restaurantName = restaurant.google_data?.displayName?.text?.toLowerCase() || '';
    const summary = restaurant.google_data?.generativeSummary?.overview?.text?.toLowerCase() || '';
    const reviewSummary = restaurant.google_data?.reviewSummary?.text?.text?.toLowerCase() || '';
    const editorialSummary = restaurant.google_data?.editorialSummary?.text?.toLowerCase() || '';
    
    // For Asian umbrella, check if it's any Asian cuisine (matches anyOf logic)
    if (anyOf.length > 0 || expectedCuisine === 'asian') {
      const cuisinesToCheck = anyOf.length > 0 ? anyOf : ASIAN_CUISINES;
      return cuisinesToCheck.some(cuisine => {
        const normalizedCuisine = normalizeForMatching(cuisine);
        return primaryType.includes(cuisine) ||
               specificType.includes(cuisine) ||
               types.some(t => t.includes(cuisine)) ||
               normalizeForMatching(primaryType).includes(normalizedCuisine) ||
               normalizeForMatching(specificType).includes(normalizedCuisine) ||
               types.some(t => normalizeForMatching(t).includes(normalizedCuisine)) ||
               restaurantName.includes(cuisine) ||
               normalizeForMatching(restaurantName).includes(normalizedCuisine) ||
               summary.includes(cuisine) ||
               reviewSummary.includes(cuisine) ||
               editorialSummary.includes(cuisine) ||
               normalizeForMatching(summary).includes(normalizedCuisine) ||
               normalizeForMatching(reviewSummary).includes(normalizedCuisine) ||
               normalizeForMatching(editorialSummary).includes(normalizedCuisine);
      });
    }
    
    // Special handling for "bar" - strict metadata-only matching
    if (expectedCuisine === 'bar') {
      return primaryType === 'bar' || 
             primaryType === 'night_club' || 
             specificType === 'bar';
    }
    
    // Special handling for coffee/cafe - strict metadata-only matching
    if (expectedCuisine === 'coffee shop' || expectedCuisine === 'coffee' || expectedCuisine === 'cafe') {
      const hasCoffeePrimaryType = primaryType === 'coffee_shop' || primaryType === 'cafe';
      const hasCoffeeInTypes = types.some(t => 
        t === 'coffee_shop' || 
        t === 'cafe' || 
        t.toLowerCase() === 'coffee_shop' || 
        t.toLowerCase() === 'cafe'
      );
      return hasCoffeePrimaryType || hasCoffeeInTypes;
    }
    
    // Special handling for dessert - strict metadata-only matching
    if (['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets'].includes(expectedCuisine)) {
      const hasDessertPrimaryType = primaryType === 'bakery' || 
                                     primaryType === 'dessert_shop' || 
                                     primaryType === 'ice_cream_shop' ||
                                     primaryType === 'pastry_shop' ||
                                     primaryType === 'confectionery' ||
                                     primaryType === 'dessert_restaurant';
      const hasDessertInTypes = types.some(t => 
        t === 'bakery' || 
        t === 'dessert_shop' || 
        t === 'ice_cream_shop' ||
        t === 'pastry_shop' ||
        t === 'confectionery' ||
        t === 'dessert_restaurant' ||
        t.toLowerCase() === 'bakery' ||
        t.toLowerCase() === 'dessert_shop' ||
        t.toLowerCase() === 'ice_cream_shop' ||
        t.toLowerCase() === 'pastry_shop' ||
        t.toLowerCase() === 'confectionery' ||
        t.toLowerCase() === 'dessert_restaurant'
      );
      return hasDessertPrimaryType || hasDessertInTypes;
    }
    
    // Check restaurant name for dish-specific keywords (e.g., "yakitori", "katsu")
    // This is important because dish-specific restaurants often have the dish in their name
    // but their type might just be "japanese_restaurant"
    if (restaurantName.includes(expectedCuisine) || 
        normalizeForMatching(restaurantName).includes(normalizedCuisineKeyword)) {
      return true;
    }
    
    // Check restaurant summary/description for mentions (helps with dish-specific searches)
    if (summary.includes(expectedCuisine) || 
        reviewSummary.includes(expectedCuisine) || 
        editorialSummary.includes(expectedCuisine) ||
        normalizeForMatching(summary).includes(normalizedCuisineKeyword) ||
        normalizeForMatching(reviewSummary).includes(normalizedCuisineKeyword) ||
        normalizeForMatching(editorialSummary).includes(normalizedCuisineKeyword)) {
      return true;
    }
    
    // Standard type matching (also check normalized versions)
    return specificType.includes(expectedCuisine) ||
           primaryType.includes(expectedCuisine) ||
           types.some(t => t.includes(expectedCuisine)) ||
           normalizeForMatching(specificType).includes(normalizedCuisineKeyword) ||
           normalizeForMatching(primaryType).includes(normalizedCuisineKeyword) ||
           types.some(t => normalizeForMatching(t).includes(normalizedCuisineKeyword));
  }).length;
  
  const cuisineRate = matchCount / output.length;
  
  return {
    name: "cuisine_match",
    score: cuisineRate >= 0.7 ? 1 : 0,
    metadata: {
      cuisineRate,
      matchCount,
      totalResults: output.length,
      expectedCuisine,
      threshold: 0.7
    }
  };
}

/**
 * Scorer 4: Coffee Focus
 * Checks if results are primarily cafes/coffee shops (80%+ threshold)
 * This must match the strict metadata-only matching logic in matchesCuisine() in filterService.ts
 */
function scoreCoffeeFocus({ input, output, expected }) {
  if (!expected.mustHave?.coffeeFocus) return null;
  
  if (output.length === 0) {
    return {
      name: "coffee_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const cafeCount = output.filter(restaurant => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map(t => t.toLowerCase()) || [];
    
    // Strict metadata-only matching (no name matching to avoid false positives)
    // Must have 'coffee_shop' or 'cafe' in either primaryType OR types array
    const hasCoffeePrimaryType = primaryType === 'coffee_shop' || primaryType === 'cafe';
    const hasCoffeeInTypes = types.some(t => 
      t === 'coffee_shop' || 
      t === 'cafe' || 
      t.toLowerCase() === 'coffee_shop' || 
      t.toLowerCase() === 'cafe'
    );
    
    return hasCoffeePrimaryType || hasCoffeeInTypes;
  }).length;
  
  const cafeRate = cafeCount / output.length;
  
  return {
    name: "coffee_focus",
    score: cafeRate >= 0.8 ? 1 : 0,
    metadata: {
      cafeRate,
      cafeCount,
      totalResults: output.length,
      threshold: 0.8
    }
  };
}

/**
 * Scorer 5: Dessert Focus
 * Checks if results serve dessert or are dessert-focused (80%+ threshold)
 * This must match the strict metadata-only matching logic in matchesCuisine() in filterService.ts
 */
function scoreDessertFocus({ input, output, expected }) {
  if (!expected.mustHave?.dessertFocus) return null;
  
  if (output.length === 0) {
    return {
      name: "dessert_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const dessertCount = output.filter(restaurant => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map(t => t.toLowerCase()) || [];
    
    // Strict metadata-only matching (no name matching to avoid false positives)
    // Must have dessert-related type in either primaryType OR types array
    const hasDessertPrimaryType = primaryType === 'bakery' || 
                                   primaryType === 'dessert_shop' || 
                                   primaryType === 'ice_cream_shop' ||
                                   primaryType === 'pastry_shop' ||
                                   primaryType === 'confectionery' ||
                                   primaryType === 'dessert_restaurant';
    const hasDessertInTypes = types.some(t => 
      t === 'bakery' || 
      t === 'dessert_shop' || 
      t === 'ice_cream_shop' ||
      t === 'pastry_shop' ||
      t === 'confectionery' ||
      t === 'dessert_restaurant' ||
      t.toLowerCase() === 'bakery' ||
      t.toLowerCase() === 'dessert_shop' ||
      t.toLowerCase() === 'ice_cream_shop' ||
      t.toLowerCase() === 'pastry_shop' ||
      t.toLowerCase() === 'confectionery' ||
      t.toLowerCase() === 'dessert_restaurant'
    );
    
    return hasDessertPrimaryType || hasDessertInTypes;
  }).length;
  
  const dessertRate = dessertCount / output.length;
  
  return {
    name: "dessert_focus",
    score: dessertRate >= 0.8 ? 1 : 0,
    metadata: {
      dessertRate,
      dessertCount,
      totalResults: output.length,
      threshold: 0.8
    }
  };
}

/**
 * Scorer 6: Brunch Focus
 * Checks if results are brunch-focused (70%+ threshold)
 * This must match the logic in matchesMealType() in filterService.ts for brunch queries
 */
function scoreBrunchFocus({ input, output, expected }) {
  if (!expected.mustHave?.brunchFocus) return null;
  
  if (output.length === 0) {
    return {
      name: "brunch_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const brunchCount = output.filter(restaurant => {
    // Basic check: restaurant must serve brunch
    if (!restaurant.google_data?.servesBrunch) {
      return false;
    }
    
    // Strict brunch filtering (prioritize metadata fields, then fallback)
    
    // Primary criteria: Check metadata indicators (most reliable)
    const types = restaurant.google_data?.types?.map(t => t.toLowerCase()) || [];
    const hasBrunchRestaurantType = types.includes('brunch_restaurant');
    const occasionTags = restaurant.occasion_tags || [];
    const hasWeekendBrunchTag = occasionTags.includes('weekend_brunch');
    
    // If primary criteria met, include immediately
    if (hasBrunchRestaurantType || hasWeekendBrunchTag) {
      return true;
    }
    
    // Fallback criteria: Check brunch hours and mentions (less weight)
    const googleData = restaurant.google_data as any; // Type assertion needed for secondary hours
    const hasBrunchHours = googleData.currentSecondaryOpeningHours?.some(
      (hours: any) => hours.secondaryHoursType === 'BRUNCH'
    ) || googleData.secondaryOpeningHours?.some(
      (hours: any) => hours.secondaryHoursType === 'BRUNCH'
    );
    
    const restaurantName = restaurant.google_data?.displayName?.text?.toLowerCase() || '';
    const summary = restaurant.google_data?.generativeSummary?.overview?.text?.toLowerCase() || '';
    const reviewSummary = restaurant.google_data?.reviewSummary?.text?.text?.toLowerCase() || '';
    const editorialSummary = restaurant.google_data?.editorialSummary?.text?.toLowerCase() || '';
    
    const mentionsBrunch = restaurantName.includes('brunch') ||
                          summary.includes('brunch') ||
                          reviewSummary.includes('brunch') ||
                          editorialSummary.includes('brunch');
    
    // If fallback criteria met, include
    if (hasBrunchHours || mentionsBrunch) {
      return true;
    }
    
    // If none of the criteria are met, exclude (not a brunch-focused restaurant)
    return false;
  }).length;
  
  const brunchRate = brunchCount / output.length;
  
  return {
    name: "brunch_focus",
    score: brunchRate >= 0.7 ? 1 : 0,
    metadata: {
      brunchRate,
      brunchCount,
      totalResults: output.length,
      threshold: 0.7
    }
  };
}

/**
 * Scorer 7: Vibe Match
 * Checks if results match expected vibe (70%+ threshold)
 */
function scoreVibeMatch({ input, output, expected }) {
  if (!expected.mustHave?.vibe) return null;
  
  const expectedVibe = expected.mustHave.vibe.toLowerCase();
  
  if (output.length === 0) {
    return {
      name: "vibe_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const vibeCount = output.filter(restaurant => {
    const vibeTags = restaurant.vibe_tags || [];
    return vibeTags.includes(expectedVibe);
  }).length;
  
  const vibeRate = vibeCount / output.length;
  
  return {
    name: "vibe_match",
    score: vibeRate >= 0.7 ? 1 : 0,
    metadata: {
      vibeRate,
      vibeCount,
      totalResults: output.length,
      expectedVibe,
      threshold: 0.7
    }
  };
}

/**
 * Scorer 8: Occasion Match
 * Checks if results match expected occasion (70%+ threshold)
 */
function scoreOccasionMatch({ input, output, expected }) {
  if (!expected.mustHave?.occasion) return null;
  
  const expectedOccasion = expected.mustHave.occasion;
  
  if (output.length === 0) {
    return {
      name: "occasion_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const occasionCount = output.filter(restaurant => {
    const occasionTags = restaurant.occasion_tags || [];
    return occasionTags.includes(expectedOccasion);
  }).length;
  
  const occasionRate = occasionCount / output.length;
  
  return {
    name: "occasion_match",
    score: occasionRate >= 0.7 ? 1 : 0,
    metadata: {
      occasionRate,
      occasionCount,
      totalResults: output.length,
      expectedOccasion,
      threshold: 0.7
    }
  };
}

/**
 * Scorer 9: Price Match
 * Checks if results match expected price level (70%+ threshold)
 */
function scorePriceMatch({ input, output, expected }) {
  if (!expected.mustHave?.priceLevel) return null;
  
  const expectedPrice = expected.mustHave.priceLevel;
  
  if (output.length === 0) {
    return {
      name: "price_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const priceCount = output.filter(restaurant => {
    const priceDisplay = restaurant.price_display;
    
    if (!priceDisplay || priceDisplay === 'N/A') {
      return expectedPrice !== 'budget';
    }
    
    switch (expectedPrice) {
      case 'budget':
        return priceDisplay === '$' || priceDisplay === '$$';
      case 'moderate':
        return priceDisplay === '$$' || priceDisplay === '$$$';
      case 'upscale':
        return priceDisplay === '$$$' || priceDisplay === '$$$$';
      default:
        return true;
    }
  }).length;
  
  const priceRate = priceCount / output.length;
  
  return {
    name: "price_match",
    score: priceRate >= 0.7 ? 1 : 0,
    metadata: {
      priceRate,
      priceCount,
      totalResults: output.length,
      expectedPrice,
      threshold: 0.7
    }
  };
}

// ============================================================================
// EVAL CONFIGURATION
// ============================================================================

Eval("filterService-quality", {
  projectName: "curated-by-cynthia",
  data: TEST_CASES,
  
  task: async (input) => {
    // Call filterService with the query
    const results = preFilterRestaurants(input.query);
    return results;
  },
  
  scores: [
    scoreHasResults,
    scoreLocationMatch,
    scoreCuisineMatch,
    scoreCoffeeFocus,
    scoreDessertFocus,
    scoreBrunchFocus,
    scoreVibeMatch,
    scoreOccasionMatch,
    scorePriceMatch
  ],
  
  trialCount: 1, // Run each test once (deterministic filtering)
  
  metadata: {
    description: "FilterService quality evaluation with enhanced metadata",
    version: "2.0",
    testCount: TEST_CASES.length,
    focus: "Accuracy over count - all results must be correct"
  }
});