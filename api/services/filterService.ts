// Client-side filter service for Curated by Cynthia
// Pre-filters restaurants before sending to Claude API for smart ranking

import { Restaurant, ExtractedKeywords } from '../../src/types/restaurant';

// Lazy loading with caching - only load data once
let restaurantsCache: Restaurant[] | null = null;
let restaurantsByCityCache: Map<string, Restaurant[]> | null = null;

/**
 * Lazy load restaurants data (cached after first load)
 */
function getRestaurants(): Restaurant[] {
  if (restaurantsCache === null) {
    const startTime = Date.now();
    // Import at runtime to avoid loading on module initialization
    // Using require for serverless compatibility
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { restaurantData } = require('../data/latest_277.js');
    restaurantsCache = (restaurantData as any).places || (restaurantData as any) || [];
    const loadTime = Date.now() - startTime;
    console.log(`[Performance] Loaded ${restaurantsCache.length} restaurants in ${loadTime}ms`);
  }
  return restaurantsCache;
}

/**
 * Get restaurants filtered by city (cached by city)
 * This dramatically reduces the dataset size before other filters
 */
function getRestaurantsByCity(city?: string): Restaurant[] {
  if (!city) {
    return getRestaurants();
  }

  // Initialize city cache if needed
  if (restaurantsByCityCache === null) {
    restaurantsByCityCache = new Map();
  }

  // Check cache first
  if (restaurantsByCityCache.has(city)) {
    return restaurantsByCityCache.get(city)!;
  }

  // Filter by city and cache result
  const allRestaurants = getRestaurants();
  const cityMap: { [key: string]: string[] } = {
    'nyc': ['new york city', 'new york', 'nyc'],
    'tokyo': ['tokyo'],
    'seoul': ['seoul'],
    'paris': ['paris']
  };

  const expectedCities = cityMap[city.toLowerCase()] || [];
  const filtered = allRestaurants.filter(restaurant => {
    const restaurantCity = restaurant.city?.toLowerCase();
    const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
    
    // Check restaurant.city property
    if (restaurantCity) {
      for (const expectedCity of expectedCities) {
        if (restaurantCity.includes(expectedCity) || expectedCity.includes(restaurantCity)) {
          return true;
        }
      }
    }
    
    // Fall back to address parsing
    return expectedCities.some(expectedCity => 
      address.includes(expectedCity) || 
      (city.toLowerCase() === 'nyc' && (address.includes('new york') || address.includes('brooklyn'))) ||
      (city.toLowerCase() === 'tokyo' && address.includes('japan')) ||
      (city.toLowerCase() === 'seoul' && address.includes('korea')) ||
      (city.toLowerCase() === 'paris' && address.includes('france'))
    );
  });

  restaurantsByCityCache.set(city, filtered);
  console.log(`[Performance] Filtered ${allRestaurants.length} restaurants to ${filtered.length} for city "${city}"`);
  return filtered;
}

// Cuisine types to match against
const CUISINE_TYPES = [
  'italian', 'japanese', 'french', 'korean', 'chinese', 'mexican', 'thai', 
  'vietnamese', 'indian', 'american', 'asian', // Added 'asian' as a generic category
  'ramen', 'sushi', 'sashimi', 'nigiri', 'sushi roll', 'pizza', 'burger', 
  'bakery', 'cafe', 'dessert', 'seafood', 'steak', 'bbq', 'barbeque', 'barbecue', 'mediterranean',
  'middle eastern', 'latin', 'spanish', 'greek', 'turkish', 'ethiopian',
  'caribbean', 'soul food', 'southern', 'tex-mex', 'fusion', 'vegetarian',
  'vegan', 'healthy', 'fast food', 'fine dining', 'bar', 'drink', 'drinks', 
  'cake', 'pastries', 'pastry','bakeries', 'sweets', 'coffee shop','coffee', 'bagel', 'bagels', 'sandwich', 'sandwiches',
  // Japanese specific dishes
  'yakitori', 'katsu', 'tonkatsu', 'tempura', 'udon', 'soba', 'okonomiyaki', 'curry', 'onigiri',
  'takoyaki', 'sashimi', 'teriyaki', 'sukiyaki', 'shabu shabu', 'shabushabu', 'kaiseki', 'omurice',
  // French specific dishes
  'galettes', 'crepes', 'crepe', 'Crêperie', 'galette', 'crossiant', 'duck confit',
  // Italian specific dishes
  'pasta', 'risotto', 'pizza',
  //Chinese specific dishes
  'dim sum', 'dimsum', 'hot pot', 'szechuan', 'peking duck',
  // Other specific dishes
  'pho', 'vermicelli', 'pad thai', 'tacos', 'burritos'
];

