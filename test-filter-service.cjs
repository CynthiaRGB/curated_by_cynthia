// test-filter-service.cjs
// Comprehensive test suite for the filter service

const fs = require('fs');
const path = require('path');

console.log('🧪 FILTER SERVICE TEST SUITE\n');
console.log('='.repeat(70));

// Load the restaurant data
const restaurantDataPath = path.join(__dirname, 'src', 'data', 'google_enriched_restaurants_311_clean.json');
const restaurantData = JSON.parse(fs.readFileSync(restaurantDataPath, 'utf8'));
const restaurants = restaurantData.places || [];

console.log(`📊 Loaded ${restaurants.length} restaurants from data\n`);

// Simple keyword extraction function (copied from filterService)
function extractKeywords(query) {
  const lowerQuery = query.toLowerCase();
  const keywords = {
    vibeKeywords: []
  };

  // Extract location using regex
  const locationMatch = lowerQuery.match(/in ([\w\s]+)/);
  if (locationMatch) {
    const location = locationMatch[1].trim();
    
    // Check if it's a borough
    const BOROUGHS = [
      'brooklyn', 'manhattan', 'queens', 'bronx', 'staten island',
      'bk', 'manhattan', 'queens', 'the bronx'
    ];
    
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

  // Extract cuisine type
  const CUISINE_TYPES = [
    'italian', 'japanese', 'french', 'korean', 'chinese', 'mexican', 'thai', 
    'vietnamese', 'indian', 'american', 'ramen', 'sushi', 'pizza', 'burger', 
    'bakery', 'cafe', 'dessert', 'seafood', 'steak', 'bbq', 'mediterranean',
    'middle eastern', 'latin', 'spanish', 'greek', 'turkish', 'ethiopian',
    'caribbean', 'soul food', 'southern', 'tex-mex', 'fusion', 'vegetarian',
    'vegan', 'healthy', 'fast food', 'fine dining', 'brunch', 'breakfast'
  ];
  
  const cuisineMatch = CUISINE_TYPES.find(cuisine => 
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

  return keywords;
}

// Simple filtering function (copied from filterService)
function preFilterRestaurants(query) {
  try {
    console.log(`🔍 Processing query: "${query}"`);
    
    // Extract keywords from query
    const keywords = extractKeywords(query);
    console.log(`   Keywords:`, JSON.stringify(keywords, null, 2));
    
    // Filter restaurants step by step
    let filteredRestaurants = restaurants.filter(restaurant => {
      try {
        // Location filter
        if (keywords.neighborhood || keywords.borough || keywords.city) {
          const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
          const neighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
          
          let locationMatch = false;
          
          if (keywords.neighborhood) {
            locationMatch = neighborhood.includes(keywords.neighborhood.toLowerCase());
          }
          
          if (keywords.borough) {
            const addressComponents = restaurant.google_data.addressComponents || [];
            const boroughComponent = addressComponents.find(comp => 
              comp.types && comp.types.includes('sublocality_level_1')
            );
            if (boroughComponent) {
              const borough = boroughComponent.longText.toLowerCase();
              locationMatch = borough.includes(keywords.borough.toLowerCase());
            }
          }
          
          if (keywords.city) {
            switch (keywords.city) {
              case 'nyc':
                locationMatch = address.includes('new york') || address.includes('nyc');
                break;
              case 'tokyo':
                locationMatch = address.includes('tokyo') || address.includes('japan');
                break;
              case 'seoul':
                locationMatch = address.includes('seoul') || address.includes('korea');
                break;
              case 'paris':
                locationMatch = address.includes('paris') || address.includes('france');
                break;
            }
          }
          
          if (!locationMatch) return false;
        }

        // Cuisine filter
        if (keywords.cuisineType) {
          const cuisineKeyword = keywords.cuisineType.toLowerCase();
          
          const specificType = restaurant.specific_type?.toLowerCase().includes(cuisineKeyword);
          const primaryType = restaurant.google_data.primaryType?.toLowerCase().includes(cuisineKeyword);
          const typesMatch = restaurant.google_data.types?.some(type => 
            type && type.toLowerCase().includes(cuisineKeyword)
          );
          
          if (!specificType && !primaryType && !typesMatch) return false;
        }

        // Price filter
        if (keywords.priceLevel && keywords.priceLevel !== 'any') {
          const priceRange = restaurant.google_data.priceRange;
          if (priceRange) {
            const startPrice = parseInt(priceRange.startPrice.units);
            const endPrice = parseInt(priceRange.endPrice.units);
            const avgPrice = (startPrice + endPrice) / 2;

            switch (keywords.priceLevel) {
              case 'budget':
                if (avgPrice > 15) return false;
                break;
              case 'moderate':
                if (avgPrice <= 15 || avgPrice > 30) return false;
                break;
              case 'upscale':
                if (avgPrice <= 30) return false;
                break;
            }
          }
        }

        return true;
      } catch (error) {
        console.warn('Error filtering restaurant:', error);
        return false;
      }
    });

    console.log(`   Filtered from ${restaurants.length} to ${filteredRestaurants.length} restaurants`);

    // Sort by quality score (Cynthia's picks boosted)
    filteredRestaurants.sort((a, b) => {
      try {
        const ratingA = a.google_data.rating || 0;
        const reviewCountA = a.google_data.userRatingCount || 0;
        const scoreA = ratingA * Math.log10(reviewCountA + 1) * (a.cynthias_pick ? 2.0 : 1.0);
        
        const ratingB = b.google_data.rating || 0;
        const reviewCountB = b.google_data.userRatingCount || 0;
        const scoreB = ratingB * Math.log10(reviewCountB + 1) * (b.cynthias_pick ? 2.0 : 1.0);
        
        return scoreB - scoreA; // Descending order
      } catch (error) {
        console.warn('Error calculating quality score:', error);
        return 0;
      }
    });

    // Return top 10-12 candidates
    const results = filteredRestaurants.slice(0, 12);
    console.log(`   Returning top ${results.length} candidates\n`);
    return results;
  } catch (error) {
    console.error('Error in preFilterRestaurants:', error);
    return [];
  }
}

// Test cases
const testQueries = [
  'cheap Italian in Brooklyn',
  'romantic dinner in Tokyo',
  'coffee shops in Seoul',
  'expensive French in Paris',
  'ramen in New York City',
  'breakfast in Manhattan',
  'takeout Korean food',
  'budget-friendly restaurants',
  'fine dining in Tokyo',
  'cafe with coffee in Seoul'
];

console.log('📝 Testing restaurant filtering:');
console.log('==================================\n');

testQueries.forEach((query, index) => {
  console.log(`${index + 1}. Query: "${query}"`);
  const results = preFilterRestaurants(query);
  
  if (results.length > 0) {
    console.log(`   Top 3 results:`);
    results.slice(0, 3).forEach((restaurant, i) => {
      const name = restaurant.google_data.displayName.text;
      const rating = restaurant.google_data.rating || 0;
      const address = restaurant.google_data.formattedAddress || 'N/A';
      const cynthiasPick = restaurant.cynthias_pick ? ' 🏆' : '';
      const priceDisplay = restaurant.price_display || 'N/A';
      console.log(`     ${i + 1}. ${name} (${rating}⭐, ${priceDisplay})${cynthiasPick}`);
      console.log(`        ${address}`);
    });
  } else {
    console.log('   No results found');
  }
  console.log('');
});

console.log('✅ Filter service test completed!');

