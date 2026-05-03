import type { ExtractedKeywords, Restaurant } from '../../../src/types/restaurant';

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

  // Normalize cuisineType to array for consistent handling
  const cuisineTypesToMatch = Array.isArray(keywords.cuisineType) 
    ? keywords.cuisineType.map(ct => ct.toLowerCase())
    : [keywords.cuisineType.toLowerCase()];
  
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];

  const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
  const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
  const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
  
  // SPECIAL CASE: For brunch_restaurant, prioritize by brunch_restaurant type
  if (cuisineTypesToMatch.includes('brunch_restaurant')) {
    // Tier 1: Has brunch_restaurant in primaryType or types array (highest priority)
    if (primaryType === 'brunch_restaurant' || types.includes('brunch_restaurant')) {
      return 1;
    }
    
    // Tier 2: Has servesBrunch=true OR weekend_brunch tag (second priority)
    const servesBrunch = restaurant.google_data.servesBrunch === true;
    const hasWeekendBrunchTag = restaurant.occasion_tags?.includes('weekend_brunch') || false;
    if (servesBrunch || hasWeekendBrunchTag) {
      return 2;
    }
    
    // Tier 3: Mentions brunch in name/summaries (lowest priority for brunch queries)
    if (restaurantName.includes('brunch') ||
        summary.includes('brunch') ||
        reviewSummary.includes('brunch')) {
      return 3;
    }
    
    // Should not reach here if matchesCuisine is working correctly
    return 3;
  }
  
  // Check if any cuisine type matches (for arrays, check all types)
  // Tier 1: Matches primaryType, specificType, or restaurant name
  const matchesTier1 = cuisineTypesToMatch.some(cuisineKeyword => 
    primaryType.includes(cuisineKeyword) || 
    specificType.includes(cuisineKeyword) ||
    restaurantName.includes(cuisineKeyword)
  );
  
  if (matchesTier1) {
    return 1;
  }

  // Tier 2: Matches types array or appears in summaries
  const matchesTier2 = cuisineTypesToMatch.some(cuisineKeyword =>
    types.some(t => t.includes(cuisineKeyword)) ||
    summary.includes(cuisineKeyword) ||
    reviewSummary.includes(cuisineKeyword)
  );
  
  if (matchesTier2) {
    return 2;
  }

  // Tier 3: All other restaurants
  return 3;
}

/**
 * Sort restaurants using tiered ranking system
 */
export function sortByTieredRanking(restaurants: Restaurant[], keywords: ExtractedKeywords): Restaurant[] {
  return restaurants.sort((a, b) => {
    try {
      // PRIORITY 1: Specialty matches first (if user asked for specific dish)
      if (keywords.cuisineSpecialty) {
        const aMatchesSpecialty = (a as any)._matchesSpecialty || false;
        const bMatchesSpecialty = (b as any)._matchesSpecialty || false;
        
        if (aMatchesSpecialty && !bMatchesSpecialty) return -1;
        if (!aMatchesSpecialty && bMatchesSpecialty) return 1;
      }
      
      // PRIORITY 2: CuisineType matches (if both cuisineType and cuisineSpecialty are specified)
      // Only check cuisineType if specialty comparison didn't decide the order
      if (keywords.cuisineType && keywords.cuisineSpecialty) {
        const aMatchesSpecialty = (a as any)._matchesSpecialty || false;
        const bMatchesSpecialty = (b as any)._matchesSpecialty || false;
        
        // Only compare cuisineType if both have same specialty status
        if (aMatchesSpecialty === bMatchesSpecialty) {
          const aMatchesCuisineType = (a as any)._matchesCuisineType || false;
          const bMatchesCuisineType = (b as any)._matchesCuisineType || false;
          
          // CuisineType matches come before non-cuisineType matches
          if (aMatchesCuisineType && !bMatchesCuisineType) return -1;
          if (!aMatchesCuisineType && bMatchesCuisineType) return 1;
        }
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