// Asian cuisines that should match when user searches for "asian"
const ASIAN_CUISINES = [
  'japanese', 'chinese', 'korean', 'thai', 'vietnamese', 'indian',
  'ramen', 'sushi', 'sashimi', 'dim sum', 'dimsum', 'hot pot', 
  'szechuan', 'peking duck', 'pho', 'vermicelli', 'pad thai',
  'yakitori', 'katsu', 'tonkatsu', 'tempura', 'udon', 'soba',
  'okonomiyaki', 'curry', 'onigiri', 'takoyaki', 'teriyaki',
  'sukiyaki', 'shabu shabu', 'shabushabu', 'kaiseki', 'omurice'
];

// Borough names to match (only Brooklyn and Manhattan since we only have data for these)
const BOROUGHS = [
  'brooklyn', 'bk', 'manhattan'
];

// Meal types
const MEAL_TYPES = ['breakfast', 'brunch', 'lunch', 'dinner', 'late night', 'late-night'];

// Vibe mappings - map user queries to enriched tags
const VIBE_MAPPINGS: { [key: string]: string[] } = {
  'good vibes': ['cozy', 'lively', 'trendy', 'casual', 'hip'],
  'chill': ['casual', 'laid_back', 'low_key', 'quiet_ambiance'],
  'fancy': ['upscale', 'sophisticated', 'elegant'],
  'fun': ['lively', 'energetic', 'vibrant'],
  'romantic': ['romantic', 'intimate', 'cozy'],
  'trendy': ['trendy', 'hip', 'modern'],
  'cozy': ['cozy', 'intimate', 'warm'],
  'casual': ['casual', 'laid_back', 'low_key'],
  'upscale': ['upscale', 'sophisticated', 'elegant'],
  'lively': ['lively', 'vibrant', 'energetic'],
  'quiet': ['quiet', 'peaceful', 'calm'],
  'intimate': ['intimate', 'romantic', 'cozy']
};

// Occasion mappings
const OCCASION_MAPPINGS: { [key: string]: string } = {
  'first date': 'first_date',
  'second date': 'second_date',
  'date night': 'date_night',
  'date': 'date_night',
  'anniversary': 'anniversary',
  'business lunch': 'business_lunch',
  'business dinner': 'business_dinner',
  'business meeting': 'business_lunch',
  'family': 'family_friendly',
  'kids': 'family_friendly',
  'group': 'group_dining',
  'celebration': 'celebration',
  'birthday': 'celebration',
  'solo': 'solo_dining',
  'alone': 'solo_dining'
};

/**
 * Calculate quality score for a restaurant
 */
function calculateQualityScore(restaurant: Restaurant, keywords: ExtractedKeywords): number {
  const rating = restaurant.google_data.rating || 0;
  const reviewCount = restaurant.google_data.userRatingCount || 0;
  
  // Base formula: rating × log10(reviewCount + 1)
  const baseScore = rating * Math.log10(reviewCount + 1);
  
  // Apply Cynthia's pick boost (1.2x)
  const cynthiaMultiplier = restaurant.cynthias_pick ? 1.2 : 1.0;
  
  return baseScore * cynthiaMultiplier;
}

/**
 * Calculate tier for restaurant based on cuisine type matching
 */
function calculateTier(restaurant: Restaurant, keywords: ExtractedKeywords): number {
  if (!keywords.cuisineType) {
    return 3; // No cuisine filter, all restaurants in tier 3
  }

  const cuisineKeyword = keywords.cuisineType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];

  const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
  const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
  const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
  
  // Tier 1: Matches primaryType, specificType, or restaurant name
  if (primaryType.includes(cuisineKeyword) || 
      specificType.includes(cuisineKeyword) ||
      restaurantName.includes(cuisineKeyword)) {
    return 1;
  }

  // Tier 2: Matches types array or appears in summaries
  if (types.some(t => t.includes(cuisineKeyword)) ||
      summary.includes(cuisineKeyword) ||
      reviewSummary.includes(cuisineKeyword)) {
    return 2;
  }

  // Tier 3: All other restaurants
  return 3;
}

/**
 * Sort restaurants using tiered ranking system
 */
function sortByTieredRanking(restaurants: Restaurant[], keywords: ExtractedKeywords): Restaurant[] {
  return restaurants.sort((a, b) => {
    try {
      // TIER 0: Specialty match (if user asked for specific dish)
      if (keywords.cuisineSpecialty) {
        const aMatchesSpecialty = (a as any)._matchesSpecialty || false;
        const bMatchesSpecialty = (b as any)._matchesSpecialty || false;
        
        if (aMatchesSpecialty && !bMatchesSpecialty) return -1;
        if (!aMatchesSpecialty && bMatchesSpecialty) return 1;
      }
      
      // TIER 1: primaryType match (or other tier 1 criteria)
      const tierA = calculateTier(a, keywords);
      const tierB = calculateTier(b, keywords);
      
      // Sort by tier (1 > 2 > 3)
      if (tierA !== tierB) {
        return tierA - tierB;
      }
      
      // Within same tier, sort by quality score
      const scoreA = calculateQualityScore(a, keywords);
      const scoreB = calculateQualityScore(b, keywords);
      return scoreB - scoreA; // Descending order
    } catch (error) {
      console.warn('Error in tiered ranking:', error);
      return 0;
    }
  });
}

