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
  'cake', 'pastries', 'pastry','bakeries', 'sweets', 'coffee shop', 'bagel', 'bagels', 'sandwich', 'sandwiches',
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
    requiresMichelin: false,
    requiresCynthiasPick: false
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
    
    // Special handling: If query says "brunch restaurants" (plural), require stricter matching
    // This indicates user wants brunch-focused restaurants, not just any that serve brunch
    if (mealMatch === 'brunch' && lowerQuery.includes('brunch restaurant')) {
      keywords.requiresBrunchFocus = true;
    }
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

  let matches = false;

  // Check neighborhood match
  if (keywords.neighborhood) {
    const neighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
    const address = restaurant.google_data.formattedAddress?.toLowerCase() || '';
    const name = restaurant.google_data.displayName.text.toLowerCase();
    const neighborhoodKeyword = keywords.neighborhood.toLowerCase();
    
    if (neighborhood.includes(neighborhoodKeyword) ||
        address.includes(neighborhoodKeyword) ||
        name.includes(neighborhoodKeyword)) {
      matches = true;
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
        matches = true;
      }
    }
  }

  // Check city match - use restaurant.city property if available, otherwise fall back to address parsing
  if (keywords.city) {
    const restaurantCity = restaurant.city?.toLowerCase();
    const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
    
    // Map keywords.city to expected city names
    const cityMap: { [key: string]: string[] } = {
      'nyc': ['new york city', 'new york', 'nyc'],
      'tokyo': ['tokyo'],
      'seoul': ['seoul'],
      'paris': ['paris']
    };
    
    const expectedCities = cityMap[keywords.city] || [];
    
    // First check restaurant.city property (more reliable)
    if (restaurantCity) {
      for (const expectedCity of expectedCities) {
        if (restaurantCity.includes(expectedCity) || expectedCity.includes(restaurantCity)) {
          matches = true;
          break;
        }
      }
    }
    
    // Fall back to address parsing if restaurant.city didn't match
    if (!matches) {
      switch (keywords.city) {
        case 'nyc':
          // For NYC, check if it's in any NYC borough (Manhattan, Brooklyn, Queens, Bronx, Staten Island)
          if (address.includes('new york') || address.includes('nyc') || 
              address.includes('manhattan') || address.includes('brooklyn') || 
              address.includes('queens') || address.includes('bronx') || 
              address.includes('staten island')) {
            matches = true;
          }
          break;
        case 'tokyo':
          if (address.includes('tokyo') || address.includes('japan')) {
            matches = true;
          }
          break;
        case 'seoul':
          if (address.includes('seoul') || address.includes('korea')) {
            matches = true;
          }
          break;
        case 'paris':
          if (address.includes('paris') || address.includes('france')) {
            matches = true;
          }
          break;
      }
    }
  }

  return matches;
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
  
  // Check restaurant name for dish-specific keywords (e.g., "yakitori", "katsu")
  // This is important because dish-specific restaurants often have the dish in their name
  // but their type might just be "japanese_restaurant"
  // Also check normalized version to handle accents and plurals
  if (restaurantName.includes(cuisineKeyword) || 
      normalizeForMatching(restaurantName).includes(normalizedCuisineKeyword)) {
    return true;
  }
  
  // For "bar" queries, be strict
  if (cuisineKeyword === 'bar') {
    return primaryType === 'bar' || 
           primaryType === 'night_club' || 
           specificType === 'bar';
  }
  
  // For "coffee shop"/"coffee"/"cafe" queries, apply strict matching if required
  if (cuisineKeyword === 'coffee shop' || cuisineKeyword === 'coffee' || cuisineKeyword === 'cafe') {
    // Basic check: restaurant must serve coffee or be a cafe
    const servesCoffee = restaurant.google_data.servesCoffee;
    const isCafe = types.some(t => t.includes('cafe') || t.includes('coffee'));
    
    if (!servesCoffee && !isCafe) {
      return false;
    }
    
    // If query requires coffee focus (e.g., "coffee shop", "coffee place"), apply stricter criteria
    if (keywords.requiresCoffeeFocus) {
      // Check metadata indicators (most reliable)
      const hasCoffeeType = types.some(t => 
        t.includes('cafe') || 
        t.includes('coffee') || 
        t === 'cafe' || 
        t === 'coffee_shop'
      );
      
      // Check if coffee/cafe is mentioned prominently (name or summaries)
      const mentionsCoffee = restaurantName.includes('coffee') ||
                           restaurantName.includes('cafe') ||
                           restaurantName.includes('café') ||
                           summary.includes('coffee') ||
                           summary.includes('cafe') ||
                           summary.includes('café') ||
                           reviewSummary.includes('coffee') ||
                           reviewSummary.includes('cafe') ||
                           reviewSummary.includes('café') ||
                           editorialSummary.includes('coffee') ||
                           editorialSummary.includes('cafe') ||
                           editorialSummary.includes('café');
      
      // Restaurant must meet at least one of these criteria to be coffee-focused
      const isCoffeeFocused = hasCoffeeType || mentionsCoffee;
      
      // If none of these indicators are present, exclude it (not a coffee-focused restaurant)
      if (!isCoffeeFocused) {
        return false;
      }
    }
    
    return true;
  }
  
  // For dessert-related queries (dessert, pastry, cake, pastries, bakery, sweets), apply strict matching if required
  if (['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets'].includes(cuisineKeyword)) {
    // Basic check: restaurant must serve dessert or be a bakery/dessert shop
    const servesDessert = restaurant.google_data.servesDessert;
    const isBakery = types.some(t => 
      t.includes('bakery') || 
      t.includes('dessert') || 
      t.includes('ice_cream') ||
      t === 'bakery' ||
      t === 'dessert_shop' ||
      t === 'ice_cream_shop'
    );
    
    if (!servesDessert && !isBakery) {
      return false;
    }
    
    // If query requires dessert focus (e.g., "dessert place", "pastry shop"), apply stricter criteria
    if (keywords.requiresDessertFocus) {
      // Check metadata indicators (most reliable)
      const hasDessertType = types.some(t => 
        t.includes('bakery') || 
        t.includes('dessert') || 
        t.includes('ice_cream') ||
        t.includes('pastry') ||
        t === 'bakery' ||
        t === 'dessert_shop' ||
        t === 'ice_cream_shop' ||
        t === 'pastry_shop'
      );
      
      // Check if dessert-related terms are mentioned prominently (name or summaries)
      const mentionsDessert = restaurantName.includes('dessert') ||
                             restaurantName.includes('pastry') ||
                             restaurantName.includes('pastries') ||
                             restaurantName.includes('cake') ||
                             restaurantName.includes('bakery') ||
                             restaurantName.includes('sweet') ||
                             restaurantName.includes('cream') ||
                             summary.includes('dessert') ||
                             summary.includes('pastry') ||
                             summary.includes('pastries') ||
                             summary.includes('cake') ||
                             summary.includes('bakery') ||
                             summary.includes('sweet') ||
                             reviewSummary.includes('dessert') ||
                             reviewSummary.includes('pastry') ||
                             reviewSummary.includes('pastries') ||
                             reviewSummary.includes('cake') ||
                             reviewSummary.includes('bakery') ||
                             reviewSummary.includes('sweet') ||
                             editorialSummary.includes('dessert') ||
                             editorialSummary.includes('pastry') ||
                             editorialSummary.includes('pastries') ||
                             editorialSummary.includes('cake') ||
                             editorialSummary.includes('bakery') ||
                             editorialSummary.includes('sweet');
      
      // Restaurant must meet at least one of these criteria to be dessert-focused
      const isDessertFocused = hasDessertType || mentionsDessert;
      
      // If none of these indicators are present, exclude it (not a dessert-focused restaurant)
      if (!isDessertFocused) {
        return false;
      }
    }
    
    return true;
  }
  
  // For "asian" queries, match any Asian cuisine type
  if (cuisineKeyword === 'asian') {
    return ASIAN_CUISINES.some(asianCuisine => {
      const normalizedAsianCuisine = normalizeForMatching(asianCuisine);
      return primaryType.includes(asianCuisine) ||
             specificType.includes(asianCuisine) ||
             types.some(t => t.includes(asianCuisine)) ||
             normalizeForMatching(primaryType).includes(normalizedAsianCuisine) ||
             normalizeForMatching(specificType).includes(normalizedAsianCuisine) ||
             types.some(t => normalizeForMatching(t).includes(normalizedAsianCuisine)) ||
             restaurantName.includes(asianCuisine) ||
             normalizeForMatching(restaurantName).includes(normalizedAsianCuisine) ||
             summary.includes(asianCuisine) ||
             reviewSummary.includes(asianCuisine) ||
             editorialSummary.includes(asianCuisine) ||
             normalizeForMatching(summary).includes(normalizedAsianCuisine) ||
             normalizeForMatching(reviewSummary).includes(normalizedAsianCuisine) ||
             normalizeForMatching(editorialSummary).includes(normalizedAsianCuisine);
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

  // Check dessert focus requirements (separate from cuisine matching)
  if (keywords.requiresDessertFocus && keywords.cuisineType && 
      ['dessert', 'pastry', 'cake', 'pastries', 'bakery', 'bakeries', 'sweets'].includes(keywords.cuisineType.toLowerCase())) {
    // This will be handled in matchesCuisine, but we can add additional checks here if needed
    // For now, let matchesCuisine handle it
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
    // Basic check: restaurant must serve brunch
    if (!restaurant.google_data.servesBrunch) {
      return false;
    }
    
    // If query requires brunch focus (e.g., "brunch restaurants"), apply stricter criteria
    if (keywords.requiresBrunchFocus) {
      const restaurantName = restaurant.google_data.displayName?.text?.toLowerCase() || '';
      const summary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
      const reviewSummary = restaurant.google_data.reviewSummary?.text?.text?.toLowerCase() || '';
      const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
      
      // Check metadata indicators first (most reliable)
      const types = restaurant.google_data.types?.map(t => t.toLowerCase()) || [];
      const hasBrunchRestaurantType = types.includes('brunch_restaurant');
      
      // Check for dedicated brunch hours
      const googleData = restaurant.google_data as any; // Type assertion needed for secondary hours
      const hasBrunchHours = googleData.currentSecondaryOpeningHours?.some(
        (hours: any) => hours.secondaryHoursType === 'BRUNCH'
      ) || googleData.secondaryOpeningHours?.some(
        (hours: any) => hours.secondaryHoursType === 'BRUNCH'
      );
      
      // Check for weekend_brunch occasion tag
      const hasWeekendBrunchTag = restaurant.occasion_tags?.includes('weekend_brunch');
      
      // Check if brunch is mentioned prominently (name or summaries)
      const mentionsBrunch = restaurantName.includes('brunch') ||
                            summary.includes('brunch') ||
                            reviewSummary.includes('brunch') ||
                            editorialSummary.includes('brunch');
      
      // Restaurant must meet at least one of these criteria to be brunch-focused
      const isBrunchFocused = hasBrunchRestaurantType || 
                             hasBrunchHours || 
                             hasWeekendBrunchTag || 
                             mentionsBrunch;
      
      // If none of these indicators are present, exclude it (not a brunch-focused restaurant)
      if (!isBrunchFocused) {
        return false;
      }
    }
    
    return true;
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