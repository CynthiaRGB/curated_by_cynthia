// Braintrust evaluation for filterService (v2)
// Tests filtering accuracy using keywords from golden dataset
// Uses expected keywords from test_query_parser.ts golden dataset

import { Eval } from "braintrust";
import { preFilterRestaurants } from "../../api/services/filterService";
import { ExtractedKeywords } from "../../src/types/restaurant";
import goldenQueries from "./golden_queries_clean.json";

// ============================================================================
// TRANSFORM GOLDEN DATASET
// ============================================================================

/**
 * Normalize price level from numeric (1,2,3,4) to string ("budget", "moderate", "upscale")
 * Golden dataset uses numbers, but filterService expects strings
 */
function normalizePriceLevel(value: any): string | undefined {
  if (typeof value === 'number') {
    const priceMap: { [key: number]: string } = {
      1: 'budget',
      2: 'moderate',
      3: 'upscale',
      4: 'upscale' // 4 is also upscale (very expensive)
    };
    return priceMap[value];
  }
  if (typeof value === 'string') {
    // Already a string, return as-is
    return value;
  }
  return undefined;
}

/**
 * Transform golden dataset to filterService eval format
 * Extracts expected keywords and uses them for filtering
 */
function transformGoldenDataset() {
  return goldenQueries.map((testCase: any) => {
    const keywords = { ...testCase.expected } as any;
    
    // Normalize price level from number to string
    if (keywords.priceLevel !== undefined) {
      keywords.priceLevel = normalizePriceLevel(keywords.priceLevel);
    }
    
    return {
      input: {
        query: testCase.input.query, // Keep for logging
        keywords: keywords as ExtractedKeywords, // Use expected keywords from golden dataset
        city: testCase.input.city // Keep for reference
      },
      expected: {}, // Empty - scorers read from input.keywords
      metadata: {
        ...testCase.metadata,
        originalQuery: testCase.input.query,
        hasContext: !!testCase.input.context // Track if this is a follow-up
      }
    };
  });
}

// ============================================================================
// SCORERS
// ============================================================================

/**
 * Scorer 1: Has Results
 * Checks if query returns any results
 */
function scoreHasResults({ input, output, expected }: any) {
  if (output.length === 0) {
    return {
      name: "has_results",
      score: 0,
      metadata: { resultCount: 0 }
    };
  }
  
  return {
    name: "has_results",
    score: 1,
    metadata: { resultCount: output.length }
  };
}

/**
 * Scorer 2: Location Match
 * Checks if ALL results match the expected location (100% threshold)
 */
function scoreLocationMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.borough && !keywords.neighborhood && !keywords.city) {
    return null; // Skip if no location keywords
  }
  
  if (output.length === 0) {
    return {
      name: "location_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const borough = keywords.borough;
  const neighborhood = keywords.neighborhood;
  const city = keywords.city;
  
  // Check if ALL results match location using same logic as matchesLocation()
  const allMatch = output.every((restaurant: any) => {
    let matches = false;
    
    // Check neighborhood match
    if (neighborhood) {
      const restaurantNeighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
      const neighborhoods = Array.isArray(neighborhood) ? neighborhood : [neighborhood];
      
      matches = neighborhoods.some((neighborhoodKeyword: string) => {
        const keyword = neighborhoodKeyword.toLowerCase();
        return restaurantNeighborhood.includes(keyword) || keyword.includes(restaurantNeighborhood);
      });
      
      if (matches) return true; // Neighborhood takes precedence
    }
    
    // Check borough match
    if (borough) {
      const boroughKeyword = borough.toLowerCase();
      const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
      
      if (boroughKeyword === 'brooklyn' || boroughKeyword === 'bk') {
        matches = address.includes('brooklyn');
      } else if (boroughKeyword === 'manhattan') {
        matches = !address.includes('brooklyn');
      }
    }
    
    // Check city match
    if (city) {
      const restaurantCity = restaurant.city?.toLowerCase();
      const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
      
      const cityMap: { [key: string]: string[] } = {
        'nyc': ['new york city', 'new york', 'nyc'],
        'tokyo': ['tokyo'],
        'seoul': ['seoul'],
        'paris': ['paris']
      };
      
      const cityKeyword = city.toLowerCase();
      const expectedCities = cityMap[cityKeyword] || [cityKeyword];
      
      if (restaurantCity) {
        for (const expectedCity of expectedCities) {
          if (restaurantCity.includes(expectedCity) || expectedCity.includes(restaurantCity)) {
            matches = true;
            break;
          }
        }
      }
      
      if (!matches) {
        switch (cityKeyword) {
          case 'nyc':
            matches = address.includes('new york') || address.includes('nyc') || address.includes('brooklyn');
            break;
          case 'tokyo':
            matches = address.includes('tokyo') || address.includes('japan');
            break;
          case 'seoul':
            matches = address.includes('seoul') || address.includes('korea');
            break;
          case 'paris':
            matches = address.includes('paris') || address.includes('france');
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
 * Checks if results match the expected cuisine (85% threshold for fuzzy matching)
 */
function scoreCuisineMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.cuisineType && !keywords.cuisineSpecialty) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "cuisine_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedCuisine = keywords.cuisineType?.toLowerCase() || '';
  
  // Normalize accents and handle plural/singular variations
  const normalizeForMatching = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/s$/, '');
  };
  
  const normalizedCuisineKeyword = normalizeForMatching(expectedCuisine);
  
  // Asian cuisines that should match when user searches for "asian"
  const ASIAN_CUISINES = [
    'japanese', 'chinese', 'korean', 'thai', 'vietnamese', 'indian',
    'ramen', 'sushi', 'sashimi', 'dim sum', 'dimsum', 'hot pot', 
    'szechuan', 'peking duck', 'pho', 'vermicelli', 'pad thai',
    'yakitori', 'katsu', 'tonkatsu', 'tempura', 'udon', 'soba',
    'okonomiyaki', 'curry', 'onigiri', 'takoyaki', 'teriyaki',
    'sukiyaki', 'shabu shabu', 'shabushabu', 'kaiseki', 'omurice'
  ];
  
  // Count matches using the same logic as matchesCuisine()
  const matchCount = output.filter((restaurant: any) => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const specificType = restaurant.specific_type?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    const restaurantName = restaurant.google_data?.displayName?.text?.toLowerCase() || '';
    const summary = restaurant.google_data?.generativeSummary?.overview?.text?.toLowerCase() || '';
    const reviewSummary = restaurant.google_data?.reviewSummary?.text?.text?.toLowerCase() || '';
    const editorialSummary = restaurant.google_data?.editorialSummary?.text?.toLowerCase() || '';
    
    // For Asian umbrella
    if (expectedCuisine === 'asian') {
      return ASIAN_CUISINES.some(cuisine => {
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
      const hasCoffeeInTypes = types.some((t: string) => 
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
      const hasDessertInTypes = types.some((t: string) => 
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
    
    // Check restaurant name
    if (restaurantName.includes(expectedCuisine) || 
        normalizeForMatching(restaurantName).includes(normalizedCuisineKeyword)) {
      return true;
    }
    
    // Check summaries
    if (summary.includes(expectedCuisine) || 
        reviewSummary.includes(expectedCuisine) || 
        editorialSummary.includes(expectedCuisine) ||
        normalizeForMatching(summary).includes(normalizedCuisineKeyword) ||
        normalizeForMatching(reviewSummary).includes(normalizedCuisineKeyword) ||
        normalizeForMatching(editorialSummary).includes(normalizedCuisineKeyword)) {
      return true;
    }
    
    // Standard type matching
    return specificType.includes(expectedCuisine) ||
           primaryType.includes(expectedCuisine) ||
           types.some((t: string) => t.includes(expectedCuisine)) ||
           normalizeForMatching(specificType).includes(normalizedCuisineKeyword) ||
           normalizeForMatching(primaryType).includes(normalizedCuisineKeyword) ||
           types.some((t: string) => normalizeForMatching(t).includes(normalizedCuisineKeyword));
  }).length;
  
  const cuisineRate = matchCount / output.length;
  
  return {
    name: "cuisine_match",
    score: cuisineRate >= 0.85 ? 1 : 0, // 85% threshold for fuzzy matching
    metadata: {
      cuisineRate,
      matchCount,
      totalResults: output.length,
      expectedCuisine,
      threshold: 0.85
    }
  };
}

/**
 * Scorer 4: Coffee Focus
 * Checks if results are primarily cafes/coffee shops (95% threshold)
 */
function scoreCoffeeFocus({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.requiresCoffeeFocus) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "coffee_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const cafeCount = output.filter((restaurant: any) => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    
    const hasCoffeePrimaryType = primaryType === 'coffee_shop' || primaryType === 'cafe';
    const hasCoffeeInTypes = types.some((t: string) => 
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
    score: cafeRate >= 0.95 ? 1 : 0, // 95% threshold
    metadata: {
      cafeRate,
      cafeCount,
      totalResults: output.length,
      threshold: 0.95
    }
  };
}

/**
 * Scorer 5: Dessert Focus
 * Checks if results serve dessert or are dessert-focused (95% threshold)
 */
function scoreDessertFocus({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.requiresDessertFocus) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "dessert_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const dessertCount = output.filter((restaurant: any) => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    
    const hasDessertPrimaryType = primaryType === 'bakery' || 
                                   primaryType === 'dessert_shop' || 
                                   primaryType === 'ice_cream_shop' ||
                                   primaryType === 'pastry_shop' ||
                                   primaryType === 'confectionery' ||
                                   primaryType === 'dessert_restaurant';
    const hasDessertInTypes = types.some((t: string) => 
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
    score: dessertRate >= 0.95 ? 1 : 0, // 95% threshold
    metadata: {
      dessertRate,
      dessertCount,
      totalResults: output.length,
      threshold: 0.95
    }
  };
}

/**
 * Scorer 6: Brunch Focus
 * Checks if results are brunch-focused (85% threshold)
 */
function scoreBrunchFocus({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (keywords.mealType !== 'brunch') {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "brunch_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const brunchCount = output.filter((restaurant: any) => {
    if (!restaurant.google_data?.servesBrunch) {
      return false;
    }
    
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    const hasBrunchRestaurantType = types.includes('brunch_restaurant');
    const occasionTags = restaurant.occasion_tags || [];
    const hasWeekendBrunchTag = occasionTags.includes('weekend_brunch');
    
    if (hasBrunchRestaurantType || hasWeekendBrunchTag) {
      return true;
    }
    
    const googleData = restaurant.google_data as any;
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
    
    return hasBrunchHours || mentionsBrunch;
  }).length;
  
  const brunchRate = brunchCount / output.length;
  
  return {
    name: "brunch_focus",
    score: brunchRate >= 0.85 ? 1 : 0, // 85% threshold
    metadata: {
      brunchRate,
      brunchCount,
      totalResults: output.length,
      threshold: 0.85
    }
  };
}

/**
 * Scorer 7: Meal Type Match (NEW)
 * Checks if results match expected meal type (95% threshold)
 * Handles: breakfast, lunch, dinner, late-night
 */
function scoreMealTypeMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.mealType || keywords.mealType === 'brunch') {
    return null; // Brunch handled by scoreBrunchFocus
  }
  
  if (output.length === 0) {
    return {
      name: "meal_type_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const mealType = keywords.mealType.toLowerCase();
  
  const matchCount = output.filter((restaurant: any) => {
    if (mealType === 'breakfast') {
      return restaurant.google_data?.servesBreakfast === true;
    }
    if (mealType === 'lunch') {
      return restaurant.google_data?.servesLunch === true;
    }
    if (mealType === 'dinner') {
      return restaurant.google_data?.servesDinner === true;
    }
    if (mealType === 'late-night' || mealType === 'late night') {
      // Check if restaurant serves late night (might need to check hours or other indicators)
      // For now, if it serves dinner, it likely serves late night
      return restaurant.google_data?.servesDinner === true;
    }
    return true;
  }).length;
  
  const mealRate = matchCount / output.length;
  
  return {
    name: "meal_type_match",
    score: mealRate >= 0.95 ? 1 : 0, // 95% threshold
    metadata: {
      mealRate,
      matchCount,
      totalResults: output.length,
      expectedMealType: mealType,
      threshold: 0.95
    }
  };
}

/**
 * Scorer 8: Vibe Match
 * Checks if results match expected vibe (95% threshold)
 */
function scoreVibeMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.vibeKeywords || keywords.vibeKeywords.length === 0) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "vibe_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedVibes = keywords.vibeKeywords.map((v: string) => v.toLowerCase());
  
  const vibeCount = output.filter((restaurant: any) => {
    const vibeTags = restaurant.vibe_tags || [];
    const restaurantVibes = vibeTags.map((v: string) => v.toLowerCase());
    
    // Check if restaurant has ANY of the expected vibes
    return expectedVibes.some(vibe => restaurantVibes.includes(vibe));
  }).length;
  
  const vibeRate = vibeCount / output.length;
  
  return {
    name: "vibe_match",
    score: vibeRate >= 0.95 ? 1 : 0, // 95% threshold
    metadata: {
      vibeRate,
      vibeCount,
      totalResults: output.length,
      expectedVibes,
      threshold: 0.95
    }
  };
}

/**
 * Scorer 9: Occasion Match
 * Checks if results match expected occasion (95% threshold with interchangeable types)
 */
function scoreOccasionMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.occasionType) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "occasion_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedOccasion = keywords.occasionType;
  
  // Interchangeable occasion types (same as test_query_parser.ts)
  const interchangeableOccasions: { [key: string]: string[] } = {
    'anniversary': ['date_night', 'special_occasion'],
    'date_night': ['anniversary', 'special_occasion'],
    'special_occasion': ['anniversary', 'date_night', 'celebration'],
    'celebration': ['special_occasion']
  };
  
  const acceptableOccasions = new Set([expectedOccasion]);
  const interchangeable = interchangeableOccasions[expectedOccasion] || [];
  interchangeable.forEach(occ => acceptableOccasions.add(occ));
  
  const occasionCount = output.filter((restaurant: any) => {
    const occasionTags = restaurant.occasion_tags || [];
    return occasionTags.some(tag => acceptableOccasions.has(tag));
  }).length;
  
  const occasionRate = occasionCount / output.length;
  
  return {
    name: "occasion_match",
    score: occasionRate >= 0.95 ? 1 : 0, // 95% threshold
    metadata: {
      occasionRate,
      occasionCount,
      totalResults: output.length,
      expectedOccasion,
      acceptableOccasions: Array.from(acceptableOccasions),
      threshold: 0.95
    }
  };
}

/**
 * Scorer 10: Price Match
 * Checks if results match expected price level (95% threshold)
 */
function scorePriceMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.priceLevel || keywords.priceLevel === 'any') {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "price_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedPrice = keywords.priceLevel;
  
  const priceCount = output.filter((restaurant: any) => {
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
    score: priceRate >= 0.95 ? 1 : 0, // 95% threshold
    metadata: {
      priceRate,
      priceCount,
      totalResults: output.length,
      expectedPrice,
      threshold: 0.95
    }
  };
}

/**
 * Scorer 11: Instagrammable Match (NEW)
 * Checks if results are instagrammable (100% threshold - boolean filter)
 */
function scoreInstagrammableMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.requiresInstagrammable) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "instagrammable_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const allMatch = output.every((restaurant: any) => {
    const specialFeatures = restaurant.special_features || [];
    return specialFeatures.includes('instagrammable');
  });
  
  return {
    name: "instagrammable_match",
    score: allMatch ? 1 : 0, // 100% threshold (boolean filter)
    metadata: {
      totalResults: output.length,
      allMatch
    }
  };
}

