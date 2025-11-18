// End-to-End Evaluation: Query → Claude Parsing → Filtering → Results
// Tests the full pipeline: parseQueryWithClaude → preFilterRestaurants

// Load environment variables from .env file
import dotenv from "dotenv";
import { resolve as resolvePath } from "path";
dotenv.config({ path: resolvePath(process.cwd(), ".env") });

import { Eval } from "braintrust";
import { parseQueryWithClaude } from "../../api/services/parseQuery";
import { preFilterRestaurants } from "../../api/services/filterService";
import { isIrrelevantQuery } from "../../api/services/routingService";
import { ExtractedKeywords, Restaurant } from "../../src/types/restaurant";
import e2eTestCases from "./e2e_test_cases.json";

// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize price level formats for comparison
 * Converts between numeric (1,2,3,4) and string ("budget", "moderate", "upscale", "luxury") formats
 */
function normalizePriceLevel(value: any): any {
  if (typeof value === 'number') {
    const priceMap: { [key: number]: string } = {
      1: 'budget',
      2: 'moderate',
      3: 'upscale',
      4: 'luxury'
    };
    return priceMap[value] || value;
  }
  
  if (typeof value === 'string') {
    const stringToNumberMap: { [key: string]: number } = {
      'budget': 1,
      'moderate': 2,
      'upscale': 3,
      'luxury': 4,
      'any': undefined
    };
    const numValue = stringToNumberMap[value.toLowerCase()];
    if (numValue !== undefined) {
      const priceMap: { [key: number]: string } = {
        1: 'budget',
        2: 'moderate',
        3: 'upscale',
        4: 'luxury'
      };
      return priceMap[numValue] || value;
    }
  }
  
  return value;
}

/**
 * Normalize neighborhood formats for comparison
 * Converts between string and array formats
 */
function normalizeNeighborhood(value: any): any {
  if (Array.isArray(value)) {
    return value;
  } else if (typeof value === 'string' && value) {
    return [value];
  } else if (value === null || value === undefined) {
    return value;
  }
  return value;
}

/**
 * Normalize a value based on its field name
 */
function normalizeField(key: string, value: any): any {
  if (key === 'priceLevel') {
    return normalizePriceLevel(value);
  } else if (key === 'neighborhood' || key === 'borough') {
    return normalizeNeighborhood(value);
  }
  return value;
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform e2e test cases to eval format
 */
function transformE2EDataset() {
  return e2eTestCases.map((testCase: any) => {
    // Normalize price level in expected if present
    const expected = { ...testCase.expected };
    if (expected.priceLevel !== undefined) {
      expected.priceLevel = normalizePriceLevel(expected.priceLevel);
    }
    
    return {
      input: {
        query: testCase.input.query,
        city: testCase.input.city
      },
      expected: expected,
      metadata: {
        ...testCase.metadata,
        originalQuery: testCase.input.query
      }
    };
  });
}

// ============================================================================
// TASK FUNCTION
// ============================================================================

/**
 * Task: Parse query with Claude, then filter restaurants
 */
async function e2eTask(input: any) {
  try {
    // Quick pre-check: If query is obviously irrelevant, return error immediately (no delay, no Claude API call)
    // This makes irrelevant queries fail instantly instead of waiting 5 seconds
    if (isIrrelevantQuery(input.query)) {
      return {
        error: "NOT_RESTAURANT_QUERY",
        parsedKeywords: null,
        results: [],
        resultCount: 0
      };
    }
    
    // 5-second delay before Claude API call to prevent rate limiting (only for legitimate queries)
    await delay(5000);
    
    // Step 1: Parse query with Claude
    let parsedKeywords: ExtractedKeywords;
    try {
      parsedKeywords = await parseQueryWithClaude(
        input.query,
        input.city
      );
    } catch (error: any) {
      // Check if Claude detected irrelevant query (fallback - in case pattern matching missed it)
      if (error.message && error.message.includes("NOT_RESTAURANT_QUERY")) {
        return {
          error: "NOT_RESTAURANT_QUERY",
          parsedKeywords: null,
          results: [],
          resultCount: 0
        };
      }
      // Re-throw other errors
      throw error;
    }
    
    // Step 2: Filter restaurants using parsed keywords
    const filteredResults = await preFilterRestaurants(
      input.query,
      parsedKeywords
    );
    
    // Step 3: Limit results (except Cynthia's favorites)
    const isCynthiasFavorites = input.query.toLowerCase().includes("cynthia's favorites") ||
                                input.query.toLowerCase().includes("cynthias favorites");
    const limitedResults = isCynthiasFavorites 
      ? filteredResults 
      : filteredResults.slice(0, 10);
    
    return {
      parsedKeywords: parsedKeywords,
      results: limitedResults,
      resultCount: limitedResults.length,
      error: undefined
    };
  } catch (error: any) {
    console.error(`❌ Error in e2e task for query: ${input.query}`, error.message);
    return {
      error: error.message,
      parsedKeywords: null,
      results: [],
      resultCount: 0
    };
  }
}

// ============================================================================
// PARSING SCORERS (from test_query_parser.ts)
// ============================================================================

function scoreNeighborhoodAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.neighborhood === undefined) {
    return null;
  }
  
  const outputVal = normalizeNeighborhood(out.neighborhood);
  const expectedVal = normalizeNeighborhood(exp.neighborhood);
  const isMatch = JSON.stringify(outputVal) === JSON.stringify(expectedVal);
  
  return {
    name: "neighborhood_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: outputVal,
      expected: expectedVal
    }
  };
}

function scoreBoroughAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.borough === undefined) {
    return null;
  }
  
  const isMatch = (out.borough || null) === (exp.borough || null);
  return {
    name: "borough_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: out.borough || null,
      expected: exp.borough || null
    }
  };
}

function scoreCityAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.city === undefined) {
    return null;
  }
  
  const isMatch = (out.city || null)?.toLowerCase() === (exp.city || null)?.toLowerCase();
  return {
    name: "city_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: out.city || null,
      expected: exp.city || null
    }
  };
}

function scoreCuisineAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out) {
    return {
      name: "cuisine_accuracy",
      score: 0,
      metadata: { error: output.error }
    };
  }
  
  if (exp?.cuisineType === undefined && exp?.cuisineSpecialty === undefined) {
    return null;
  }
  
  let correctFields = 0;
  let totalFields = 0;
  
  if (exp?.cuisineType !== undefined) {
    totalFields++;
    const outputType = (out?.cuisineType || null)?.toLowerCase();
    const expectedType = (exp?.cuisineType || null)?.toLowerCase();
    if (outputType === expectedType) {
      correctFields++;
    }
  }
  
  if (exp?.cuisineSpecialty !== undefined) {
    totalFields++;
    const outputSpecialty = (out?.cuisineSpecialty || null)?.toLowerCase();
    const expectedSpecialty = (exp?.cuisineSpecialty || null)?.toLowerCase();
    if (outputSpecialty === expectedSpecialty) {
      correctFields++;
    }
  }
  
  const score = totalFields > 0 ? correctFields / totalFields : 1;
  return {
    name: "cuisine_accuracy",
    score,
    metadata: {
      correctFields,
      totalFields,
      outputType: out?.cuisineType,
      expectedType: exp?.cuisineType,
      outputSpecialty: out?.cuisineSpecialty,
      expectedSpecialty: exp?.cuisineSpecialty
    }
  };
}

function scoreMealTypeAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.mealType === undefined) {
    return null;
  }
  
  const isMatch = (out?.mealType || null) === (exp?.mealType || null);
  return {
    name: "meal_type_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: out?.mealType || null,
      expected: exp?.mealType || null
    }
  };
}

function scorePriceLevelAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.priceLevel === undefined) {
    return null;
  }
  
  const outputVal = normalizePriceLevel(out?.priceLevel);
  const expectedVal = normalizePriceLevel(exp?.priceLevel);
  const isMatch = outputVal === expectedVal;
  
  return {
    name: "price_level_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: outputVal,
      expected: expectedVal,
      rawOutput: out?.priceLevel,
      rawExpected: exp?.priceLevel
    }
  };
}

function scoreVibeKeywordsAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.vibeKeywords === undefined) {
    return null;
  }
  
  const outputVibes = (out?.vibeKeywords || []).map((v: string) => v.toLowerCase());
  const expectedVibes = (exp?.vibeKeywords || []).map((v: string) => v.toLowerCase());
  
  const matchingKeywords = outputVibes.filter(v => expectedVibes.includes(v));
  const hasMatch = matchingKeywords.length > 0;
  
  return {
    name: "vibe_keywords_accuracy",
    score: hasMatch ? 1 : 0,
    metadata: {
      output: outputVibes,
      expected: expectedVibes,
      matchingKeywords: matchingKeywords,
      missingKeywords: expectedVibes.filter(v => !outputVibes.includes(v)),
      extraKeywords: outputVibes.filter(v => !expectedVibes.includes(v))
    }
  };
}

function scoreOccasionTypeAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.occasionType === undefined) {
    return null;
  }
  
  const outputOccasion = (out?.occasionType || null);
  const expectedOccasion = (exp?.occasionType || null);
  
  if (outputOccasion === expectedOccasion) {
    return {
      name: "occasion_type_accuracy",
      score: 1,
      metadata: {
        output: outputOccasion,
        expected: expectedOccasion,
        matchType: "exact"
      }
    };
  }
  
  const interchangeableOccasions: { [key: string]: string[] } = {
    'anniversary': ['date_night', 'special_occasion'],
    'date_night': ['anniversary', 'special_occasion'],
    'special_occasion': ['anniversary', 'date_night', 'celebration'],
    'celebration': ['special_occasion']
  };
  
  const expectedInterchangeable = interchangeableOccasions[expectedOccasion] || [];
  const outputInterchangeable = interchangeableOccasions[outputOccasion] || [];
  
  const isInterchangeable = 
    expectedInterchangeable.includes(outputOccasion) ||
    outputInterchangeable.includes(expectedOccasion) ||
    (expectedInterchangeable.length > 0 && outputInterchangeable.length > 0 &&
     expectedInterchangeable.some(e => outputInterchangeable.includes(e)));
  
  if (isInterchangeable) {
    return {
      name: "occasion_type_accuracy",
      score: 1,
      metadata: {
        output: outputOccasion,
        expected: expectedOccasion,
        matchType: "interchangeable"
      }
    };
  }
  
  return {
    name: "occasion_type_accuracy",
    score: 0,
    metadata: {
      output: outputOccasion,
      expected: expectedOccasion,
      matchType: "no_match"
    }
  };
}

function scoreRequiresInstagrammableAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.requiresInstagrammable === undefined) {
    return null;
  }
  
  const isMatch = (out?.requiresInstagrammable || false) === (exp?.requiresInstagrammable || false);
  return {
    name: "requires_instagrammable_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: out?.requiresInstagrammable || false,
      expected: exp?.requiresInstagrammable || false
    }
  };
}

function scoreRequiresMichelinAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out || exp?.requiresMichelin === undefined) {
    return null;
  }
  
  const isMatch = (out?.requiresMichelin || false) === (exp?.requiresMichelin || false);
  return {
    name: "requires_michelin_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: out?.requiresMichelin || false,
      expected: exp?.requiresMichelin || false
    }
  };
}

function scoreRequiresCoffeeFocusAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  
  // Check if expected has coffee-related cuisineType (replaces requiresCoffeeFocus check)
  const expectedCuisineTypes = Array.isArray(exp?.cuisineType) 
    ? exp.cuisineType.map((ct: string) => ct.toLowerCase())
    : exp?.cuisineType ? [exp.cuisineType.toLowerCase()] : [];
  
  const coffeeTypes = ['coffee_shop', 'cafe', 'cafeteria', 'cafeteira', 'animal_cafe'];
  const expectedHasCoffee = expectedCuisineTypes.some((ct: string) => coffeeTypes.includes(ct));
  
  if (output.error || !out || !expectedHasCoffee) {
    return null;
  }
  
  // Check if output has coffee-related cuisineType
  const outputCuisineTypes = Array.isArray(out?.cuisineType) 
    ? out.cuisineType.map((ct: string) => ct.toLowerCase())
    : out?.cuisineType ? [out.cuisineType.toLowerCase()] : [];
  
  const outputHasCoffee = outputCuisineTypes.some((ct: string) => coffeeTypes.includes(ct));
  
  const isMatch = expectedHasCoffee === outputHasCoffee;
  return {
    name: "coffee_cuisine_type_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: outputCuisineTypes,
      expected: expectedCuisineTypes
    }
  };
}

function scoreRequiresDessertFocusAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  
  // Check if expected has dessert-related cuisineType (replaces requiresDessertFocus check)
  const expectedCuisineTypes = Array.isArray(exp?.cuisineType) 
    ? exp.cuisineType.map((ct: string) => ct.toLowerCase())
    : exp?.cuisineType ? [exp.cuisineType.toLowerCase()] : [];
  
  const dessertTypes = ['bakery', 'dessert_shop', 'ice_cream_shop', 'pastry_shop', 'confectionery', 'dessert_restaurant'];
  const expectedHasDessert = expectedCuisineTypes.some((ct: string) => dessertTypes.includes(ct));
  
  if (output.error || !out || !expectedHasDessert) {
    return null;
  }
  
  // Check if output has dessert-related cuisineType
  const outputCuisineTypes = Array.isArray(out?.cuisineType) 
    ? out.cuisineType.map((ct: string) => ct.toLowerCase())
    : out?.cuisineType ? [out.cuisineType.toLowerCase()] : [];
  
  const outputHasDessert = outputCuisineTypes.some((ct: string) => dessertTypes.includes(ct));
  
  const isMatch = expectedHasDessert === outputHasDessert;
  return {
    name: "dessert_cuisine_type_accuracy",
    score: isMatch ? 1 : 0,
    metadata: {
      output: outputCuisineTypes,
      expected: expectedCuisineTypes
    }
  };
}

function scoreFieldAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out) {
    return {
      name: "field_accuracy",
      score: 0,
      metadata: { error: output.error }
    };
  }
  
  let correctFields = 0;
  let totalFields = 0;
  
  for (const key in exp) {
    if (key === 'error') continue; // Skip error field
    totalFields++;
    
    const outputVal = normalizeField(key, out?.[key]);
    const expectedVal = normalizeField(key, exp?.[key]);
    
    if (JSON.stringify(outputVal) === JSON.stringify(expectedVal)) {
      correctFields++;
    }
  }
  
  const score = totalFields > 0 ? correctFields / totalFields : 1;
  return {
    name: "field_accuracy",
    score,
    metadata: {
      correctFields,
      totalFields
    }
  };
}

function scoreLocationAccuracy({ input, output, expected }: any) {
  const out = output.parsedKeywords;
  const exp = expected;
  if (output.error || !out) {
    return {
      name: "location_accuracy",
      score: 0,
      metadata: { error: output.error }
    };
  }
  
  if (exp?.neighborhood === undefined && exp?.borough === undefined && exp?.city === undefined) {
    return null;
  }
  
  let correctFields = 0;
  let totalFields = 0;
  
  if (exp?.neighborhood !== undefined) {
    totalFields++;
    const outputVal = normalizeNeighborhood(out.neighborhood);
    const expectedVal = normalizeNeighborhood(exp.neighborhood);
    if (JSON.stringify(outputVal) === JSON.stringify(expectedVal)) {
      correctFields++;
    }
  }
  
  if (exp?.borough !== undefined) {
    totalFields++;
    if ((out.borough || null) === (exp.borough || null)) {
      correctFields++;
    }
  }
  
  if (exp?.city !== undefined) {
    totalFields++;
    if ((out.city || null)?.toLowerCase() === (exp.city || null)?.toLowerCase()) {
      correctFields++;
    }
  }
  
  const score = totalFields > 0 ? correctFields / totalFields : 1;
  return {
    name: "location_accuracy",
    score,
    metadata: {
      correctFields,
      totalFields
    }
  };
}

// ============================================================================
// FILTERING SCORERS (from filterService-eval-v2.ts)
// ============================================================================

function scoreHasResults({ input, output, expected }: any) {
  if (output.error) {
    return {
      name: "has_results",
      score: 0,
      metadata: { error: output.error }
    };
  }
  
  if (output.results.length === 0) {
    return {
      name: "has_results",
      score: 0,
      metadata: { resultCount: 0 }
    };
  }
  
  return {
    name: "has_results",
    score: 1,
    metadata: { resultCount: output.results.length }
  };
}

function scoreLocationMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.borough && !keywords.neighborhood && !keywords.city) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "location_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const borough = keywords.borough;
  const neighborhood = keywords.neighborhood;
  const city = keywords.city;
  
  const allMatch = output.results.every((restaurant: any) => {
    let matches = false;
    
    if (neighborhood) {
      const restaurantNeighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
      const neighborhoods = Array.isArray(neighborhood) ? neighborhood : [neighborhood];
      
      matches = neighborhoods.some((neighborhoodKeyword: string) => {
        const keyword = neighborhoodKeyword.toLowerCase();
        return restaurantNeighborhood.includes(keyword) || keyword.includes(restaurantNeighborhood);
      });
      
      if (matches) return true;
    }
    
    if (borough) {
      const restaurantBorough = restaurant.borough?.toLowerCase();
      if (Array.isArray(borough)) {
        // Multiple boroughs: match if restaurant is in ANY of them
        matches = borough.some(boroughKeyword => {
          const keyword = boroughKeyword.toLowerCase();
          return restaurantBorough === keyword;
        });
      } else {
        // Single borough
        const boroughKeyword = borough.toLowerCase();
        matches = restaurantBorough === boroughKeyword;
      }
    }
    
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
      totalResults: output.results.length,
      expectedLocation: borough || neighborhood || city,
      allMatch
    }
  };
}

function scoreCuisineMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.cuisineType && !keywords.cuisineSpecialty) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "cuisine_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  // Handle cuisineType as string or array
  const expectedCuisineTypes = Array.isArray(keywords.cuisineType) 
    ? keywords.cuisineType.map(ct => ct.toLowerCase())
    : keywords.cuisineType ? [keywords.cuisineType.toLowerCase()] : [];
  
  if (expectedCuisineTypes.length === 0) {
    return null; // No cuisine filter
  }
  
  const normalizeForMatching = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/s$/, '');
  };
  
  const normalizedCuisineKeywords = expectedCuisineTypes.map(ct => normalizeForMatching(ct));
  const ASIAN_CUISINES = [
    'japanese', 'chinese', 'korean', 'thai', 'vietnamese', 'indian',
    'ramen', 'sushi', 'sashimi', 'dim sum', 'dimsum', 'hot pot', 
    'szechuan', 'peking duck', 'pho', 'vermicelli', 'pad thai',
    'yakitori', 'katsu', 'tonkatsu', 'tempura', 'udon', 'soba',
    'okonomiyaki', 'curry', 'onigiri', 'takoyaki', 'teriyaki',
    'sukiyaki', 'shabu shabu', 'shabushabu', 'kaiseki', 'omurice'
  ];
  
  const expectedSpecialty = keywords.cuisineSpecialty?.toLowerCase();
  
  const matchCount = output.results.filter((restaurant: any) => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const specificType = restaurant.specific_type?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    const restaurantName = restaurant.google_data?.displayName?.text?.toLowerCase() || '';
    const summary = restaurant.google_data?.generativeSummary?.overview?.text?.toLowerCase() || '';
    const reviewSummary = restaurant.google_data?.reviewSummary?.text?.text?.toLowerCase() || '';
    const editorialSummary = restaurant.google_data?.editorialSummary?.text?.toLowerCase() || '';
    
    if (expectedSpecialty) {
      const normalizedSpecialty = normalizeForMatching(expectedSpecialty);
      
      const matchesSpecialtyInMetadata = 
        primaryType.includes(expectedSpecialty) ||
        specificType.includes(expectedSpecialty) ||
        types.some(t => t.includes(expectedSpecialty)) ||
        normalizeForMatching(primaryType).includes(normalizedSpecialty) ||
        normalizeForMatching(specificType).includes(normalizedSpecialty) ||
        types.some(t => normalizeForMatching(t).includes(normalizedSpecialty));
      
      const matchesSpecialtyInName = 
        restaurantName.includes(expectedSpecialty) ||
        normalizeForMatching(restaurantName).includes(normalizedSpecialty);
      
      const matchesSpecialtyInSummaries = 
        summary.includes(expectedSpecialty) ||
        reviewSummary.includes(expectedSpecialty) ||
        editorialSummary.includes(expectedSpecialty) ||
        normalizeForMatching(summary).includes(normalizedSpecialty) ||
        normalizeForMatching(reviewSummary).includes(normalizedSpecialty) ||
        normalizeForMatching(editorialSummary).includes(normalizedSpecialty);
      
      const matchesSpecialty = matchesSpecialtyInMetadata || matchesSpecialtyInName || matchesSpecialtyInSummaries;
      
      if (!matchesSpecialty) {
        return false;
      }
    }
    
    // Check if restaurant matches ANY of the expected cuisine types
    return expectedCuisineTypes.some(expectedCuisine => {
      const normalizedCuisineKeyword = normalizeForMatching(expectedCuisine);
      
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
      
      if (expectedCuisine === 'bar') {
        return primaryType === 'bar' || 
               primaryType === 'night_club' || 
               specificType === 'bar';
      }
      
      const coffeeRelatedKeywords = ['coffee shop', 'coffee', 'cafe', 'coffee_shop', 'cafeteria', 'cafeteira', 'animal_cafe'];
      if (coffeeRelatedKeywords.includes(expectedCuisine)) {
        const coffeeTypes = ['coffee_shop', 'cafe', 'cafeteria', 'cafeteira', 'animal_cafe'];
        const hasCoffeePrimaryType = coffeeTypes.some(ct => primaryType === ct);
        const hasCoffeeInTypes = types.some((t: string) => 
          coffeeTypes.some(ct => t === ct || t.toLowerCase() === ct)
        );
        return hasCoffeePrimaryType || hasCoffeeInTypes;
      }
      
      const dessertRelatedKeywords = ['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets', 
                                      'dessert_shop', 'pastry_shop', 'confectionery'];
      if (dessertRelatedKeywords.includes(expectedCuisine)) {
        const dessertTypes = ['bakery', 'dessert_shop', 'ice_cream_shop', 'pastry_shop', 'confectionery', 'dessert_restaurant'];
        const hasDessertPrimaryType = dessertTypes.some(dt => primaryType === dt);
        const hasDessertInTypes = types.some((t: string) => 
          dessertTypes.some(dt => t === dt || t.toLowerCase() === dt)
        );
        return hasDessertPrimaryType || hasDessertInTypes;
      }
      
      if (restaurantName.includes(expectedCuisine) || 
          normalizeForMatching(restaurantName).includes(normalizedCuisineKeyword)) {
        return true;
      }
      
      if (summary.includes(expectedCuisine) || 
          reviewSummary.includes(expectedCuisine) || 
          editorialSummary.includes(expectedCuisine) ||
          normalizeForMatching(summary).includes(normalizedCuisineKeyword) ||
          normalizeForMatching(reviewSummary).includes(normalizedCuisineKeyword) ||
          normalizeForMatching(editorialSummary).includes(normalizedCuisineKeyword)) {
        return true;
      }
      
      return specificType.includes(expectedCuisine) ||
             primaryType.includes(expectedCuisine) ||
             types.some((t: string) => t.includes(expectedCuisine)) ||
             normalizeForMatching(specificType).includes(normalizedCuisineKeyword) ||
             normalizeForMatching(primaryType).includes(normalizedCuisineKeyword) ||
             types.some((t: string) => normalizeForMatching(t).includes(normalizedCuisineKeyword));
    });
  }).length;
  
  const cuisineRate = matchCount / output.results.length;
  
  return {
    name: "cuisine_match",
    score: cuisineRate >= 0.85 ? 1 : 0,
    metadata: {
      cuisineRate,
      matchCount,
      totalResults: output.results.length,
      expectedCuisineTypes,
      expectedSpecialty: expectedSpecialty || undefined,
      threshold: 0.85
    }
  };
}

function scorePriceMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.priceLevel || keywords.priceLevel === 'any') {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "price_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedPrice = keywords.priceLevel;
  
  const priceCount = output.results.filter((restaurant: any) => {
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
      case 'luxury':
        return priceDisplay === '$$$$';
      default:
        return true;
    }
  }).length;
  
  const priceRate = priceCount / output.results.length;
  
  return {
    name: "price_match",
    score: priceRate >= 0.95 ? 1 : 0,
    metadata: {
      priceRate,
      priceCount,
      totalResults: output.results.length,
      expectedPrice,
      threshold: 0.95
    }
  };
}

function scoreVibeMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.vibeKeywords || keywords.vibeKeywords.length === 0) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "vibe_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedVibes = keywords.vibeKeywords.map((v: string) => v.toLowerCase());
  
  const vibeCount = output.results.filter((restaurant: any) => {
    const vibeTags = restaurant.vibe_tags || [];
    const restaurantVibes = vibeTags.map((v: string) => v.toLowerCase());
    
    return expectedVibes.some(vibe => restaurantVibes.includes(vibe));
  }).length;
  
  const vibeRate = vibeCount / output.results.length;
  
  return {
    name: "vibe_match",
    score: vibeRate >= 0.95 ? 1 : 0,
    metadata: {
      vibeRate,
      vibeCount,
      totalResults: output.results.length,
      expectedVibes,
      threshold: 0.95
    }
  };
}

function scoreOccasionMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.occasionType) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "occasion_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const expectedOccasion = keywords.occasionType;
  
  const interchangeableOccasions: { [key: string]: string[] } = {
    'anniversary': ['date_night', 'special_occasion'],
    'date_night': ['anniversary', 'special_occasion'],
    'special_occasion': ['anniversary', 'date_night', 'celebration'],
    'celebration': ['special_occasion']
  };
  
  const acceptableOccasions = new Set([expectedOccasion]);
  const interchangeable = interchangeableOccasions[expectedOccasion] || [];
  interchangeable.forEach(occ => acceptableOccasions.add(occ));
  
  const occasionCount = output.results.filter((restaurant: any) => {
    const occasionTags = restaurant.occasion_tags || [];
    
    if (occasionTags.some(tag => acceptableOccasions.has(tag))) {
      return true;
    }
    
    if (expectedOccasion === 'business_lunch') {
      const hasBusinessDinner = occasionTags.includes('business_dinner');
      const servesLunch = restaurant.google_data?.servesLunch === true;
      if (hasBusinessDinner && servesLunch) {
        return true;
      }
    }
    
    if (expectedOccasion === 'business_dinner') {
      const hasBusinessLunch = occasionTags.includes('business_lunch');
      const servesDinner = restaurant.google_data?.servesDinner === true;
      if (hasBusinessLunch && servesDinner) {
        return true;
      }
    }
    
    return false;
  }).length;
  
  const occasionRate = occasionCount / output.results.length;
  
  return {
    name: "occasion_match",
    score: occasionRate >= 0.95 ? 1 : 0,
    metadata: {
      occasionRate,
      occasionCount,
      totalResults: output.results.length,
      expectedOccasion,
      acceptableOccasions: Array.from(acceptableOccasions),
      threshold: 0.95
    }
  };
}