/**
 * Check if restaurant matches location criteria
 */
function matchesLocation(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.neighborhood && !keywords.borough && !keywords.city) {
    return true; // No location filter
  }

  let hasNeighborhoodMatch = false;
  let hasBoroughMatch = false;
  let hasCityMatch = false;

  // Check neighborhood match - only check neighborhood_extracted field (works for all cities: NYC, Tokyo, Seoul, Paris)
  // Neighborhood takes precedence over borough and city
  if (keywords.neighborhood) {
    const restaurantNeighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
    
    // Handle both single neighborhood and array of neighborhoods (union for explicit "and"/"or")
    if (Array.isArray(keywords.neighborhood)) {
      // Multiple neighborhoods: match if restaurant is in ANY of them (union)
      // Works for all cities: e.g., "Shibuya or Ginza" (Tokyo), "Gangnam or Jongno" (Seoul), "1st arrondissement or 7th arrondissement" (Paris)
      hasNeighborhoodMatch = keywords.neighborhood.some(neighborhoodKeyword => {
        const keyword = neighborhoodKeyword.toLowerCase();
        return restaurantNeighborhood.includes(keyword) || keyword.includes(restaurantNeighborhood);
      });
    } else {
      // Single neighborhood - works for all cities
      // Examples: "Shibuya" (Tokyo), "Gangnam District" (Seoul), "7th arrondissement" (Paris)
      const neighborhoodKeyword = keywords.neighborhood.toLowerCase();
      hasNeighborhoodMatch = restaurantNeighborhood.includes(neighborhoodKeyword) || 
                             neighborhoodKeyword.includes(restaurantNeighborhood);
    }
    
    // If neighborhood is specified, return immediately (neighborhood takes precedence over borough and city for ALL cities)
    return hasNeighborhoodMatch;
  } else {
    // If no neighborhood specified, consider it as matching (no neighborhood filter)
    hasNeighborhoodMatch = true;
  }

  // Check borough match - simplified: only Brooklyn and Manhattan
  // Borough takes precedence over city - if borough is specified, ignore city
  if (keywords.borough) {
    const boroughKeyword = keywords.borough.toLowerCase();
    const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
    
    if (boroughKeyword === 'brooklyn') {
      // Brooklyn query: only return if address contains "brooklyn"
      hasBoroughMatch = address.includes('brooklyn');
    } else if (boroughKeyword === 'manhattan') {
      // Manhattan query: return if address does NOT contain "brooklyn" (meaning it's Manhattan)
      hasBoroughMatch = !address.includes('brooklyn');
    } else {
      hasBoroughMatch = false;
    }
    
    // If borough is specified, use borough match (ignore city)
    return hasBoroughMatch;
  } else {
    // If no borough specified, consider it as matching (no borough filter)
    hasBoroughMatch = true;
  }

  // Check city match - only if neighborhood and borough are not specified (they take precedence)
  // Works consistently for all cities: NYC, Tokyo, Seoul, Paris
  if (keywords.city) {
    const restaurantCity = restaurant.city?.toLowerCase();
    const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
    
    // Map keywords.city to expected city names (all supported cities)
    const cityMap: { [key: string]: string[] } = {
      'nyc': ['new york city', 'new york', 'nyc'],
      'tokyo': ['tokyo'],
      'seoul': ['seoul'],
      'paris': ['paris']
    };
    
    const expectedCities = cityMap[keywords.city] || [];
    
    // First check restaurant.city property (more reliable for all cities)
    if (restaurantCity) {
      for (const expectedCity of expectedCities) {
        if (restaurantCity.includes(expectedCity) || expectedCity.includes(restaurantCity)) {
          hasCityMatch = true;
          break;
        }
      }
    }
    
    // Fall back to address parsing if restaurant.city didn't match (same pattern for all cities)
    if (!hasCityMatch) {
      switch (keywords.city) {
        case 'nyc':
          // For NYC queries, show all restaurants (both Manhattan and Brooklyn)
          // Since we only have Manhattan and Brooklyn data, any NYC address matches
          if (address.includes('new york') || address.includes('nyc') || address.includes('brooklyn')) {
            hasCityMatch = true;
          }
          break;
        case 'tokyo':
          // For Tokyo: match addresses containing "tokyo" or "japan"
          if (address.includes('tokyo') || address.includes('japan')) {
            hasCityMatch = true;
          }
          break;
        case 'seoul':
          // For Seoul: match addresses containing "seoul" or "korea"
          if (address.includes('seoul') || address.includes('korea')) {
            hasCityMatch = true;
          }
          break;
        case 'paris':
          // For Paris: match addresses containing "paris" or "france"
          if (address.includes('paris') || address.includes('france')) {
            hasCityMatch = true;
          }
          break;
      }
    }
  } else {
    // If no city specified, consider it as matching (no city filter)
    hasCityMatch = true;
  }
  
  // At this point, only city matching is left (neighborhood and borough already returned if specified)
  return hasCityMatch;
}