/**
 * Scorer 12: Michelin Match (NEW)
 * Checks if results have Michelin recognition (100% threshold - boolean filter)
 */
function scoreMichelinMatch({ input, output, expected }: any) {
  const keywords = input.keywords as ExtractedKeywords;
  if (!keywords.requiresMichelin) {
    return null;
  }
  
  if (output.length === 0) {
    return {
      name: "michelin_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const allMatch = output.every((restaurant: any) => {
    const accolades = restaurant.accolades_tags || [];
    return accolades.some((tag: string) => tag.toLowerCase().includes('michelin'));
  });
  
  return {
    name: "michelin_match",
    score: allMatch ? 1 : 0, // 100% threshold (boolean filter)
    metadata: {
      totalResults: output.length,
      allMatch
    }
  };
}

// ============================================================================
// EVAL CONFIGURATION
// ============================================================================

Eval("filterService-quality-v2", {
  data: transformGoldenDataset,
  
  task: async (input: any) => {
    // Use keywords from golden dataset (expected keywords from Claude parsing)
    // For follow-up queries, these are already merged (previous + new keywords)
    const keywords = input.keywords as ExtractedKeywords;
    const results = preFilterRestaurants(input.query, keywords);
    
    // Limit to 10 results (except Cynthia's favorites)
    const isCynthiasFavorites = keywords.requiresCynthiasPick === true;
    if (!isCynthiasFavorites && results.length > 10) {
      return results.slice(0, 10);
    }
    
    return results;
  },
  
  scores: [
    scoreHasResults,
    scoreLocationMatch,
    scoreCuisineMatch,
    scoreCoffeeFocus,
    scoreDessertFocus,
    scoreBrunchFocus,
    scoreMealTypeMatch, // NEW
    scoreVibeMatch,
    scoreOccasionMatch,
    scorePriceMatch,
    scoreInstagrammableMatch, // NEW
    scoreMichelinMatch // NEW
  ],
  
  trialCount: 1, // Run each test once (deterministic filtering)
  
  metadata: {
    description: "FilterService quality evaluation using golden dataset keywords",
    version: "2.0",
    testCount: goldenQueries.length,
    focus: "Tests filtering accuracy with keywords from Claude parser eval",
    note: "Follow-up queries: Uses expected keywords (after Claude parsing) to test filtering"
  }
});

