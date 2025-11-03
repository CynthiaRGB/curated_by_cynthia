// Client-side filter service for Curated by Cynthia
// Pre-filters restaurants before sending to Claude API for smart ranking

import { Restaurant, ExtractedKeywords } from '../../src/types/restaurant';
import { restaurantData } from '../data/279_wo_photo_array.js';

// Get restaurants from the data
const restaurants: Restaurant[] = (restaurantData as any).places || (restaurantData as any) || [];

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
 * Extract structured keywords from natural language queries
 */
export function extractKeywords(query: string): ExtractedKeywords {
  const lowerQuery = query.toLowerCase();
  const keywords: ExtractedKeywords = {
    vibeKeywords: [],
    occasionType: null,
    noisePreference: null,
    requiresInstagrammable: false,
    requiresMichelin: false,
    requiresCynthiasPick: false
  };

  // Extract boroughs first
  for (const borough of BOROUGHS) {
    if (lowerQuery.includes(borough)) {
      if (borough === 'bk') {
        keywords.borough = 'brooklyn';
      } else {
        keywords.borough = borough;
      }
      break; // Only one borough
    }
  }
  
  // Extract neighborhoods - look anywhere in query, but only create array for explicit "and"/"or"
  // Works for all cities: NYC (e.g., "West Village"), Tokyo (e.g., "Shibuya"), Seoul (e.g., "Gangnam"), Paris (e.g., "7th arrondissement")
  const neighborhoods: string[] = [];
  
  // Words to exclude (cuisine types, meal types, common words)
  const excludeWords = new Set([
    ...CUISINE_TYPES.map(c => c.toLowerCase()),
    ...MEAL_TYPES.map(m => m.toLowerCase()),
    ...BOROUGHS.map(b => b.toLowerCase()),
    'restaurant', 'restaurants', 'food', 'dining', 'eat', 'place', 'places', 'spot', 'spots',
    'show', 'me', 'find', 'search', 'in', 'for', 'with', 'the', 'a', 'an',
    'nyc', 'new york', 'new york city', 'tokyo', 'seoul', 'paris', 'cheap', 'expensive',
    'budget', 'upscale', 'fancy', 'good', 'best', 'top', 'rated', 'rating', 'star', 'michelin'
  ]);
  
  // Check if query has explicit "and" or "or" between potential neighborhoods
  const hasExplicitConnector = /\s+(and|or)\s+/i.test(lowerQuery);
  
  // If explicit connector found, split by "and" or "or" to get multiple neighborhoods
  if (hasExplicitConnector) {
    const parts = lowerQuery.split(/\s+(and|or)\s+/i).map(p => p.trim()).filter(p => p.length > 0);
    
    // Extract neighborhood from each part
    for (const part of parts) {
      // Skip if it's a borough (already handled above)
      const isBorough = BOROUGHS.some(b => {
        const boroughLower = b.toLowerCase();
        return part.includes(boroughLower) || part === boroughLower;
      });
      if (isBorough) continue;
      
      // Skip if it's a city
      if (part.includes('nyc') || part.includes('new york') || part.includes('tokyo') || 
          part.includes('seoul') || part.includes('paris')) {
        continue;
      }
      
      // Extract words from the part, but preserve numbers (for "4th arrondissement", etc.)
      const tokens = part.match(/\S+/g) || [];
      const words = tokens.filter(w => {
        const wLower = w.toLowerCase();
        return /^\d/.test(w) || !excludeWords.has(wLower);
      });
      
      if (words.length === 0) continue;
      
      // Try to extract neighborhood phrases (prioritize longer phrases)
      for (let len = Math.min(4, words.length); len >= 1; len--) {
        for (let i = 0; i <= words.length - len; i++) {
          const phrase = words.slice(i, i + len).join(' ').toLowerCase().trim();
          
          if (phrase.length < 2 || excludeWords.has(phrase)) continue;
          if (len === 1 && excludeWords.has(phrase)) continue;
          
          neighborhoods.push(phrase);
          break; // Only take one neighborhood per part
        }
        if (neighborhoods.length > 0 && neighborhoods[neighborhoods.length - 1].length >= 2) break;
      }
    }
  } else {
    // No explicit connector - extract single neighborhood from anywhere in query
    // Skip if it's a borough (already handled above)
    const isBorough = BOROUGHS.some(b => {
      const boroughLower = b.toLowerCase();
      return lowerQuery.includes(boroughLower);
    });
    
    if (!isBorough) {
      // Skip if it's a city
      if (!lowerQuery.includes('nyc') && !lowerQuery.includes('new york') && 
          !lowerQuery.includes('tokyo') && !lowerQuery.includes('seoul') && 
          !lowerQuery.includes('paris')) {
        
        // Extract words from query
        const tokens = lowerQuery.match(/\S+/g) || [];
        const words = tokens.filter((w: string) => {
          const wLower = w.toLowerCase();
          return /^\d/.test(w) || !excludeWords.has(wLower);
        });
        
        if (words.length > 0) {
          // Try to extract neighborhood phrases (prioritize longer phrases)
          for (let len = Math.min(4, words.length); len >= 1; len--) {
            for (let i = 0; i <= words.length - len; i++) {
              const phrase = words.slice(i, i + len).join(' ').toLowerCase().trim();
              
              if (phrase.length < 2 || excludeWords.has(phrase)) continue;
              if (len === 1 && excludeWords.has(phrase)) continue;
              
              neighborhoods.push(phrase);
              break; // Only take one neighborhood
            }
            if (neighborhoods.length > 0 && neighborhoods[neighborhoods.length - 1].length >= 2) break;
          }
        }
      }
    }
  }
  
  // Remove duplicates, prioritize longer matches
  const uniqueNeighborhoods = Array.from(new Set(neighborhoods))
    .sort((a, b) => b.length - a.length) // Longer first
    .filter((n, i, arr) => {
      // Remove phrases that are substrings of longer phrases that came before
      return !arr.slice(0, i).some(longer => longer.includes(n) && longer !== n);
    })
    .filter(n => n.length >= 2); // Minimum 2 characters
  
  if (uniqueNeighborhoods.length === 1) {
    keywords.neighborhood = uniqueNeighborhoods[0];
  } else if (uniqueNeighborhoods.length > 1) {
    keywords.neighborhood = uniqueNeighborhoods;
  }

  // Check for city mentions - NYC/New York/New York City shows all restaurants (both Manhattan and Brooklyn)
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

  // Extract cuisine type - check for multi-word phrases first, then single words
  const sortedCuisineTypes = [...CUISINE_TYPES].sort((a, b) => b.length - a.length);
  
  // First, try to match multi-word cuisine types (e.g., "dim sum", "coffee shop")
  const multiWordMatch = sortedCuisineTypes
    .filter(c => c.includes(' '))
    .find(cuisine => lowerQuery.includes(cuisine));
  
  if (multiWordMatch) {
    keywords.cuisineType = multiWordMatch;
    
    // Special handling: If query says "coffee shop", require stricter matching
    if (multiWordMatch === 'coffee shop') {
      keywords.requiresCoffeeFocus = true;
    }
  } else {
    // Then try single-word matches
    const cuisineMatch = sortedCuisineTypes.find(cuisine => {
      // Match whole words to avoid false positives (e.g., "sushi" shouldn't match "sushiya")
      const words = lowerQuery.split(/\s+/);
      return words.some(word => word === cuisine || word.startsWith(cuisine + '-'));
    });
    if (cuisineMatch) {
      keywords.cuisineType = cuisineMatch;
      
      // Special handling: If query says "coffee" or "cafe", require stricter matching
      if (cuisineMatch === 'coffee' || cuisineMatch === 'cafe') {
        keywords.requiresCoffeeFocus = true;
      }
      
      // Special handling: If query says "dessert", "pastry", "cake", "pastries", require stricter matching
      if (['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets'].includes(cuisineMatch)) {
        keywords.requiresDessertFocus = true;
      }
    }
  }
  
  // Also check for coffee/dessert queries that might not match cuisine types exactly
  // e.g., "coffee place", "dessert spot", etc.
  if (!keywords.requiresCoffeeFocus && (lowerQuery.includes('coffee') || lowerQuery.includes('cafe'))) {
    // Only trigger if it's clearly about coffee/cafe, not just mentioning it in passing
    if (/coffee\s+(shop|place|spot|cafe|bar)/i.test(lowerQuery) || 
        /(coffee|cafe)\s+(in|near|around)/i.test(lowerQuery) ||
        lowerQuery.trim().match(/^(coffee|cafe)/i)) {
      keywords.requiresCoffeeFocus = true;
      if (!keywords.cuisineType) {
        keywords.cuisineType = lowerQuery.includes('coffee shop') ? 'coffee shop' : 'coffee';
      }
    }
  }
  
  if (!keywords.requiresDessertFocus && 
      (lowerQuery.includes('dessert') || lowerQuery.includes('pastry') || 
       lowerQuery.includes('pastries') || lowerQuery.includes('cake'))) {
    // Only trigger if it's clearly about dessert, not just mentioning it in passing
    if (/dessert\s+(place|spot|shop|restaurant)/i.test(lowerQuery) ||
        /(dessert|pastry|pastries|cake|bakery)\s+(in|near|around)/i.test(lowerQuery) ||
        lowerQuery.trim().match(/^(dessert|pastry|pastries|cake|bakery)/i)) {
      keywords.requiresDessertFocus = true;
      if (!keywords.cuisineType) {
        // Set cuisine type to the first matching dessert-related term
        if (lowerQuery.includes('pastry') || lowerQuery.includes('pastries')) {
          keywords.cuisineType = 'pastry';
        } else if (lowerQuery.includes('cake')) {
          keywords.cuisineType = 'cake';
        } else if (lowerQuery.includes('bakery')) {
          keywords.cuisineType = 'bakery';
        } else {
          keywords.cuisineType = 'dessert';
        }
      }
    }
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

  // Check for Cynthia's favorites
  if (lowerQuery.includes("cynthia's favorites") || lowerQuery.includes("cynthias favorites")) {
    keywords.requiresCynthiasPick = true;
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
  if (!keywords.cuisineType) {
    return true; // No cuisine filter
  }

  const cuisineKeyword = keywords.cuisineType.toLowerCase();
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
 * NEW: Check if restaurant is one of Cynthia's picks
 */
function matchesCynthiasPick(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.requiresCynthiasPick) {
    return true;
  }

  return restaurant.cynthias_pick === true;
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
               matchesMichelin(restaurant, keywords) &&       // NEW: Michelin filtering
               matchesCynthiasPick(restaurant, keywords);     // NEW: Cynthia's pick filtering
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
// Filter service ready for use