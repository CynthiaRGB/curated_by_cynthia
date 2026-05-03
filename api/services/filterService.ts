// Client-side filter service for Curated by Cynthia
// Pre-filters restaurants before sending to Claude API for smart ranking

import { isCityPromptItem } from './filter/cityPrompts.js';
import {
  matchesAmenities,
  matchesCuisine,
  matchesCynthiasPick,
  matchesLandmark,
  matchesLocation,
  matchesMealType,
  matchesMichelin,
  matchesNoiseLevel,
  matchesOccasion,
  matchesPrice,
  matchesSpecialFeatures,
  matchesVibeInternal,
} from './filter/matchers.js';
import { sortByTieredRanking } from './filter/ranking.js';
import type { ExtractedKeywords, Restaurant } from '../../src/types/restaurant';

export { isCityPromptItem };

let restaurantsCache: Restaurant[] | null = null;
let restaurantsByCityCache: Map<string, Restaurant[]> | null = null;

/**
 * Lazy load restaurants data (cached after first load)
 */
async function getRestaurantsAsync(): Promise<Restaurant[]> {
  if (restaurantsCache === null) {
    const startTime = Date.now();
    // Import at runtime to avoid loading on module initialization
    const { restaurantData } = await import('../data/final_data.js');
    // restaurantData is already an array, not an object with .places property
    restaurantsCache = Array.isArray(restaurantData) ? restaurantData : [];
    const loadTime = Date.now() - startTime;
    console.log(`[Performance] Loaded ${restaurantsCache.length} restaurants in ${loadTime}ms`);
  }
  return restaurantsCache;
}

/**
 * Synchronous version - throws error if cache not initialized
 * Use getRestaurantsAsync() for async contexts
 */
function getRestaurants(): Restaurant[] {
  if (restaurantsCache === null) {
    throw new Error('Restaurants cache not initialized. Call getRestaurantsAsync() first or ensure preFilterRestaurants is called.');
  }
  return restaurantsCache;
}

/**
 * Get restaurants filtered by city (cached by city)
 * This dramatically reduces the dataset size before other filters
 */
async function getRestaurantsByCityAsync(city?: string): Promise<Restaurant[]> {
  await getRestaurantsAsync();
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

export async function preFilterRestaurants(query: string, keywords: ExtractedKeywords): Promise<Restaurant[]> {
  const filterStartTime = Date.now();
  try {
    console.log('Pre-filtering restaurants for query:', query);
    
    // Use provided keywords (must be provided - no fallback)
    const extractedKeywords = keywords;
    
    // OPTIMIZATION: Filter by city FIRST to dramatically reduce dataset size
    // This is the most selective filter and should be applied early
    const cityFilterStartTime = Date.now();
    // Ensure restaurants are loaded
    await getRestaurantsAsync();
    let restaurantsToFilter = getRestaurants();
    
    if (extractedKeywords.city) {
      restaurantsToFilter = await getRestaurantsByCityAsync(extractedKeywords.city);
      const cityFilterTime = Date.now() - cityFilterStartTime;
      console.log(`[Performance] City filtering took ${cityFilterTime}ms`);
    }
    
    if (restaurantsToFilter.length === 0) {
      console.warn('No restaurants data available after city filtering');
      return [];
    }
    
    // Reset per-query ranking flags on cached restaurant objects.
    // matchesCuisine() mutates `_matchesCuisineType` / `_matchesSpecialty` onto
    // restaurants for use by sortByTieredRanking. Because restaurantsCache is
    // shared across queries, stale flags from a previous query would otherwise
    // bleed into this one's ranking.
    for (const restaurant of restaurantsToFilter) {
      delete (restaurant as any)._matchesCuisineType;
      delete (restaurant as any)._matchesSpecialty;
    }
    
    // OPTIMIZATION: Apply filters in order of selectivity
    // Most selective filters first to reduce iterations
    const filterStart = Date.now();
    
    // Debug: Log filter stats
    let cuisineFiltered = 0;
    let locationFiltered = 0;
    let landmarkFiltered = 0;
    let otherFiltered = 0;
    
    let filteredRestaurants = restaurantsToFilter.filter(restaurant => {
      try {
        // Order filters by selectivity (most selective first):
        // 1. Location (already filtered by city, but check neighborhood/borough)
        if (!matchesLocation(restaurant, extractedKeywords)) {
          locationFiltered++;
          return false;
        }
        
        // 2. Landmark (only used if neighborhood/borough not present - matchesLandmark handles this)
        if (!matchesLandmark(restaurant, extractedKeywords)) {
          landmarkFiltered++;
          return false;
        }
        
        // 3. Cynthia's pick (very selective boolean)
        if (!matchesCynthiasPick(restaurant, extractedKeywords)) {
          otherFiltered++;
          return false;
        }
        
        // 4. Cuisine (selective, reduces dataset significantly)
        if (!matchesCuisine(restaurant, extractedKeywords, query)) {
          cuisineFiltered++;
          return false;
        }
        
        // 5. Meal type (moderately selective)
        if (!matchesMealType(restaurant, extractedKeywords)) return false;
        
        // 6. Price (moderately selective)
        if (!matchesPrice(restaurant, extractedKeywords)) return false;
        
        // 7. Special requirements (selective booleans)
        if (!matchesMichelin(restaurant, extractedKeywords)) return false;
        
        // 8. Amenities (less selective)
        if (!matchesAmenities(restaurant, extractedKeywords)) return false;
        
        // 9. Vibe OR Occasion OR Special Features (Pure OR relationship between all three filters)
        // If any of vibeKeywords, occasionType, or specialFeatures are specified, restaurant must match at least one
        const hasVibeKeywords = extractedKeywords.vibeKeywords && extractedKeywords.vibeKeywords.length > 0;
        const hasOccasionType = extractedKeywords.occasionType && 
          (Array.isArray(extractedKeywords.occasionType) ? extractedKeywords.occasionType.length > 0 : true);
        const hasSpecialFeatures = extractedKeywords.specialFeatures && extractedKeywords.specialFeatures.length > 0;
        
        // Count how many of the three filters are specified
        const filterCount = [hasVibeKeywords, hasOccasionType, hasSpecialFeatures].filter(Boolean).length;
        
        if (filterCount > 0) {
          // At least one filter is specified: use OR logic (match if restaurant matches ANY of them)
          const matchesVibe = hasVibeKeywords ? matchesVibeInternal(restaurant, extractedKeywords) : false;
          const matchesOccasionResult = hasOccasionType ? matchesOccasion(restaurant, extractedKeywords) : false;
          const matchesFeatures = hasSpecialFeatures ? matchesSpecialFeatures(restaurant, extractedKeywords) : false;
          
          // Restaurant must match at least one of the specified filters
          if (!matchesVibe && !matchesOccasionResult && !matchesFeatures) return false;
        }
        
        // 10. Noise (less selective)
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
