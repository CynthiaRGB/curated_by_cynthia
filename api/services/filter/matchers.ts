import type { ExtractedKeywords, Restaurant } from '../../../src/types/restaurant';
import { ASIAN_CUISINES } from './lexicons.js';

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
      // Examples: "Shibuya" (Tokyo), "Gangnam District" (Seoul), "7th arrondissement" (Paris), "West Village" (NYC)
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
    const restaurantBorough = restaurant.borough?.toLowerCase();
    
    // Handle both single borough and array of boroughs
    if (Array.isArray(keywords.borough)) {
      // Multiple boroughs: match if restaurant is in ANY of them (union)
      hasBoroughMatch = keywords.borough.some(boroughKeyword => {
        const keyword = boroughKeyword.toLowerCase();
        return restaurantBorough === keyword;
      });
    } else {
      // Single borough
      const boroughKeyword = keywords.borough.toLowerCase();
      hasBoroughMatch = restaurantBorough === boroughKeyword;
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
 * Check if restaurant matches landmark criteria
 * Uses flexible matching - checks landmarks field, summaries, and address
 */
function matchesLandmark(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.landmark) {
    return true; // No landmark filter
  }

  // If neighborhood or borough is specified, landmark is ignored (neighborhood/borough takes precedence)
  if (keywords.neighborhood || keywords.borough) {
    return true; // Skip landmark matching when neighborhood/borough is present
  }

  const landmarkKeywords = Array.isArray(keywords.landmark) 
    ? keywords.landmark.map(l => l.toLowerCase())
    : [keywords.landmark.toLowerCase()];

  // Get all text fields to search
  const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
  const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
  const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
  const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
  
  // Combine all text fields for searching
  const allText = `${summary} ${reviewSummary} ${editorialSummary} ${address}`;

  // Check if any landmark keyword matches in any source
  for (const landmarkKeyword of landmarkKeywords) {
    // Check landmarks field (if present)
    const landmarks = restaurant.google_data.landmarks || [];
    const matchesInLandmarksField = landmarks.some(landmark => {
      const landmarkName = landmark.displayName?.text?.toLowerCase() || '';
      return landmarkName.includes(landmarkKeyword) || landmarkKeyword.includes(landmarkName);
    });

    // Check summaries and address (flexible matching)
    const matchesInText = allText.includes(landmarkKeyword);

    // If either matches, this landmark keyword is satisfied
    if (matchesInLandmarksField || matchesInText) {
      return true; // At least one landmark matches
    }
  }

  // None of the landmark keywords matched
  return false;
}

/**
 * Check if restaurant matches cuisine criteria
 */
