// Client-side filter service for Curated by Cynthia
// Pre-filters restaurants before sending to Claude API for smart ranking

import { Restaurant, ExtractedKeywords } from '../types/restaurant';
import restaurantData from '../data/google_enriched_restaurants_311_clean.json';

// Get restaurants from the data
const restaurants: Restaurant[] = (restaurantData as any).places || [];

// Cuisine types to match against
const CUISINE_TYPES = [
  'italian', 'japanese', 'french', 'korean', 'chinese', 'mexican', 'thai', 
  'vietnamese', 'indian', 'american', 'ramen', 'sushi', 'pizza', 'burger', 
  'bakery', 'cafe', 'dessert', 'seafood', 'steak', 'bbq', 'mediterranean',
  'middle eastern', 'latin', 'spanish', 'greek', 'turkish', 'ethiopian',
  'caribbean', 'soul food', 'southern', 'tex-mex', 'fusion', 'vegetarian',
  'vegan', 'healthy', 'fast food', 'fine dining', 'bar', 'drink', 'drinks', 
  'cake', 'bakeries', 'sweets', 'galettes', 'crepes', 'coffee shop'
];

// Borough names to match
const BOROUGHS = [
  'brooklyn', 'manhattan', 'queens', 'bronx', 'staten island',
  'bk', 'manhattan', 'queens', 'the bronx'
];

// Meal types
const MEAL_TYPES = ['breakfast', 'brunch', 'lunch', 'dinner', 'late night', 'late-night'];

// Vibe keywords (for Claude, not filtering)
const VIBE_KEYWORDS = [
  'romantic', 'cozy', 'casual', 'lively', 'quiet', 'trendy', 'fancy',
  'intimate', 'vibrant', 'chill', 'upscale', 'laid-back', 'elegant',
  'hip', 'cool', 'warm', 'friendly', 'sophisticated', 'rustic',
  'modern', 'traditional', 'authentic', 'charming', 'bustling'
];

/**
 * Extract structured keywords from natural language queries
 * @param query - User's natural language query
 * @returns ExtractedKeywords object with structured data
 */
export function extractKeywords(query: string): ExtractedKeywords {
  const lowerQuery = query.toLowerCase();
  const keywords: ExtractedKeywords = {
    vibeKeywords: []
  };

  // Extract location using regex
  const locationMatch = lowerQuery.match(/in ([\w\s]+)/);
  if (locationMatch) {
    const location = locationMatch[1].trim();
    
    // Check if it's a borough
    const boroughMatch = BOROUGHS.find(borough => 
      location.includes(borough) || borough.includes(location)
    );
    if (boroughMatch) {
      keywords.borough = boroughMatch;
    } else {
      // Assume it's a neighborhood
      keywords.neighborhood = location;
    }
  }

  // Check for city mentions
  if (lowerQuery.includes('nyc') || lowerQuery.includes('new york city') || lowerQuery.includes('new york')) {
    keywords.city = 'nyc';
  } else if (lowerQuery.includes('tokyo')) {
    keywords.city = 'tokyo';
  } else if (lowerQuery.includes('seoul')) {
    keywords.city = 'seoul';
  } else if (lowerQuery.includes('paris')) {
    keywords.city = 'paris';
  }

  // Extract meal type
  const mealMatch = MEAL_TYPES.find(meal => 
    lowerQuery.includes(meal)
  );
  if (mealMatch) {
    keywords.mealType = mealMatch as any;
  }

  // Extract cuisine type (can coexist with meal type)
  // Sort by length (longest first) to prioritize specific matches like "coffee shop" over "coffee"
  const sortedCuisineTypes = [...CUISINE_TYPES].sort((a, b) => b.length - a.length);
  const cuisineMatch = sortedCuisineTypes.find(cuisine => 
    lowerQuery.includes(cuisine)
  );
  if (cuisineMatch) {
    keywords.cuisineType = cuisineMatch;
  }

  // Extract price preference
  if (lowerQuery.includes('cheap') || lowerQuery.includes('budget') || lowerQuery.includes('inexpensive')) {
    keywords.priceLevel = 'budget';
  } else if (lowerQuery.includes('expensive') || lowerQuery.includes('fancy') || 
             lowerQuery.includes('upscale') || lowerQuery.includes('fine dining')) {
    keywords.priceLevel = 'upscale';
  } else if (lowerQuery.includes('moderate') || lowerQuery.includes('mid-range')) {
    keywords.priceLevel = 'moderate';
  }

  // Extract amenities
  if (lowerQuery.includes('takeout') || lowerQuery.includes('to go') || lowerQuery.includes('delivery')) {
    keywords.needsTakeout = true;
  }
  if (lowerQuery.includes('coffee')) {
    keywords.needsCoffee = true;
  }

  // Extract vibe keywords (for Claude, not filtering)
  keywords.vibeKeywords = VIBE_KEYWORDS.filter(vibe => 
    lowerQuery.includes(vibe)
  );

  console.log('Extracted keywords:', keywords);
  console.log('Query was:', query);
  return keywords;
}

