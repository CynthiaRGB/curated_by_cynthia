// Client-side filter service for Curated by Cynthia
// Pre-filters restaurants before sending to Claude API for smart ranking

import { Restaurant, ExtractedKeywords } from '../types/restaurant';
import restaurantData from '../data/285_restaurants_reduced_metadata.json';

// Get restaurants from the data
const restaurants: Restaurant[] = (restaurantData as any).places || [];

// Map user queries to Google Place Types
const CUISINE_TYPE_MAP: Record<string, { primary: string[], secondary: string[] }> = {
  "coffee": {
    primary: ["cafe", "coffee_shop"],
    secondary: ["bakery", "breakfast_restaurant"]
  },
  "cafe": {
    primary: ["cafe", "coffee_shop"],
    secondary: ["bakery", "breakfast_restaurant"]
  },
  "bakery": {
    primary: ["bakery"],
    secondary: ["dessert_shop", "cafe", "confectionery"]
  },
  "italian": {
    primary: ["italian_restaurant"],
    secondary: ["pizza_restaurant", "pasta_restaurant"]
  },
  "pizza": {
    primary: ["pizza_restaurant"],
    secondary: ["italian_restaurant"]
  },
  "japanese": {
    primary: ["japanese_restaurant"],
    secondary: ["sushi_restaurant", "ramen_restaurant", "izakaya"]
  },
  "ramen": {
    primary: ["ramen_restaurant"],
    secondary: ["japanese_restaurant", "noodle_house"]
  },
  "sushi": {
    primary: ["sushi_restaurant"],
    secondary: ["japanese_restaurant"]
  },
  "french": {
    primary: ["french_restaurant"],
    secondary: ["bistro", "brasserie"]
  },
  "mexican": {
    primary: ["mexican_restaurant"],
    secondary: ["taco_restaurant", "burrito_restaurant"]
  },
  "chinese": {
    primary: ["chinese_restaurant"],
    secondary: ["dim_sum_restaurant"]
  },
  "korean": {
    primary: ["korean_restaurant"],
    secondary: ["barbecue_restaurant"]
  },
  "thai": {
    primary: ["thai_restaurant"],
    secondary: []
  },
  "vietnamese": {
    primary: ["vietnamese_restaurant"],
    secondary: ["pho_restaurant"]
  },
  "indian": {
    primary: ["indian_restaurant"],
    secondary: []
  },
  "american": {
    primary: ["american_restaurant"],
    secondary: ["hamburger_restaurant", "diner"]
  },
  "burger": {
    primary: ["hamburger_restaurant"],
    secondary: ["american_restaurant", "fast_food_restaurant"]
  },
  "steakhouse": {
    primary: ["steak_house"],
    secondary: ["american_restaurant"]
  },
  "steak": {
    primary: ["steak_house"],
    secondary: ["american_restaurant"]
  },
  "bar": {
    primary: ["bar", "night_club"],
    secondary: ["restaurant"]
  },
  "dessert": {
    primary: ["dessert_shop", "ice_cream_shop"],
    secondary: ["bakery", "confectionery"]
  },
  "breakfast": {
    primary: ["breakfast_restaurant"],
    secondary: ["cafe", "brunch_restaurant", "diner"]
  },
  "brunch": {
    primary: ["brunch_restaurant"],
    secondary: ["breakfast_restaurant", "cafe"]
  },
  "seafood": {
    primary: ["seafood_restaurant"],
    secondary: []
  },
  "bbq": {
    primary: ["barbecue_restaurant"],
    secondary: ["korean_restaurant", "american_restaurant"]
  },
  "mediterranean": {
    primary: ["mediterranean_restaurant"],
    secondary: ["greek_restaurant", "turkish_restaurant"]
  },
  "greek": {
    primary: ["greek_restaurant"],
    secondary: ["mediterranean_restaurant"]
  },
  "turkish": {
    primary: ["turkish_restaurant"],
    secondary: ["mediterranean_restaurant"]
  },
  "middle eastern": {
    primary: ["middle_eastern_restaurant"],
    secondary: []
  },
  "galettes": {
    primary: ["french_restaurant", "creperie"],
    secondary: ["bakery", "cafe"]
  },
  "crepes": {
    primary: ["french_restaurant", "creperie"],
    secondary: ["bakery", "cafe"]
  },
  "galettes and crepes": {
    primary: ["french_restaurant", "creperie"],
    secondary: ["bakery", "cafe"]
  }
};