function matchesCuisine(restaurant: Restaurant, keywords: ExtractedKeywords, query?: string): boolean {
  if (!keywords.cuisineType && !keywords.cuisineSpecialty) {
    return true; // No cuisine filter
  }
  
  // Track matches independently for OR logic and sorting
  let matchesCuisineType = false;
  let matchesSpecialty = false;
  
  // Check broad cuisine
  if (keywords.cuisineType) {
    // Normalize cuisineType to array for consistent handling
    const cuisineTypesToMatch = Array.isArray(keywords.cuisineType) 
      ? keywords.cuisineType 
      : [keywords.cuisineType];
    
    // SPECIAL CASE: For "brunch_restaurant" cuisine type, use prioritized logic
    // Include restaurants with brunch_restaurant type OR servesBrunch/weekend_brunch
    // Check if any of the cuisine types is brunch_restaurant
    if (cuisineTypesToMatch.some(ct => ct.toLowerCase() === 'brunch_restaurant')) {
      const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
      const hasBrunchRestaurantType = types.includes('brunch_restaurant') ||
                                      restaurant.google_data.primaryType?.toLowerCase() === 'brunch_restaurant';
      const servesBrunch = restaurant.google_data.servesBrunch === true;
      const hasWeekendBrunchTag = restaurant.occasion_tags?.includes('weekend_brunch') || false;
      
      // Accept if it has brunch_restaurant type OR serves brunch OR has weekend_brunch tag
      if (hasBrunchRestaurantType || servesBrunch || hasWeekendBrunchTag) {
        matchesCuisineType = true;
      } else {
        // Also check for brunch mentions in name/summaries (fallback)
        const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
        const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
        const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
        const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
        
        if (restaurantName.includes('brunch') ||
            summary.includes('brunch') ||
            reviewSummary.includes('brunch') ||
            editorialSummary.includes('brunch')) {
          matchesCuisineType = true;
        }
      }
    } else {
      // Check if restaurant matches ANY of the cuisine types (OR logic)
      // cuisineTypesToMatch is already normalized to array above
      matchesCuisineType = cuisineTypesToMatch.some(cuisineType => {
        return matchesSingleCuisineType(restaurant, cuisineType, query);
      });
    }
    
    // Set flag for sorting (will be used if specialty doesn't match)
    if (matchesCuisineType) {
      (restaurant as any)._matchesCuisineType = true;
    }
  }
  
  // Check specific specialty
  // Prioritize metadata fields (more reliable) over text mentions (can have false positives)
  // Follows same prioritization pattern as matchesSingleCuisineType
  // Supports arrays for multiple dishes (OR logic - match if restaurant has ANY of the specialties)
  if (keywords.cuisineSpecialty) {
    // Normalize cuisineSpecialty to array for consistent handling
    const specialtiesToMatch = Array.isArray(keywords.cuisineSpecialty) 
      ? keywords.cuisineSpecialty 
      : [keywords.cuisineSpecialty];
    
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
    
    // Check if restaurant matches ANY of the specialties (OR logic)
    matchesSpecialty = specialtiesToMatch.some(specialty => {
      const specialtyLower = specialty.toLowerCase();
      const normalizedSpecialty = normalizeForMatching(specialtyLower);
      
      // PRIORITY 1: Check metadata fields first (most reliable)
      // Check primaryType, specificType, and types array
      const matchesInMetadata = 
        primaryType.includes(specialtyLower) ||
        specificType.includes(specialtyLower) ||
        types.some(t => t.includes(specialtyLower)) ||
        normalizeForMatching(primaryType).includes(normalizedSpecialty) ||
        normalizeForMatching(specificType).includes(normalizedSpecialty) ||
        types.some(t => normalizeForMatching(t).includes(normalizedSpecialty));
      
      // PRIORITY 2: Check restaurant name (dish-specific restaurants often have the dish in their name)
      // This is important because dish-specific restaurants often have the dish in their name
      // but their type might just be "japanese_restaurant" (e.g., "Yakitori Imai" has yakitori in name)
      const matchesInName = 
        restaurantName.includes(specialtyLower) ||
        normalizeForMatching(restaurantName).includes(normalizedSpecialty);
      
      // PRIORITY 3: Check summaries (less reliable, can have false positives)
      const matchesInSummaries = 
        summary.includes(specialtyLower) ||
        reviewSummary.includes(specialtyLower) ||
        editorialSummary.includes(specialtyLower) ||
        normalizeForMatching(summary).includes(normalizedSpecialty) ||
        normalizeForMatching(reviewSummary).includes(normalizedSpecialty) ||
        normalizeForMatching(editorialSummary).includes(normalizedSpecialty);
      
      // If specialty matches in any field, return true (OR logic)
      return matchesInMetadata || matchesInName || matchesInSummaries;
    });
    
    if (matchesSpecialty) {
      // Mark for ranking boost (store on restaurant object for sorting)
      (restaurant as any)._matchesSpecialty = true;
    }
  }
  
  // OR logic: return true if either cuisineType OR cuisineSpecialty matches
  // If only one is specified, it must match
  if (keywords.cuisineType && keywords.cuisineSpecialty) {
    // Both specified: use OR logic
    return matchesCuisineType || matchesSpecialty;
  } else if (keywords.cuisineType) {
    // Only cuisineType specified: must match
    return matchesCuisineType;
  } else {
    // Only cuisineSpecialty specified: must match
    return matchesSpecialty;
  }
}

/**
 * Check if restaurant matches a single cuisine type
 * @param query - Optional query string to check if "restaurant" is explicitly mentioned
 */