/**
 * Calculate quality score for a restaurant
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns Quality score (higher is better)
 */
function calculateQualityScore(restaurant: Restaurant, keywords: ExtractedKeywords): number {
  const rating = restaurant.google_data.rating || 0;
  const reviewCount = restaurant.google_data.userRatingCount || 0;
  
  // Base formula: rating × log10(reviewCount + 1)
  const baseScore = rating * Math.log10(reviewCount + 1);
  
  // Apply Cynthia's pick boost (1.5x)
  const cynthiaMultiplier = restaurant.cynthias_pick ? 1.5 : 1.0;
  
  return baseScore * cynthiaMultiplier;
}

/**
 * Calculate tier for restaurant based on cuisine type matching
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns Tier number (1, 2, or 3)
 */
function calculateTier(restaurant: Restaurant, keywords: ExtractedKeywords): number {
  if (!keywords.cuisineType) {
    return 3; // No cuisine filter, all restaurants in tier 3
  }

  const cuisineKeyword = keywords.cuisineType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];

  // Tier 1: Matches primaryType or specificType
  if (primaryType.includes(cuisineKeyword) || specificType.includes(cuisineKeyword)) {
    return 1;
  }

  // Tier 2: Matches types array
  if (types.some(t => t.includes(cuisineKeyword))) {
    return 2;
  }

  // Tier 3: All other restaurants
  return 3;
}

/**
 * Sort restaurants using tiered ranking system
 * @param restaurants - Array of restaurants to sort
 * @param keywords - Extracted keywords
 * @returns Sorted array of restaurants
 */