/**
 * Check if restaurant matches cuisine criteria
 */
function matchesCuisine(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.cuisineType && !keywords.cuisineSpecialty) {
    return true; // No cuisine filter
  }
  
  // Check broad cuisine
  if (keywords.cuisineType) {
    // Handle multiple cuisine types (OR logic for "X and Y" queries)
    const additionalCuisineTypes = (keywords as any).additionalCuisineTypes as string[] | undefined;
    const cuisineTypesToMatch = additionalCuisineTypes && additionalCuisineTypes.length > 0
      ? [keywords.cuisineType, ...additionalCuisineTypes]
      : [keywords.cuisineType];

    // Check if restaurant matches ANY of the cuisine types (OR logic)
    const matchesBroadCuisine = cuisineTypesToMatch.some(cuisineType => {
      return matchesSingleCuisineType(restaurant, cuisineType);
    });
    
    if (!matchesBroadCuisine) {
      return false; // ❌ Wrong cuisine category entirely
    }
  }
  
  // Check specific specialty
  // Prioritize metadata fields (more reliable) over text mentions (can have false positives)
  // Follows same prioritization pattern as matchesSingleCuisineType
  if (keywords.cuisineSpecialty) {
    const specialty = keywords.cuisineSpecialty.toLowerCase();
    const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
    const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
    const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
    const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
    const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
    const specificType = restaurant.specific_type?.toLowerCase() || '';
    const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
    
    // Normalize accents and handle plural/singular variations (same as cuisine type matching)
    const normalizeForMatching = (text: string): string => {
      return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/s$/, '');
    };
    const normalizedSpecialty = normalizeForMatching(specialty);
    
    // PRIORITY 1: Check metadata fields first (most reliable)
    // Check primaryType, specificType, and types array
    const matchesInMetadata = 
      primaryType.includes(specialty) ||
      specificType.includes(specialty) ||
      types.some(t => t.includes(specialty)) ||
      normalizeForMatching(primaryType).includes(normalizedSpecialty) ||
      normalizeForMatching(specificType).includes(normalizedSpecialty) ||
      types.some(t => normalizeForMatching(t).includes(normalizedSpecialty));
    
    if (matchesInMetadata) {
      // Mark for ranking boost (store on restaurant object for sorting)
      (restaurant as any)._matchesSpecialty = true;
      // Metadata match is strong signal - return true
      // (we'll continue to check other fields for ranking purposes, but metadata match is sufficient)
    }
    
    // PRIORITY 2: Check restaurant name (dish-specific restaurants often have the dish in their name)
    // This is important because dish-specific restaurants often have the dish in their name
    // but their type might just be "japanese_restaurant" (e.g., "Yakitori Imai" has yakitori in name)
    const matchesInName = 
      restaurantName.includes(specialty) ||
      normalizeForMatching(restaurantName).includes(normalizedSpecialty);
    
    if (matchesInName) {
      // Mark for ranking boost
      (restaurant as any)._matchesSpecialty = true;
      // Name match is also a strong signal - return true if we haven't already matched
      if (matchesInMetadata) {
        // Already matched in metadata, continue to check summaries for completeness
      } else {
        // Name match is sufficient - return true
        // (we'll continue to check summaries for ranking purposes, but name match is sufficient)
      }
    }
    
    // PRIORITY 3: Check summaries (less reliable, can have false positives)
    // Only check if metadata and name didn't match, or include for ranking boost
    const matchesInSummaries = 
      summary.includes(specialty) ||
      reviewSummary.includes(specialty) ||
      editorialSummary.includes(specialty) ||
      normalizeForMatching(summary).includes(normalizedSpecialty) ||
      normalizeForMatching(reviewSummary).includes(normalizedSpecialty) ||
      normalizeForMatching(editorialSummary).includes(normalizedSpecialty);
    
    if (matchesInSummaries) {
      // Mark for ranking boost
      (restaurant as any)._matchesSpecialty = true;
    }
    
    // If specialty is specified, it MUST match in at least one of the above (filter, not just rank)
    const matchesSpecialty = matchesInMetadata || matchesInName || matchesInSummaries;
    
    if (!matchesSpecialty) {
      return false; // ❌ Doesn't match the required specialty
    }
    
    // Mark for ranking boost (store on restaurant object for sorting)
    // Already set above, but ensure it's set
    (restaurant as any)._matchesSpecialty = true;
  }
  
  return true; // ✅ At least matches broad cuisine (and specialty if specified)
}