// Borough names to match
const BOROUGHS = [
  'brooklyn', 'manhattan', 'queens', 'bronx', 'staten island',
  'bk', 'the bronx'
];

// Meal types
const MEAL_TYPES = ['breakfast', 'brunch', 'lunch', 'dinner', 'late night', 'late-night'];

// Vibe keywords (for potential future use)
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
    vibeKeywords: [],
    originalQuery: query
  };

  // Extract location using regex - look for "in [location]" format
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
  } else {
    // Also check if the query contains a borough directly (without "in")
    const directBoroughMatch = BOROUGHS.find(borough => 
      lowerQuery.includes(borough)
    );
    if (directBoroughMatch) {
      keywords.borough = directBoroughMatch;
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

  // Extract cuisine type - find the matching keyword
  for (const [keyword] of Object.entries(CUISINE_TYPE_MAP)) {
    if (lowerQuery.includes(keyword)) {
      keywords.cuisineType = keyword;
      break;
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

  // Extract vibe keywords (for potential future use)
  keywords.vibeKeywords = VIBE_KEYWORDS.filter(vibe => 
    lowerQuery.includes(vibe)
  );

  console.log('Extracted keywords:', keywords);
  return keywords;
}

/**
 * Get cuisine type matches from query
 */
function getCuisineMatches(query: string): { primary: string[], secondary: string[] } | null {
  const queryLower = query.toLowerCase();
  
  for (const [keyword, typeInfo] of Object.entries(CUISINE_TYPE_MAP)) {
    if (queryLower.includes(keyword)) {
      return typeInfo;
    }
  }
  
  return null;
}

/**
 * Calculate base quality score from rating and review count
 */
function calculateQualityScore(restaurant: Restaurant): number {
  const rating = restaurant.google_data.rating || 0;
  const reviewCount = restaurant.google_data.userRatingCount || 0;
  return rating * Math.log10(reviewCount + 1);
}

/**
 * Check if restaurant matches primary type
 */
function matchesPrimaryType(restaurant: Restaurant, query: string): boolean {
  const cuisineMatches = getCuisineMatches(query);
  if (!cuisineMatches) return false;
  
  const primaryType = restaurant.google_data.primaryType?.toLowerCase() || '';
  const specificType = restaurant.specific_type?.toLowerCase() || '';
  
  return cuisineMatches.primary.some(type => 
    primaryType === type || 
    specificType === type ||
    primaryType.includes(type.replace('_', ' '))
  );
}

/**
 * Check if restaurant matches types array (excluding generic types)
 */
function matchesTypesArray(restaurant: Restaurant, query: string): boolean {
  const cuisineMatches = getCuisineMatches(query);
  if (!cuisineMatches) return false;
  
  // Filter out generic noise types
  const genericTypes = new Set([
    'point_of_interest', 'establishment', 'food', 'store',
    'lodging', 'premise', 'geocode', 'locality', 'political'
  ]);
  
  const meaningfulTypes = (restaurant.google_data.types || [])
    .map(t => t.toLowerCase())
    .filter(t => !genericTypes.has(t));
  
  return cuisineMatches.primary.some(type => 
    meaningfulTypes.some(t => t === type || t.includes(type.replace('_', ' ')))
  );
}

/**
 * Categorize restaurant into tier and calculate final score
 */
function categorizeAndScore(restaurant: Restaurant, query: string): { tier: number, score: number } {
  const baseQuality = calculateQualityScore(restaurant);
  const cynthiaBoost = restaurant.cynthias_pick ? 1.5 : 1.0;
  const finalScore = baseQuality * cynthiaBoost;
  
  // Determine tier based on how closely the restaurant matches the query
  let tier = 3; // Default: no match (shouldn't happen since we filter first)
  
  // Tier 1: Exact matches in primaryType or specificType
  if (matchesPrimaryType(restaurant, query)) {
    tier = 1;
  }
  // Tier 2: Matches in types array
  else if (matchesTypesArray(restaurant, query)) {
    tier = 2;
  }
  
  return { tier, score: finalScore };
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
  
  return true;
}

/**
 * Check if restaurant matches cuisine type criteria
 * @param restaurant - Restaurant object
 * @param keywords - Extracted keywords
 * @returns True if matches cuisine type
 */
function matchesCuisineType(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.cuisineType) {
    return true; // No cuisine type filter
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
  
  // For "cafe" and "coffee" queries, check primary type, specific type, and types array
  if (cuisineKeyword === 'cafe' || cuisineKeyword === 'coffee') {
    return primaryType.includes('cafe') || 
           primaryType.includes('coffee') ||
           specificType.includes('cafe') ||
           specificType.includes('coffee') ||
           types.some(t => t.includes('cafe') || t.includes('coffee'));
  }
  
  // For "galettes", "crepes", and "galettes and crepes" queries, check multiple sources
  if (cuisineKeyword === 'galettes' || cuisineKeyword === 'crepes' || cuisineKeyword === 'galettes and crepes') {
    const editorialSummary = restaurant.google_data.editorialSummary?.text?.toLowerCase() || '';
    const generativeSummary = restaurant.google_data.generativeSummary?.overview?.text?.toLowerCase() || '';
    const name = restaurant.google_data.displayName.text.toLowerCase();
    
    // Primary matches - these are definitely galettes/crepes places
    if (primaryType.includes('creperie') || 
        primaryType.includes('dessert_shop') ||
        specificType.includes('creperie') ||
        specificType.includes('galette') ||
        specificType.includes('crepe') ||
        name.includes('galette') ||
        name.includes('crepe') ||
        editorialSummary.includes('galette') ||
        editorialSummary.includes('crepe') ||
        generativeSummary.includes('galette') ||
        generativeSummary.includes('crepe')) {
      return true;
    }
    
    // Secondary matches - only if they have creperie in types array
    return types.some(t => t.includes('creperie'));
  }
  
  // For all other cuisines, check in order of specificity
  return specificType.includes(cuisineKeyword) ||
         primaryType.includes(cuisineKeyword) ||
         types.some(t => t.includes(cuisineKeyword));
}

/**
 * Pre-filter restaurants based on natural language query
 * Returns all filtered restaurants, sorted by tiered ranking
 * @param query - User's natural language query
 * @returns Array of filtered restaurants, sorted by tier and quality score
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
    
    // Special case: "Cynthia's favorites" - return all cynthias_pick restaurants for the city
    if (query.toLowerCase().includes("cynthia's favorites") || query.toLowerCase().includes("cynthias favorites")) {
      console.log('Special case: Cynthia\'s favorites query detected');
      
      let cynthiasPicks = restaurants.filter(restaurant => restaurant.cynthias_pick === true);
      
      // Filter by city if specified
      if (keywords.city) {
        cynthiasPicks = cynthiasPicks.filter(restaurant => {
          const city = restaurant.city?.toLowerCase() || '';
          const address = restaurant.google_data?.formattedAddress?.toLowerCase() || '';
          
          switch (keywords.city) {
            case 'nyc':
            case 'new york city':
              return city === 'new york city' || address.includes('new york') || address.includes('nyc');
            case 'tokyo':
              return city === 'tokyo' || address.includes('tokyo') || address.includes('japan');
            case 'seoul':
              return city === 'seoul' || address.includes('seoul') || address.includes('korea');
            case 'paris':
              return city === 'paris' || address.includes('paris') || address.includes('france');
            default:
              return true;
          }
        });
      }
      
      // Sort by quality score (highest first)
      cynthiasPicks.sort((a, b) => {
        const scoreA = calculateQualityScore(a);
        const scoreB = calculateQualityScore(b);
        return scoreB - scoreA;
      });
      
      console.log(`Found ${cynthiasPicks.length} Cynthia's picks for ${keywords.city || 'all cities'}`);
      return cynthiasPicks;
    }
    
    // Filter restaurants step by step
    let filteredRestaurants = restaurants.filter(restaurant => {
      try {
        // Apply all filters INCLUDING cuisine type
        const matches = matchesLocation(restaurant, keywords) &&
               matchesMealType(restaurant, keywords) &&
               matchesPrice(restaurant, keywords) &&
               matchesAmenities(restaurant, keywords) &&
               matchesCuisineType(restaurant, keywords);
        
        // Debug logging for coffee queries
        if (keywords.cuisineType === 'coffee' && matches) {
          console.log(`✅ Coffee match: ${restaurant.google_data.displayName.text}`);
          console.log(`   Primary Type: ${restaurant.google_data.primaryType}`);
          console.log(`   Specific Type: ${restaurant.specific_type}`);
          console.log(`   Serves Coffee: ${restaurant.google_data.servesCoffee}`);
        }
        
        return matches;
      } catch (error) {
        console.warn('Error filtering restaurant:', error);
        return false;
      }
    });

    console.log(`Filtered from ${restaurants.length} to ${filteredRestaurants.length} restaurants`);

    // Categorize into tiers and calculate scores
    const categorizedRestaurants = filteredRestaurants.map(restaurant => {
      const { tier, score } = categorizeAndScore(restaurant, query);
      return { restaurant, tier, score };
    });

    // Sort by tier first (1 = best), then by score within each tier (highest first)
    categorizedRestaurants.sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier; // Lower tier number = higher priority
      }
      return b.score - a.score; // Higher score = higher priority within same tier
    });

    // Return all matching results
    const sortedRestaurants = categorizedRestaurants.map(item => item.restaurant);
    console.log(`Returning ${sortedRestaurants.length} sorted restaurants`);
    
    return sortedRestaurants;
  } catch (error) {
    console.error('Error in preFilterRestaurants:', error);
    return [];
  }
}

// Test function with tier information
function testRanking(query: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Query: "${query}"`);
  console.log('='.repeat(60));
  
  const keywords = extractKeywords(query);
  console.log(`\nExtracted: cuisineType="${keywords.cuisineType}", location="${keywords.neighborhood || keywords.borough || keywords.city}"`);
  
  const results = preFilterRestaurants(query);
  
  console.log(`\nFound ${results.length} candidates\n`);
  
  results.slice(0, 8).forEach((r, i) => {
    const { tier, score } = categorizeAndScore(r, query);
    console.log(`${i + 1}. ${r.google_data.displayName.text}`);
    console.log(`   Tier: ${tier} (${tier === 1 ? 'Primary/Specific Type Match' : tier === 2 ? 'Types Array Match' : 'No Match'})`);
    console.log(`   Primary Type: ${r.google_data.primaryType}`);
    console.log(`   Specific Type: ${r.specific_type}`);
    console.log(`   Types: ${(r.google_data.types || []).slice(0, 3).join(', ')}...`);
    console.log(`   Rating: ${r.google_data.rating} (${r.google_data.userRatingCount} reviews)`);
    console.log(`   Quality Score: ${score.toFixed(2)}`);
    console.log(`   Cynthia's Pick: ${r.cynthias_pick ? 'YES ⭐ (1.5x boost)' : 'No'}`);
    console.log(`   Neighborhood: ${r.neighborhood_extracted}`);
    console.log('');
  });
}

// Uncomment to run tests
// console.log('\n🧪 Testing Tiered Ranking System...\n');
// testRanking("coffee shop in Paris");
// testRanking("bakery in Brooklyn");
// testRanking("ramen in Manhattan");
// testRanking("italian restaurant in Crown Heights");

// Filter service ready for use
// At the end of filterService.ts

/**
 * Determine if a query is complex enough to warrant Claude API usage
 */
export function isComplexQuery(query: string, keywords: ExtractedKeywords): boolean {
  const lowerQuery = query.toLowerCase();
  
  // 1. Vibe/atmosphere keywords
  const vibeWords = [
    'romantic', 'cozy', 'intimate', 'lively', 'quiet', 'trendy', 
    'hip', 'cool', 'chill', 'vibey', 'vibes', 'atmosphere',
    'instagram', 'insta', 'aesthetic', 'beautiful', 'pretty',
    'hidden gem', 'local favorite', 'touristy', 'local', 'authentic'
  ];
  if (vibeWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 2. Occasion keywords
  const occasionWords = [
    'date', 'anniversary', 'birthday', 'celebration', 'special occasion',
    'impress', 'client', 'business', 'proposal', 'parents',
    'first date', 'catch up', 'reunion', 'meeting'
  ];
  if (occasionWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 3. Subjective quality words
  const subjectiveWords = [
    'best', 'favorite', 'top', 'recommend', 'should i',
    'real', 'true', 'genuine', 'hidden',
    'overrated', 'underrated', 'worth it', 'overhyped',
    'perfect', 'ideal', 'amazing', 'great'
  ];
  if (subjectiveWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 4. Emotional/mood keywords
  const moodWords = [
    'comfort', 'comforting', 'warm', 'fresh', 'light',
    'heavy', 'indulgent', 'healthy', 'guilty pleasure',
    'cheer me up', 'rainy day', 'summer', 'winter', 'seasonal'
  ];
  if (moodWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 5. Comparison/decision words
  const comparisonWords = [
    'better', 'versus', 'vs', 'compare', 'which',
    'difference between', 'prefer'
  ];
  if (comparisonWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 6. Negative constraints
  const negativeWords = ['not', "don't", 'avoid', 'without', 'no ', "isn't", "aren't"];
  if (negativeWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 7. Vague/exploratory queries
  const vagueWords = [
    'surprise', 'different', 'unique', 'interesting',
    'what should i', 'help me', 'suggest', 'ideas'
  ];
  if (vagueWords.some(word => lowerQuery.includes(word))) {
    return true;
  }
  
  // 8. Very short and vague
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount <= 3 && !keywords.neighborhood && !keywords.cuisineType && !keywords.borough) {
    return true;
  }
  
  // 9. Multiple vibe keywords
  if (keywords.vibeKeywords && keywords.vibeKeywords.length > 1) {
    return true;
  }
  
  // 10. Simple queries should be fast (cuisine + location only)
  // If it's just cuisine + city/neighborhood, it's simple
  const hasOnlyBasicCriteria = (keywords.cuisineType || keywords.city || keywords.neighborhood) && 
                               !vibeWords.some(word => lowerQuery.includes(word)) &&
                               !occasionWords.some(word => lowerQuery.includes(word)) &&
                               !subjectiveWords.some(word => lowerQuery.includes(word)) &&
                               !moodWords.some(word => lowerQuery.includes(word)) &&
                               !comparisonWords.some(word => lowerQuery.includes(word)) &&
                               !negativeWords.some(word => lowerQuery.includes(word)) &&
                               !vagueWords.some(word => lowerQuery.includes(word));
  
  if (hasOnlyBasicCriteria) {
    return false; // Simple query - use fast filtering
  }
  
  // Default: complex query
  return true;
}