function sortByTieredRanking(restaurants: Restaurant[], keywords: ExtractedKeywords): Restaurant[] {
  return restaurants.sort((a, b) => {
    try {
      const tierA = calculateTier(a, keywords);
      const tierB = calculateTier(b, keywords);
      
      // First sort by tier (1 > 2 > 3)
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
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches location
 */
function matchesLocation(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.neighborhood && !keywords.borough && !keywords.city) {
    return true; // No location filter
  }

  // Check neighborhood match
  if (keywords.neighborhood) {
    const neighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
    const address = restaurant.google_data.formattedAddress?.toLowerCase() || '';
    const name = restaurant.google_data.displayName.text.toLowerCase();
    const neighborhoodKeyword = keywords.neighborhood.toLowerCase();
    
    // Check neighborhood field, address, or name for neighborhood match
    if (neighborhood.includes(neighborhoodKeyword) ||
        address.includes(neighborhoodKeyword) ||
        name.includes(neighborhoodKeyword)) {
      return true;
    }
  }

  // Check borough match
  if (keywords.borough) {
    const addressComponents = restaurant.google_data.addressComponents || [];
    const boroughComponent = addressComponents.find(comp => 
      comp.types && comp.types.includes('sublocality_level_1')
    );
    if (boroughComponent) {
      const borough = boroughComponent.longText.toLowerCase();
      if (borough.includes(keywords.borough.toLowerCase())) {
        return true;
      }
    }
  }

  // Check city match
  if (keywords.city) {
    const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
    
    switch (keywords.city) {
      case 'nyc':
        if (address.includes('new york') || address.includes('nyc')) {
          return true;
        }
        break;
      case 'tokyo':
        if (address.includes('tokyo') || address.includes('japan')) {
          return true;
        }
        break;
      case 'seoul':
        if (address.includes('seoul') || address.includes('korea')) {
          return true;
        }
        break;
      case 'paris':
        if (address.includes('paris') || address.includes('france')) {
          return true;
        }
        break;
    }
  }

  return false;
}

/**
 * Check if restaurant matches cuisine criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches cuisine
 */
function matchesCuisine(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.cuisineType) {
    return true; // No cuisine filter
  }

  const cuisineKeyword = keywords.cuisineType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
  
  // For "bar" queries, be strict - only match if it's primarily a bar
  if (cuisineKeyword === 'bar') {
    return primaryType === 'bar' || 
           primaryType === 'night_club' || 
           specificType === 'bar';
  }
  
  // For "coffee shop" queries, be very specific
  if (cuisineKeyword === 'coffee shop') {
    return primaryType.includes('cafe') || 
           primaryType.includes('coffee') ||
           specificType.includes('cafe') ||
           specificType.includes('coffee') ||
           types.some(t => t.includes('cafe') || t.includes('coffee')) ||
           restaurant.google_data.servesCoffee === true;
  }
  
  // For "cafe" and "coffee" queries, be more stringent - prioritize actual cafes
  if (cuisineKeyword === 'cafe' || cuisineKeyword === 'coffee') {
    return primaryType.includes('cafe') || 
           primaryType.includes('coffee') ||
           specificType.includes('cafe') ||
           specificType.includes('coffee') ||
           types.some(t => t.includes('cafe') || t.includes('coffee'));
  }
  
  // For "galettes" and "crepes" queries, check restaurant name and summaries
  if (cuisineKeyword === 'galettes' || cuisineKeyword === 'crepes') {
    const name = restaurant.google_data.displayName.text.toLowerCase();
    const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
    const generativeSummary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
    
    return name.includes(cuisineKeyword) ||
           editorialSummary.includes(cuisineKeyword) ||
           generativeSummary.includes(cuisineKeyword) ||
           types.some(t => t.includes(cuisineKeyword));
  }
  
  // For all cuisines, check in order of specificity
  return specificType.includes(cuisineKeyword) ||
         primaryType.includes(cuisineKeyword) ||
         types.some(t => t.includes(cuisineKeyword));
}

/**
 * Check if restaurant matches price criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches price
 */
function matchesPrice(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.priceLevel || keywords.priceLevel === 'any') {
    return true; // No price filter
  }

  const priceDisplay = restaurant.price_display;
  
  // If no price display data, exclude from budget searches but include for others
  if (!priceDisplay || priceDisplay === 'N/A') {
    if (keywords.priceLevel === 'budget') {
      return false; // Exclude restaurants with no price data from budget searches
    }
    return true; // Include restaurants with no price data for other searches
  }

  switch (keywords.priceLevel) {
    case 'budget':
      return priceDisplay === '$' || priceDisplay === '$$';
    case 'moderate':
      return priceDisplay === '$$' || priceDisplay === '$$$';
    case 'upscale':
      return priceDisplay === '$$$' || priceDisplay === '$$$$';
    default:
      return true;
  }
}

/**
 * Check if restaurant matches amenities criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches amenities
 */
function matchesAmenities(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  // Check takeout requirement
  if (keywords.needsTakeout && !restaurant.google_data.takeout) {
    return false;
  }

  // Check coffee requirement
  if (keywords.needsCoffee) {
    const servesCoffee = restaurant.google_data.servesCoffee;
    const isCafe = restaurant.google_data.types?.includes('cafe');
    if (!servesCoffee && !isCafe) {
      return false;
    }
  }

  return true;
}

/**
 * Check if restaurant matches specific service criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches service criteria
 */
function matchesServices(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  // Check vegetarian food
  if (keywords.cuisineType === 'vegetarian') {
    return restaurant.google_data.servesVegetarianFood === true;
  }

  // Check bar/drinks services
  if (keywords.cuisineType === 'bar' || keywords.cuisineType === 'drink' || keywords.cuisineType === 'drinks') {
    return restaurant.google_data.servesBeer === true || 
           restaurant.google_data.servesWine === true || 
           restaurant.google_data.servesCocktails === true;
  }

  // Check dessert services
  if (keywords.cuisineType === 'cake' || keywords.cuisineType === 'bakery' || 
      keywords.cuisineType === 'bakeries' || keywords.cuisineType === 'dessert' || 
      keywords.cuisineType === 'sweets') {
    return restaurant.google_data.servesDessert === true;
  }

  // Check coffee services
  if (keywords.cuisineType === 'coffee' || keywords.cuisineType === 'cafe') {
    return restaurant.google_data.servesCoffee === true;
  }

  return true; // No specific service filter
}

/**
 * Check if restaurant matches vibe criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches vibe
 */
function matchesVibe(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.vibeKeywords || keywords.vibeKeywords.length === 0) {
    return true; // No vibe filter
  }

  const name = restaurant.google_data.displayName.text.toLowerCase();
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
  const summary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
  const generativeSummary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
  
  // Get all review texts
  const reviewTexts = restaurant.google_data.reviews?.map(review => 
    review.text?.text?.toLowerCase() || ''
  ) || [];
  
  // Check if any vibe keyword appears in name, types, summaries, or reviews
  return keywords.vibeKeywords.some(vibe => 
    name.includes(vibe) ||
    types.some(t => t.includes(vibe)) ||
    summary.includes(vibe) ||
    generativeSummary.includes(vibe) ||
    reviewTexts.some(reviewText => reviewText.includes(vibe))
  );
}