/**
 * Check if restaurant matches a single cuisine type
 */
function matchesSingleCuisineType(restaurant: Restaurant, cuisineType: string): boolean {
  const cuisineKeyword = cuisineType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
  const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
  
  // Get summaries early (needed for special cuisine matching)
  const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
  const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
  const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
  
  // Normalize accents and handle plural/singular variations for matching
  // e.g., "crepes" should match "crepe", "crêpe", "crêperie"
  const normalizeForMatching = (text: string): string => {
    return text
      .normalize('NFD') // Decompose characters with diacritics
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/s$/, ''); // Remove trailing 's' for plural handling
  };
  
  const normalizedCuisineKeyword = normalizeForMatching(cuisineKeyword);
  
  // For "bar" queries, be strict (check before name matching)
  if (cuisineKeyword === 'bar') {
    return primaryType === 'bar' || 
           primaryType === 'night_club' || 
           specificType === 'bar';
  }
  
  // For "coffee shop"/"coffee"/"cafe" queries, only check metadata fields
  // MUST check this BEFORE restaurant name matching to avoid false positives
  // (e.g., "Café Fleur" has "cafe" in name but isn't actually a cafe)
  if (cuisineKeyword === 'coffee shop' || cuisineKeyword === 'coffee' || cuisineKeyword === 'cafe') {
    // Simplified: Check both primaryType and types array equally (no prioritization)
    // Must have 'coffee_shop' or 'cafe' in either primaryType OR types array
    const hasCoffeePrimaryType = primaryType === 'coffee_shop' || primaryType === 'cafe';
    const hasCoffeeInTypes = types.some(t => 
      t === 'coffee_shop' || 
      t === 'cafe' || 
      t.toLowerCase() === 'coffee_shop' || 
      t.toLowerCase() === 'cafe'
    );
    
    return hasCoffeePrimaryType || hasCoffeeInTypes;
  }
  
  // For dessert-related queries (dessert, pastry, cake, pastries, bakery, sweets), only check metadata fields
  // MUST check this BEFORE restaurant name matching to avoid false positives
  // (consistent with coffee/cafe logic)
  if (['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets'].includes(cuisineKeyword)) {
    // Simplified: Check both primaryType and types array equally (no prioritization)
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
  }
  
  // Check restaurant name for dish-specific keywords (e.g., "yakitori", "katsu")
  // This is important because dish-specific restaurants often have the dish in their name
  // but their type might just be "japanese_restaurant"
  // Also check normalized version to handle accents and plurals
  // NOTE: This check happens AFTER coffee/cafe/dessert/bar checks to ensure those use strict metadata-only matching
  if (restaurantName.includes(cuisineKeyword) || 
      normalizeForMatching(restaurantName).includes(normalizedCuisineKeyword)) {
    return true;
  }
  
  // For "asian" queries, match any Asian cuisine type
  // Prioritize metadata fields (more reliable) over summary mentions (can have false positives)
  if (cuisineKeyword === 'asian') {
    // First check metadata fields and restaurant name (strong signals)
    const matchesInMetadata = ASIAN_CUISINES.some(asianCuisine => {
      const normalizedAsianCuisine = normalizeForMatching(asianCuisine);
      return primaryType.includes(asianCuisine) ||
             specificType.includes(asianCuisine) ||
             types.some(t => t.includes(asianCuisine)) ||
             normalizeForMatching(primaryType).includes(normalizedAsianCuisine) ||
             normalizeForMatching(specificType).includes(normalizedAsianCuisine) ||
             types.some(t => normalizeForMatching(t).includes(normalizedAsianCuisine)) ||
             restaurantName.includes(asianCuisine) ||
             normalizeForMatching(restaurantName).includes(normalizedAsianCuisine);
    });
    
    if (matchesInMetadata) {
      return true;
    }
    
    // Only check summaries if metadata didn't match (to avoid false positives from "influence" mentions)
    // Exclude mentions that suggest fusion/influence rather than primary cuisine
    return ASIAN_CUISINES.some(asianCuisine => {
      const normalizedAsianCuisine = normalizeForMatching(asianCuisine);
      
      // Exclude patterns that indicate influence/fusion rather than primary cuisine
      const exclusionPatterns = [
        new RegExp(`${asianCuisine}\\s+(influence|inspired|fusion|style|elements|twist|flair|accent)`, 'i'),
        new RegExp(`(subtle|hint of|hints of|touch of|bit of)\\s+${asianCuisine}`, 'i'),
        new RegExp(`${asianCuisine}/[a-z]+\\s+influence`, 'i') // e.g., "Asian/Japanese influence"
      ];
      
      // Check each summary field
      const summariesToCheck = [summary, reviewSummary, editorialSummary];
      
      for (const summaryText of summariesToCheck) {
        if (!summaryText) continue;
        
        // Skip if it matches exclusion patterns (suggests fusion/influence, not primary cuisine)
        if (exclusionPatterns.some(pattern => pattern.test(summaryText))) {
          continue;
        }
        
        // Check for positive signals - cuisine mentioned with restaurant/cuisine context
        const positiveContextPatterns = [
          new RegExp(`${asianCuisine}\\s+(restaurant|cuisine|food|kitchen|eatery|dining|bistro|cafe)`, 'i'),
          new RegExp(`(restaurant|cuisine|food|kitchen|eatery|dining|bistro|cafe)\\s+${asianCuisine}`, 'i'),
          new RegExp(`serves\\s+${asianCuisine}`, 'i'),
          new RegExp(`${asianCuisine}\\s+specialt`, 'i'),
          new RegExp(`\\b${asianCuisine}\\s+(dish|dishes|menu|chef|chefs)`, 'i')
        ];
        
        if (positiveContextPatterns.some(pattern => pattern.test(summaryText))) {
          return true;
        }
        
        // Also match if cuisine appears as standalone word (but only if not excluded above)
        const cuisineRegex = new RegExp(`\\b${asianCuisine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const normalizedCuisineRegex = new RegExp(`\\b${normalizedAsianCuisine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        
        if (cuisineRegex.test(summaryText) || normalizedCuisineRegex.test(summaryText)) {
          return true;
        }
      }
      
      return false;
    });
  }
  
  // Check restaurant summary/description for mentions (helps with dish-specific searches)
  // Summaries already defined at top of function - reuse them
  
  if (summary.includes(cuisineKeyword) || 
      reviewSummary.includes(cuisineKeyword) || 
      editorialSummary.includes(cuisineKeyword) ||
      normalizeForMatching(summary).includes(normalizedCuisineKeyword) ||
      normalizeForMatching(reviewSummary).includes(normalizedCuisineKeyword) ||
      normalizeForMatching(editorialSummary).includes(normalizedCuisineKeyword)) {
    return true;
  }
  
  // Standard type matching (also check normalized versions)
  return specificType.includes(cuisineKeyword) ||
         primaryType.includes(cuisineKeyword) ||
         types.some(t => t.includes(cuisineKeyword)) ||
         normalizeForMatching(specificType).includes(normalizedCuisineKeyword) ||
         normalizeForMatching(primaryType).includes(normalizedCuisineKeyword) ||
         types.some(t => normalizeForMatching(t).includes(normalizedCuisineKeyword));
}

/**
 * Check if restaurant matches price criteria
 */
function matchesPrice(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.priceLevel || keywords.priceLevel === 'any') {
    return true;
  }

  const priceDisplay = restaurant.price_display;
  
  if (!priceDisplay || priceDisplay === 'N/A') {
    if (keywords.priceLevel === 'budget' || keywords.priceLevel === 'luxury') {
      return false; // Budget and luxury require explicit price information
    }
    return true;
  }

  switch (keywords.priceLevel) {
    case 'budget':
      return priceDisplay === '$' || priceDisplay === '$$';
    case 'moderate':
      return priceDisplay === '$$' || priceDisplay === '$$$';
    case 'upscale':
      return priceDisplay === '$$$' || priceDisplay === '$$$$';
    case 'luxury':
      return priceDisplay === '$$$$'; // Only $$$$ restaurants for luxury/expensive queries
    default:
      return true;
  }
}