function scoreBrunchFocus({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (keywords.mealType !== 'brunch') {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "brunch_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const brunchCount = output.results.filter((restaurant: any) => {
    if (restaurant.google_data?.servesBrunch === true) {
      return true;
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
  
  const brunchRate = brunchCount / output.results.length;
  
  return {
    name: "brunch_focus",
    score: brunchRate >= 0.85 ? 1 : 0,
    metadata: {
      brunchRate,
      brunchCount,
      totalResults: output.results.length,
      threshold: 0.85
    }
  };
}

function scoreCoffeeFocus({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  
  // Check if cuisineType includes coffee-related types
  const cuisineTypes = Array.isArray(keywords.cuisineType) 
    ? keywords.cuisineType.map(ct => ct.toLowerCase())
    : keywords.cuisineType ? [keywords.cuisineType.toLowerCase()] : [];
  
  const coffeeTypes = ['coffee_shop', 'cafe', 'cafeteria', 'cafeteira', 'animal_cafe'];
  const hasCoffeeCuisineType = cuisineTypes.some(ct => coffeeTypes.includes(ct));
  
  if (!hasCoffeeCuisineType) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "coffee_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const cafeCount = output.results.filter((restaurant: any) => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    
    // Check if restaurant has any coffee-related type
    const hasCoffeePrimaryType = coffeeTypes.some(ct => primaryType === ct);
    const hasCoffeeInTypes = types.some((t: string) => 
      coffeeTypes.some(ct => t === ct || t.toLowerCase() === ct)
    );
    
    return hasCoffeePrimaryType || hasCoffeeInTypes;
  }).length;
  
  const cafeRate = cafeCount / output.results.length;
  
  return {
    name: "coffee_focus",
    score: cafeRate >= 0.95 ? 1 : 0,
    metadata: {
      cafeRate,
      cafeCount,
      totalResults: output.results.length,
      threshold: 0.95
    }
  };
}

function scoreDessertFocus({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  
  // Check if cuisineType includes dessert-related types
  const cuisineTypes = Array.isArray(keywords.cuisineType) 
    ? keywords.cuisineType.map(ct => ct.toLowerCase())
    : keywords.cuisineType ? [keywords.cuisineType.toLowerCase()] : [];
  
  const dessertTypes = ['bakery', 'dessert_shop', 'ice_cream_shop', 'pastry_shop', 'confectionery', 'dessert_restaurant'];
  const hasDessertCuisineType = cuisineTypes.some(ct => dessertTypes.includes(ct));
  
  if (!hasDessertCuisineType) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "dessert_focus",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const dessertCount = output.results.filter((restaurant: any) => {
    const primaryType = restaurant.google_data?.primaryType?.toLowerCase() || '';
    const types = restaurant.google_data?.types?.map((t: string) => t.toLowerCase()) || [];
    
    // Check if restaurant has any dessert-related type
    const hasDessertPrimaryType = dessertTypes.some(dt => primaryType === dt);
    const hasDessertInTypes = types.some((t: string) => 
      dessertTypes.some(dt => t === dt || t.toLowerCase() === dt)
    );
    
    return hasDessertPrimaryType || hasDessertInTypes;
  }).length;
  
  const dessertRate = dessertCount / output.results.length;
  
  return {
    name: "dessert_focus",
    score: dessertRate >= 0.95 ? 1 : 0,
    metadata: {
      dessertRate,
      dessertCount,
      totalResults: output.results.length,
      threshold: 0.95
    }
  };
}

function scoreMealTypeMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.mealType || keywords.mealType === 'brunch') {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "meal_type_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const mealType = keywords.mealType.toLowerCase();
  
  const matchCount = output.results.filter((restaurant: any) => {
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
      return restaurant.google_data?.servesDinner === true;
    }
    return true;
  }).length;
  
  const mealRate = matchCount / output.results.length;
  
  return {
    name: "meal_type_match",
    score: mealRate >= 0.95 ? 1 : 0,
    metadata: {
      mealRate,
      matchCount,
      totalResults: output.results.length,
      expectedMealType: mealType,
      threshold: 0.95
    }
  };
}

function scoreInstagrammableMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.requiresInstagrammable) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "instagrammable_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const instagrammableCount = output.results.filter((restaurant: any) => {
    const specialFeatures = restaurant.special_features || [];
    return specialFeatures.includes('instagrammable');
  }).length;
  
  const instagrammableRate = instagrammableCount / output.results.length;
  
  return {
    name: "instagrammable_match",
    score: instagrammableRate >= 0.95 ? 1 : 0,
    metadata: {
      instagrammableRate,
      instagrammableCount,
      totalResults: output.results.length,
      threshold: 0.95
    }
  };
}