/**
 * Check if restaurant matches meal type criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches meal type
 */
function matchesMealType(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.mealType) {
    return true; // No meal type filter
  }

  const mealType = keywords.mealType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
  
  // For brunch queries, use the servesBrunch metadata
  if (mealType === 'brunch') {
    return restaurant.google_data.servesBrunch === true;
  }
  
  // For breakfast queries, use the servesBreakfast metadata
  if (mealType === 'breakfast') {
    return restaurant.google_data.servesBreakfast === true;
  }
  
  // For lunch queries, use the servesLunch metadata
  if (mealType === 'lunch') {
    return restaurant.google_data.servesLunch === true;
  }
  
  // For dinner queries, use the servesDinner metadata
  if (mealType === 'dinner') {
    return restaurant.google_data.servesDinner === true;
  }
  
  // For other meal types, check if restaurant types contain the meal type
  return types.some(t => t.includes(mealType)) ||
         primaryType.includes(mealType);
}

/**
 * Pre-filter restaurants based on natural language query
 * Returns top 10-12 filtered and sorted restaurants
 * @param query - User's natural language query
 * @returns Array of filtered restaurants, sorted by quality score
 */
export function preFilterRestaurants(query: string): Restaurant[] {
  try {
    console.log('Pre-filtering restaurants for query:', query);
    
    // Check if restaurants data is available
    if (!restaurants || restaurants.length === 0) {
      console.warn('No restaurants data available');
      return [];
    }
    
    // Extract keywords from query
    const keywords = extractKeywords(query);
    
    // Filter restaurants step by step
    let filteredRestaurants = restaurants.filter(restaurant => {
      try {
        // Apply all filters
        return matchesLocation(restaurant, keywords) &&
               matchesCuisine(restaurant, keywords) &&
               matchesMealType(restaurant, keywords) &&
               matchesPrice(restaurant, keywords) &&
               matchesAmenities(restaurant, keywords) &&
               matchesServices(restaurant, keywords) &&
               matchesVibe(restaurant, keywords);
      } catch (error) {
        console.warn('Error filtering restaurant:', error);
        return false;
      }
    });

    console.log(`Filtered from ${restaurants.length} to ${filteredRestaurants.length} restaurants`);

    // Sort using tiered ranking system
    const sortedRestaurants = sortByTieredRanking(filteredRestaurants, keywords);

    // Return all matching results
    console.log(`Returning all ${sortedRestaurants.length} matching restaurants`);
    return sortedRestaurants;
  } catch (error) {
    console.error('Error in preFilterRestaurants:', error);
    return [];
  }
}

// Filter service ready for use