/**
 * Check if restaurant matches amenities criteria
 */
function matchesAmenities(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (keywords.needsTakeout && !restaurant.google_data.takeout) {
    return false;
  }

  if (keywords.needsCoffee) {
    const servesCoffee = restaurant.google_data.servesCoffee;
    const isCafe = restaurant.google_data.types?.includes('cafe');
    if (!servesCoffee && !isCafe) {
      return false;
    }
  }

  // Dessert/sweets filtering is now handled in matchesCuisine with strict metadata-only matching
  // (consistent with coffee/cafe logic)

  return true;
}

/**
 * Check if restaurant matches meal type criteria
 */
function matchesMealType(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.mealType) {
    return true;
  }

  const mealType = keywords.mealType.toLowerCase();
  
  if (mealType === 'brunch') {
    // Basic check: restaurant must serve brunch
    if (!restaurant.google_data.servesBrunch) {
      return false;
    }
    
    // Strict brunch filtering (similar to coffee shop/bakery logic)
    // Prioritize metadata fields first, then use fallback criteria
    
    // Primary criteria: Check metadata indicators (most reliable)
    const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
    const hasBrunchRestaurantType = types.includes('brunch_restaurant');
    const hasWeekendBrunchTag = restaurant.occasion_tags?.includes('weekend_brunch');
    
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
    
    const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
    const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
    const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
    const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
    
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
  }
  
  if (mealType === 'breakfast') {
    return restaurant.google_data.servesBreakfast === true;
  }
  
  if (mealType === 'lunch') {
    return restaurant.google_data.servesLunch === true;
  }
  
  if (mealType === 'dinner') {
    return restaurant.google_data.servesDinner === true;
  }
  
  return true;
}

