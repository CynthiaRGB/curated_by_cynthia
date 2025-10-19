// Client-side filter service for Curated by Cynthia
// Pre-filters restaurants before sending to Claude API for smart ranking

import { Restaurant, ExtractedKeywords } from '../../src/types/restaurant';
import { restaurantData } from '../data/285_review_subtracted.js';

// Get restaurants from the data
const restaurants: Restaurant[] = (restaurantData as any).places || (restaurantData as any) || [];

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
 * Extract structured keywords from natural language queries
 */
export function extractKeywords(query: string): ExtractedKeywords {
  const lowerQuery = query.toLowerCase();
  const keywords: ExtractedKeywords = {
    vibeKeywords: [],
    occasionType: null,
    noisePreference: null,
    requiresInstagrammable: false,
    requiresMichelin: false
  };

  // Extract location using regex - only match known locations
  const locationMatch = lowerQuery.match(/in ([\w\s]+)/);
  if (locationMatch) {
    const location = locationMatch[1].trim();
    
    // Check if it's a borough first
    const boroughMatch = BOROUGHS.find(borough => 
      location.includes(borough) || borough.includes(location)
    );
    if (boroughMatch) {
      keywords.borough = boroughMatch;
    } else {
      // Only set as neighborhood if it looks like a real neighborhood name
      // (not cuisine types, meal types, or other non-location words)
      const isLocation = !CUISINE_TYPES.some(cuisine => 
        location.includes(cuisine) || cuisine.includes(location)
      ) && !MEAL_TYPES.some(meal => 
        location.includes(meal) || meal.includes(location)
      ) && !['star', 'michelin', 'restaurant', 'food', 'dining'].some(word =>
        location.includes(word)
      );
      
      if (isLocation) {
        keywords.neighborhood = location;
      }
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

  // Extract cuisine type
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

  // Extract occasion type
  for (const [phrase, tag] of Object.entries(OCCASION_MAPPINGS)) {
    if (lowerQuery.includes(phrase)) {
      keywords.occasionType = tag;
      break;
    }
  }

  // Extract noise preference
  if (lowerQuery.includes('quiet') || lowerQuery.includes('not loud') || 
      lowerQuery.includes('not too loud') || lowerQuery.includes('peaceful')) {
    keywords.noisePreference = 'quiet';
  } else if (lowerQuery.includes('lively') || lowerQuery.includes('energetic') ||
             lowerQuery.includes('loud is fine')) {
    keywords.noisePreference = 'any';
  }

  // Extract vibe keywords using mappings
  for (const [phrase, tags] of Object.entries(VIBE_MAPPINGS)) {
    if (lowerQuery.includes(phrase)) {
      keywords.vibeKeywords.push(...tags);
      break; // Only match one vibe phrase to avoid over-matching
    }
  }

  // Check for instagrammable
  if (lowerQuery.includes('instagram') || lowerQuery.includes('photogenic') || 
      lowerQuery.includes('aesthetic') || lowerQuery.includes('pretty') ||
      lowerQuery.includes('beautiful space')) {
    keywords.requiresInstagrammable = true;
  }

  // Check for Michelin
  if (lowerQuery.includes('michelin')) {
    keywords.requiresMichelin = true;
  }

  console.log('Extracted keywords:', keywords);
  return keywords;
}

/**
 * Calculate quality score for a restaurant
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
 */
function matchesCuisine(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.cuisineType) {
    return true; // No cuisine filter
  }

  const cuisineKeyword = keywords.cuisineType.toLowerCase();
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
  
  // For "bar" queries, be strict
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
  
  return specificType.includes(cuisineKeyword) ||
         primaryType.includes(cuisineKeyword) ||
         types.some(t => t.includes(cuisineKeyword));
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
    if (keywords.priceLevel === 'budget') {
      return false;
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
    return restaurant.google_data.servesBrunch === true;
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
  return restaurantOccasions.includes(keywords.occasionType);
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
 * Pre-filter restaurants based on natural language query
 * Returns filtered and sorted restaurants using enriched tags
 */
export function preFilterRestaurants(query: string): Restaurant[] {
  try {
    console.log('Pre-filtering restaurants for query:', query);
    
    if (!restaurants || restaurants.length === 0) {
      console.warn('No restaurants data available');
      return [];
    }
    
    // Extract keywords from query
    const keywords = extractKeywords(query);
    
    // Filter restaurants step by step
    let filteredRestaurants = restaurants.filter(restaurant => {
      try {
        return matchesLocation(restaurant, keywords) &&
               matchesCuisine(restaurant, keywords) &&
               matchesMealType(restaurant, keywords) &&
               matchesPrice(restaurant, keywords) &&
               matchesAmenities(restaurant, keywords) &&
               matchesVibe(restaurant, keywords) &&           // NEW: Vibe filtering
               matchesOccasion(restaurant, keywords) &&       // NEW: Occasion filtering
               matchesNoiseLevel(restaurant, keywords) &&     // NEW: Noise filtering
               matchesInstagrammable(restaurant, keywords) && // NEW: Instagrammable filtering
               matchesMichelin(restaurant, keywords);         // NEW: Michelin filtering
      } catch (error) {
        console.warn('Error filtering restaurant:', error);
        return false;
      }
    });

    console.log(`Filtered from ${restaurants.length} to ${filteredRestaurants.length} restaurants`);

    // Sort using tiered ranking system
    const sortedRestaurants = sortByTieredRanking(filteredRestaurants, keywords);

    console.log(`Returning all ${sortedRestaurants.length} matching restaurants`);
    return sortedRestaurants;
  } catch (error) {
    console.error('Error in preFilterRestaurants:', error);
    return [];
  }
}

// Filter service ready for use