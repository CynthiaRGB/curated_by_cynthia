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
  
  // Check if ALL results match location
  const allMatch = output.every(restaurant => {
    // Check borough
    if (borough) {
      const addressComponents = restaurant.google_data?.addressComponents || [];
      const boroughComponent = addressComponents.find(comp =>
        comp.types?.includes('sublocality_level_1') ||
        comp.types?.includes('sublocality')
      );
      const restaurantBorough = boroughComponent?.longText?.toLowerCase() || '';
      return restaurantBorough.includes(borough.toLowerCase());
    }
    
    // Check neighborhood
    if (neighborhood) {
      const restaurantNeighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
      const address = restaurant.google_data?.formattedAddress?.toLowerCase() || '';
      return restaurantNeighborhood.includes(neighborhood.toLowerCase()) ||
             address.includes(neighborhood.toLowerCase());
    }
    
    // Check city
    if (city) {
      const restaurantCity = restaurant.city?.toLowerCase() || '';
      return restaurantCity === city.toLowerCase();
    }
    
    return true;
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
  
  // Count matches
  const matchCount = output.filter(restaurant => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const specificType = restaurant.specific_type?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map(t => t.toLowerCase()) || [];
    
    // For Asian umbrella, check if it's any Asian cuisine
    if (anyOf.length > 0) {
      return anyOf.some(cuisine =>
        primaryType.includes(cuisine) ||
        specificType.includes(cuisine) ||
        types.some(t => t.includes(cuisine))
      );
    }
    
    // For specific cuisine, check exact match
    return primaryType.includes(expectedCuisine) ||
           specificType.includes(expectedCuisine) ||
           types.some(t => t.includes(expectedCuisine));
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
    return primaryType === 'cafe' ||
           primaryType === 'coffee_shop' ||
           primaryType.includes('cafe');
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
    const servesDessert = restaurant.google_data?.servesDessert;
    
    return primaryType.includes('bakery') ||
           primaryType.includes('dessert') ||
           primaryType.includes('pastry') ||
           types.some(t => t.includes('bakery') || t.includes('dessert')) ||
           servesDessert === true;
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
    const name = restaurant.google_data?.displayName?.text?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map(t => t.toLowerCase()) || [];
    const occasionTags = restaurant.occasion_tags || [];
    const servesBrunch = restaurant.google_data?.servesBrunch;
    
    const hasBrunchType = types.includes('brunch_restaurant');
    const hasBrunchTag = occasionTags.includes('weekend_brunch');
    const nameIncludesBrunch = name.includes('brunch');
    
    return (hasBrunchType || hasBrunchTag || nameIncludesBrunch) && servesBrunch;
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