/**
 * NEW: Check if restaurant matches vibe criteria using enriched tags
 */
function matchesVibe(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.vibeKeywords || keywords.vibeKeywords.length === 0) {
    return true;
  }

  // If requiresInstagrammable is true, vibe keywords are optional (just additional context)
  // Don't filter out restaurants that don't match vibe keywords if the main requirement is instagrammable
  if (keywords.requiresInstagrammable) {
    // Vibe keywords are nice-to-have but not required when instagrammable is the main filter
    return true;
  }

  const restaurantVibes = restaurant.vibe_tags || [];
  
  // Check if restaurant has ANY of the desired vibes
  return keywords.vibeKeywords.some(vibe => 
    restaurantVibes.includes(vibe)
  );
}

/**
 * NEW: Check if restaurant matches occasion criteria using enriched tags
 */
function matchesOccasion(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.occasionType) {
    return true;
  }

  const restaurantOccasions = restaurant.occasion_tags || [];
  
  // Direct match
  if (restaurantOccasions.includes(keywords.occasionType)) {
    return true;
  }
  
  // Flexible matching for business occasions:
  // If query is for "business_lunch" and restaurant has "business_dinner" tag AND serves lunch, it's suitable
  if (keywords.occasionType === 'business_lunch') {
    const hasBusinessDinner = restaurantOccasions.includes('business_dinner');
    const servesLunch = restaurant.google_data.servesLunch === true;
    if (hasBusinessDinner && servesLunch) {
      return true;
    }
  }
  
  // If query is for "business_dinner" and restaurant has "business_lunch" tag AND serves dinner, it's suitable
  if (keywords.occasionType === 'business_dinner') {
    const hasBusinessLunch = restaurantOccasions.includes('business_lunch');
    const servesDinner = restaurant.google_data.servesDinner === true;
    if (hasBusinessLunch && servesDinner) {
      return true;
    }
  }
  
  return false;
}

/**
 * NEW: Check if restaurant matches noise preference using enriched tags
 */
function matchesNoiseLevel(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.noisePreference) {
    return true;
  }

  const noiseLevel = restaurant.noise_level;
  
  if (keywords.noisePreference === 'quiet') {
    return noiseLevel === 'quiet_ambiance' || noiseLevel === 'moderate_noise';
  }
  
  // 'any' noise preference matches all
  return true;
}

/**
 * NEW: Check if restaurant is instagrammable
 */
function matchesInstagrammable(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.requiresInstagrammable) {
    return true;
  }

  const specialFeatures = restaurant.special_features || [];
  return specialFeatures.includes('instagrammable');
}

/**
 * NEW: Check if restaurant has Michelin recognition
 */
function matchesMichelin(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.requiresMichelin) {
    return true;
  }

  const accolades = restaurant.accolades_tags || [];
  return accolades.some(tag => tag.includes('michelin'));
}

/**
 * Check if restaurant matches special features requirements
 */
function matchesSpecialFeatures(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.specialFeatures || keywords.specialFeatures.length === 0) {
    return true;
  }

  const restaurantFeatures = restaurant.special_features || [];
  
  // Check if restaurant has ANY of the required special features
  return keywords.specialFeatures.some(feature => 
    restaurantFeatures.includes(feature)
  );
}

/**
 * NEW: Check if restaurant is one of Cynthia's picks
 */
function matchesCynthiasPick(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.requiresCynthiasPick) {
    return true;
  }

  return restaurant.cynthias_pick === true;
}

/**
 * Check if a query is a city-prompt-item (predefined prompt that should be handled deterministically)
 */
