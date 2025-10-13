// Simple test for West Village brunch search
const fs = require('fs');

// Load the restaurant data
const data = JSON.parse(fs.readFileSync('src/data/google_enriched_restaurants_311_clean.json', 'utf8'));
const restaurants = data.places;

console.log('=== TESTING WEST VILLAGE BRUNCH SEARCH ===\n');

// Simulate the keyword extraction from the filter service
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

  return keywords;
}

// Test the location matching with the fixed logic
function matchesLocation(restaurant, keywords) {
  if (!keywords.neighborhood && !keywords.borough && !keywords.city) {
    return true; // No location filter
  }

  // Check neighborhood match (FIXED VERSION)
  if (keywords.neighborhood) {
    const neighborhood = restaurant.neighborhood_extracted?.toLowerCase() || '';
    const address = restaurant.google_data.formattedAddress.toLowerCase();
    const name = restaurant.google_data.displayName.text.toLowerCase();
    const neighborhoodKeyword = keywords.neighborhood.toLowerCase();
    
    // Check neighborhood field, address, or name for neighborhood match
    if (neighborhood.includes(neighborhoodKeyword) ||
        address.includes(neighborhoodKeyword) ||
        name.includes(neighborhoodKeyword)) {
      return true;
    }
  }

  return false;
}

// Test cuisine matching
function matchesCuisine(restaurant, keywords) {
  if (!keywords.cuisineType) {
    return true; // No cuisine filter
  }

  const cuisineKeyword = keywords.cuisineType.toLowerCase();
  
  // Check specific_type
  if (restaurant.specific_type?.toLowerCase().includes(cuisineKeyword)) {
    return true;
  }

  // Check primaryType
  if (restaurant.google_data.primaryType?.toLowerCase().includes(cuisineKeyword)) {
    return true;
  }

  // Check types array
  if (restaurant.google_data.types?.some(type => 
    type && type.toLowerCase().includes(cuisineKeyword)
  )) {
    return true;
  }

  return false;
}

// Test the query
const query = 'brunch in west village';
console.log('Query:', query);

const keywords = extractKeywords(query);
console.log('Extracted keywords:', keywords);

// Filter restaurants
const filteredRestaurants = restaurants.filter(restaurant => {
  try {
    return matchesLocation(restaurant, keywords) && matchesCuisine(restaurant, keywords);
  } catch (error) {
    console.warn('Error filtering restaurant:', error);
    return false;
  }
});

console.log(`\nFiltered from ${restaurants.length} to ${filteredRestaurants.length} restaurants`);

if (filteredRestaurants.length > 0) {
  console.log('\n✅ SUCCESS! Found restaurants:');
  filteredRestaurants.forEach((r, i) => {
    console.log(`${i + 1}. ${r.google_data.displayName.text}`);
    console.log(`   Address: ${r.google_data.formattedAddress}`);
    console.log(`   Types: ${r.google_data.types.join(', ')}`);
    console.log('');
  });
} else {
  console.log('\n❌ FAILED! No restaurants found');
}