function matchesSingleCuisineType(restaurant: Restaurant, cuisineType: string, query?: string): boolean {
  const cuisineKeyword = cuisineType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
  const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
  
  // Get summaries early (needed for special cuisine matching)
  const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
  const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
  const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
  
  // Check if query explicitly says "restaurant" (to exclude cafes/bakeries)
  const queryExplicitlySaysRestaurant = query ? query.toLowerCase().includes('restaurant') : false;
  
  // Check if this establishment is a cafe/bakery/coffee shop
  const isCafeOrBakery = primaryType === 'cafe' || 
                         primaryType === 'coffee_shop' || 
                         primaryType === 'bakery' ||
                         types.some(t => t === 'cafe' || t === 'coffee_shop' || t === 'bakery');
  
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
  
  // For "barbecue"/"BBQ" queries, check metadata fields (types array)
  // This ensures "barbecue" matches "barbecue_restaurant" in types array
  if (cuisineKeyword === 'barbecue' || cuisineKeyword === 'bbq') {
    const hasBarbecuePrimaryType = primaryType === 'barbecue_restaurant';
    const hasBarbecueInTypes = types.some(t => 
      t === 'barbecue_restaurant' || 
      t.toLowerCase() === 'barbecue_restaurant' ||
      t.includes('barbecue')
    );
    
    return hasBarbecuePrimaryType || hasBarbecueInTypes;
  }
  
  // For "coffee shop"/"coffee"/"cafe"/"coffee_shop"/"cafeteria"/"cafeteira" queries, only check metadata fields
  // MUST check this BEFORE restaurant name matching to avoid false positives
  // (e.g., "Café Fleur" has "cafe" in name but isn't actually a cafe)
  // Support both space and underscore variants, plus related types
  const coffeeRelatedKeywords = ['coffee shop', 'coffee_shop', 'coffee', 'cafe', 'cafeteria', 'cafeteira'];
  if (coffeeRelatedKeywords.includes(cuisineKeyword)) {
    // Check both primaryType and types array equally (no prioritization)
    // Must have any coffee-related type in either primaryType OR types array
    const coffeeTypes = ['coffee_shop', 'cafe', 'cafeteria', 'cafeteira'];
    const hasCoffeePrimaryType = coffeeTypes.some(ct => primaryType === ct);
    const hasCoffeeInTypes = types.some(t => 
      coffeeTypes.some(ct => t === ct || t.toLowerCase() === ct)
    );
    
    return hasCoffeePrimaryType || hasCoffeeInTypes;
  }
  
  // For dessert-related queries (dessert, pastry, cake, pastries, bakery, sweets), only check metadata fields
  // MUST check this BEFORE restaurant name matching to avoid false positives
  // (consistent with coffee/cafe logic)
  // Support both individual keywords and array-based matching
  const dessertRelatedKeywords = ['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets', 
                                  'dessert_shop', 'pastry_shop', 'confectionery'];
  if (dessertRelatedKeywords.includes(cuisineKeyword)) {
    // Check both primaryType and types array equally (no prioritization)
    // Must have dessert-related type in either primaryType OR types array
    const dessertTypes = ['bakery', 'dessert_shop', 'ice_cream_shop', 'pastry_shop', 'confectionery', 'dessert_restaurant'];
    const hasDessertPrimaryType = dessertTypes.some(dt => primaryType === dt);
    const hasDessertInTypes = types.some(t => 
      dessertTypes.some(dt => t === dt || t.toLowerCase() === dt)
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
  // BUT: If query explicitly says "restaurant" and this is a cafe/bakery, skip summary matching
  // (only match based on metadata to avoid false positives like "Korean bakery" matching "Korean restaurant")
  if (!(queryExplicitlySaysRestaurant && isCafeOrBakery)) {
    if (summary.includes(cuisineKeyword) || 
        reviewSummary.includes(cuisineKeyword) || 
        editorialSummary.includes(cuisineKeyword) ||
        normalizeForMatching(summary).includes(normalizedCuisineKeyword) ||
        normalizeForMatching(reviewSummary).includes(normalizedCuisineKeyword) ||
        normalizeForMatching(editorialSummary).includes(normalizedCuisineKeyword)) {
      return true;
    }
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

  // Dessert/sweets filtering is now handled in matchesCuisine with strict metadata-only matching

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
    // If servesBrunch is true, that's a strong signal - accept it
    if (restaurant.google_data.servesBrunch === true) {
      return true;
    }
    
    // If servesBrunch is not explicitly true, check other indicators
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
 * Check if restaurant matches vibe criteria using enriched tags.
 */
function matchesVibeInternal(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.vibeKeywords || keywords.vibeKeywords.length === 0) {
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
 * Supports arrays for interchangeable concepts (e.g., ["date_night", "anniversary"])
 */
function matchesOccasion(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.occasionType) {
    return true;
  }

  const restaurantOccasions = restaurant.occasion_tags || [];
  
  // Normalize occasionType to array for consistent handling
  const occasionTypesToMatch = Array.isArray(keywords.occasionType) 
    ? keywords.occasionType 
    : [keywords.occasionType];
  
  // Check if restaurant matches ANY of the occasion types (OR logic)
  return occasionTypesToMatch.some(occasionType => {
    // Direct match
    if (restaurantOccasions.includes(occasionType)) {
      return true;
    }
    
    // Flexible matching for business occasions:
    // If query is for "business_lunch" and restaurant has "business_dinner" tag AND serves lunch, it's suitable
    if (occasionType === 'business_lunch') {
      const hasBusinessDinner = restaurantOccasions.includes('business_dinner');
      const servesLunch = restaurant.google_data.servesLunch === true;
      if (hasBusinessDinner && servesLunch) {
        return true;
      }
    }
    
    // If query is for "business_dinner" and restaurant has "business_lunch" tag AND serves dinner, it's suitable
    if (occasionType === 'business_dinner') {
      const hasBusinessLunch = restaurantOccasions.includes('business_lunch');
      const servesDinner = restaurant.google_data.servesDinner === true;
      if (hasBusinessLunch && servesDinner) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * NEW: Check if restaurant matches noise preference using enriched tags
 */
function matchesNoiseLevel(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.noiseLevel) {
    return true;
  }

  const restaurantNoiseLevel = restaurant.noise_level;
  
  // Direct match - noiseLevel from keywords should match restaurant's noise_level
  return restaurantNoiseLevel === keywords.noiseLevel;
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

export {
  matchesLocation,
  matchesLandmark,
  matchesCuisine,
  matchesMealType,
  matchesPrice,
  matchesAmenities,
  matchesVibeInternal,
  matchesOccasion,
  matchesNoiseLevel,
  matchesMichelin,
  matchesSpecialFeatures,
  matchesCynthiasPick,
};