export function isCityPromptItem(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  
  // List of city prompt patterns (matching CITY_PROMPTS from Chatbox component)
  const cityPromptPatterns = [
    "cynthia's favorites",
    "cynthias favorites",
    "sushi restaurants loved by locals",
    "coffee shops",
    "traditional japanese food",
    "brunch restaurants",
    "romantic dinner",
    "best thai restaurants",
    "traditional french fare",
    "galettes and crepes",
    "traditional korean food"
  ];
  
  // Check if query matches any prompt pattern (allowing for city suffix)
  return cityPromptPatterns.some(pattern => {
    const patternLower = pattern.toLowerCase();
    // Match exact pattern or pattern + " in [city]"
    return lowerQuery === patternLower || 
           lowerQuery.startsWith(patternLower + ' in ') ||
           lowerQuery.endsWith(' ' + patternLower) ||
           lowerQuery.includes(' ' + patternLower + ' ');
  });
}

/**
 * Pre-filter restaurants based on natural language query
 * Returns filtered and sorted restaurants using enriched tags
 * @param query - The user's query string
 * @param keywords - Required pre-parsed keywords from Claude API
 */
export function preFilterRestaurants(query: string, keywords: ExtractedKeywords): Restaurant[] {
  const filterStartTime = Date.now();
  try {
    console.log('Pre-filtering restaurants for query:', query);
    
    // Use provided keywords (must be provided - no fallback)
    const extractedKeywords = keywords;
    
    // OPTIMIZATION: Filter by city FIRST to dramatically reduce dataset size
    // This is the most selective filter and should be applied early
    const cityFilterStartTime = Date.now();
    let restaurantsToFilter = getRestaurants();
    
    if (extractedKeywords.city) {
      restaurantsToFilter = getRestaurantsByCity(extractedKeywords.city);
      const cityFilterTime = Date.now() - cityFilterStartTime;
      console.log(`[Performance] City filtering took ${cityFilterTime}ms`);
    }
    
    if (restaurantsToFilter.length === 0) {
      console.warn('No restaurants data available after city filtering');
      return [];
    }
    
    // OPTIMIZATION: Apply filters in order of selectivity
    // Most selective filters first to reduce iterations
    const filterStart = Date.now();
    let filteredRestaurants = restaurantsToFilter.filter(restaurant => {
      try {
        // Order filters by selectivity (most selective first):
        // 1. Location (already filtered by city, but check neighborhood/borough)
        if (!matchesLocation(restaurant, extractedKeywords)) return false;
        
        // 2. Cynthia's pick (very selective boolean)
        if (!matchesCynthiasPick(restaurant, extractedKeywords)) return false;
        
        // 3. Cuisine (selective, reduces dataset significantly)
        if (!matchesCuisine(restaurant, extractedKeywords)) return false;
        
        // 4. Meal type (moderately selective)
        if (!matchesMealType(restaurant, extractedKeywords)) return false;
        
        // 5. Price (moderately selective)
        if (!matchesPrice(restaurant, extractedKeywords)) return false;
        
        // 6. Special requirements (selective booleans)
        if (!matchesInstagrammable(restaurant, extractedKeywords)) return false;
        if (!matchesMichelin(restaurant, extractedKeywords)) return false;
        
        // 7. Special features (selective, array checks)
        if (!matchesSpecialFeatures(restaurant, extractedKeywords)) return false;
        
        // 8. Amenities (less selective)
        if (!matchesAmenities(restaurant, extractedKeywords)) return false;
        
        // 9. Vibe/Occasion/Noise (less selective, array checks)
        if (!matchesVibe(restaurant, extractedKeywords)) return false;
        if (!matchesOccasion(restaurant, extractedKeywords)) return false;
        if (!matchesNoiseLevel(restaurant, extractedKeywords)) return false;
        
        return true;
      } catch (error) {
        console.warn('Error filtering restaurant:', error);
        return false;
      }
    });

    const filterTime = Date.now() - filterStart;
    console.log(`[Performance] Filtering ${restaurantsToFilter.length} restaurants took ${filterTime}ms`);
    console.log(`Filtered from ${restaurantsToFilter.length} to ${filteredRestaurants.length} restaurants`);

    // Sort using tiered ranking system
    const sortStart = Date.now();
    const sortedRestaurants = sortByTieredRanking(filteredRestaurants, extractedKeywords);
    const sortTime = Date.now() - sortStart;
    console.log(`[Performance] Sorting ${filteredRestaurants.length} restaurants took ${sortTime}ms`);

    const totalTime = Date.now() - filterStartTime;
    console.log(`[Performance] Total preFilterRestaurants took ${totalTime}ms`);
    console.log(`Returning all ${sortedRestaurants.length} matching restaurants`);
    return sortedRestaurants;
  } catch (error) {
    console.error('Error in preFilterRestaurants:', error);
    return [];
  }
}

// Filter service ready for use
// Filter service ready for use