function scoreMichelinMatch({ input, output, expected }: any) {
  if (output.error || !output.parsedKeywords) {
    return null;
  }
  
  const keywords = output.parsedKeywords as ExtractedKeywords;
  if (!keywords.requiresMichelin) {
    return null;
  }
  
  if (output.results.length === 0) {
    return {
      name: "michelin_match",
      score: 0,
      metadata: { error: "No results to check" }
    };
  }
  
  const michelinCount = output.results.filter((restaurant: any) => {
    const accoladesTags = restaurant.accolades_tags || [];
    // Match any tag that contains 'michelin' (same logic as filterService)
    // Actual tags: michelin_1_star, michelin_2_star, michelin_3_star, michelin_starred, michelin_bib_gourmand
    return accoladesTags.some((tag: string) => tag.toLowerCase().includes('michelin'));
  }).length;
  
  const michelinRate = michelinCount / output.results.length;
  
  return {
    name: "michelin_match",
    score: michelinRate >= 0.95 ? 1 : 0,
    metadata: {
      michelinRate,
      michelinCount,
      totalResults: output.results.length,
      threshold: 0.95
    }
  };
}

// ============================================================================
// NEW SCORERS
// ============================================================================

/**
 * Scorer: Irrelevant Query Detection
 * Checks if Claude correctly detects and rejects non-restaurant queries
 */
function scoreIrrelevantQueryDetection({ input, output, expected }: any) {
  // Only run for queries expected to be irrelevant
  if (expected.error !== "NOT_RESTAURANT_QUERY") {
    return null;
  }
  
  // Check if Claude detected it as irrelevant
  const wasDetected = output.error === "NOT_RESTAURANT_QUERY";
  
  return {
    name: "irrelevant_query_detection",
    score: wasDetected ? 1 : 0,
    metadata: {
      wasDetected,
      error: output.error || "none",
      query: input.query
    }
  };
}

// ============================================================================
// EVAL CONFIGURATION
// ============================================================================

Eval("End-to-End Restaurant Search", {
  metadata: {
    evalVersion: "v1.0",
    description: "End-to-end evaluation: Query → Claude parsing → Filtering → Results",
    testCount: e2eTestCases.length,
    focus: "Tests full pipeline accuracy with real Claude API calls"
  },
  
  // Run tests sequentially to avoid rate limits (5-second delay between calls)
  maxConcurrency: 1,
  
  // Transform test cases
  data: transformE2EDataset,
  
  // Task function
  task: e2eTask,
  
  // All scorers
  scores: [
    // Parsing scorers (12)
    scoreFieldAccuracy,
    scoreLocationAccuracy,
    scoreNeighborhoodAccuracy,
    scoreBoroughAccuracy,
    scoreCityAccuracy,
    scoreCuisineAccuracy,
    scorePriceLevelAccuracy,
    scoreVibeKeywordsAccuracy,
    scoreOccasionTypeAccuracy,
    scoreMealTypeAccuracy,
    scoreRequiresInstagrammableAccuracy,
    scoreRequiresMichelinAccuracy,
    scoreRequiresCoffeeFocusAccuracy,
    scoreRequiresDessertFocusAccuracy,
    
    // Filtering scorers (12)
    scoreHasResults,
    scoreLocationMatch,
    scoreCuisineMatch,
    scorePriceMatch,
    scoreVibeMatch,
    scoreOccasionMatch,
    scoreBrunchFocus,
    scoreCoffeeFocus,
    scoreDessertFocus,
    scoreMealTypeMatch,
    scoreInstagrammableMatch,
    scoreMichelinMatch,
    
    // New scorers (1)
    scoreIrrelevantQueryDetection
  ],
  
  trialCount: 1 // Deterministic
});

