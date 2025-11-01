const fs = require('fs');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

const RESTAURANT_NAME = 'Yakitori Nonotori Gencho Toranomon Hills Station Tower';
const LOCATION = 'Tokyo, Japan';

if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_PLACES_API_KEY environment variable not set');
  console.error('Please set it with: export GOOGLE_PLACES_API_KEY="your-key"');
  process.exit(1);
}

/**
 * Step 1: Search for the restaurant using Text Search
 */
async function searchRestaurant() {
  console.log(`Searching for: "${RESTAURANT_NAME}" in ${LOCATION}...\n`);
  
  try {
    const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({
        textQuery: `${RESTAURANT_NAME} ${LOCATION}`,
        languageCode: 'en'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.places || data.places.length === 0) {
      throw new Error('No restaurants found with that name');
    }
    
    // Get the first result (most relevant)
    const place = data.places[0];
    const placeId = place.id;
    
    console.log('✓ Found restaurant:');
    console.log(`  Name: ${place.displayName?.text || 'N/A'}`);
    console.log(`  Address: ${place.formattedAddress || 'N/A'}`);
    console.log(`  Place ID: ${placeId}\n`);
    
    return placeId;
  } catch (error) {
    console.error('✗ Error searching for restaurant:', error.message);
    throw error;
  }
}

/**
 * Step 2: Get full place details with all fields
 */
async function getPlaceDetails(placeId) {
  console.log('Fetching full place details...\n');
  
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    // Request all the fields that match the structure in the data file
    const fieldMask = [
      'id',
      'displayName',
      'formattedAddress',
      'addressComponents',
      'location',
      'types',
      'primaryType',
      'rating',
      'userRatingCount',
      'priceRange',
      'regularOpeningHours',
      'currentOpeningHours',
      'googleMapsUri',
      'websiteUri',
      'utcOffsetMinutes',
      'adrFormatAddress',
      'businessStatus',
      'priceLevel',
      'takeout',
      'delivery',
      'dineIn',
      'curbsidePickup',
      'reservable',
      'servesBreakfast',
      'servesLunch',
      'servesDinner',
      'servesBeer',
      'servesWine',
      'servesBrunch',
      'servesVegetarianFood',
      'primaryTypeDisplayName',
      'shortFormattedAddress',
      'editorialSummary',
      'outdoorSeating',
      'liveMusic',
      'menuForChildren',
      'servesCocktails',
      'servesDessert',
      'servesCoffee',
      'allowsDogs',
      'restroom',
      'goodForGroups',
      'goodForWatchingSports',
      'paymentOptions',
      'parkingOptions',
      'accessibilityOptions',
      'generativeSummary',
      'pureServiceAreaBusiness',
      'addressDescriptor',
      'googleMapsLinks',
      'reviewSummary',
      'timeZone',
      'postalAddress',
      'photos'
    ].join(',');
    
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fieldMask
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }
    
    const placeData = await response.json();
    
    console.log('✓ Successfully fetched place details\n');
    return placeData;
  } catch (error) {
    console.error('✗ Error fetching place details:', error.message);
    throw error;
  }
}

/**
 * Step 3: Format the data to match the structure in 276_reduced.ts
 */
function formatRestaurantData(placeData, placeId) {
  console.log('Formatting restaurant data...\n');
  
  const now = new Date();
  const enrichmentDate = now.toISOString();
  
  // Extract neighborhood from address components
  let neighborhood = null;
  let city = 'Tokyo'; // Default
  
  if (placeData.addressComponents) {
    const neighborhoodComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('neighborhood') || comp.types?.includes('sublocality')
    );
    if (neighborhoodComponent) {
      neighborhood = neighborhoodComponent.longText;
    }
    
    // Get city from administrative_area_level_1 or locality
    const cityComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('locality') || comp.types?.includes('administrative_area_level_1')
    );
    if (cityComponent && cityComponent.longText) {
      city = cityComponent.longText;
    }
  }
  
  // Determine price display from priceLevel or priceRange
  let priceDisplay = 'N/A';
  if (placeData.priceLevel) {
    const priceMap = {
      'PRICE_LEVEL_FREE': 'Free',
      'PRICE_LEVEL_INEXPENSIVE': '$',
      'PRICE_LEVEL_MODERATE': '$$',
      'PRICE_LEVEL_EXPENSIVE': '$$$',
      'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$'
    };
    priceDisplay = priceMap[placeData.priceLevel] || 'N/A';
  } else if (placeData.priceRange) {
    // Calculate from price range if available
    const startPrice = parseInt(placeData.priceRange.startPrice?.units || '0');
    if (startPrice > 0) {
      if (startPrice < 50) priceDisplay = '$';
      else if (startPrice < 100) priceDisplay = '$$';
      else if (startPrice < 200) priceDisplay = '$$$';
      else priceDisplay = '$$$$';
    }
  }
  
  // Extract specific type from primaryType or types
  let specificType = placeData.primaryType || 
                     placeData.types?.[0]?.replace(/_/g, ' ') || 
                     'restaurant';
  
  // Build original_place structure
  const coordinates = placeData.location 
    ? [placeData.location.longitude, placeData.location.latitude]
    : [0, 0];
  
  const formattedAddress = placeData.formattedAddress || 
                          placeData.adrFormatAddress?.replace(/<[^>]*>/g, '') || 
                          'Address not available';
  
  // Extract country code from addressComponents
  let countryCode = 'JP'; // Default for Tokyo
  if (placeData.addressComponents) {
    const countryComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('country')
    );
    if (countryComponent) {
      countryCode = countryComponent.shortText || countryCode;
    }
  }
  
  const restaurantData = {
    original_place: {
      geometry: {
        coordinates: coordinates,
        type: 'Point'
      },
      properties: {
        date: now.toISOString(),
        google_maps_url: placeData.googleMapsUri || 
                        placeData.googleMapsLinks?.placeUri || 
                        `https://maps.google.com/?cid=${placeId}`,
        location: {
          address: formattedAddress,
          country_code: countryCode,
          name: placeData.displayName?.text || RESTAURANT_NAME
        }
      },
      type: 'Feature'
    },
    google_place_id: placeId,
    google_data: {
      name: `places/${placeId}`,
      id: placeId,
      ...placeData  // Include all the fetched place data
    },
    place_classification: 'restaurant',
    specific_type: specificType,
    neighborhood_extracted: neighborhood,
    enrichment_status: 'success',
    enrichment_date: enrichmentDate,
    cynthias_pick: false,
    price_display: priceDisplay,
    city: city,
    vibe_tags: [],
    occasion_tags: [],
    crowd_tags: [],
    service_tags: [],
    noise_level: null,
    food_quality_tags: [],
    value_tag: null,
    special_features: [],
    booking_tags: [],
    negative_tags: [],
    accolades_tags: []
  };
  
  return restaurantData;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Fetching Restaurant Data from Google Places API');
    console.log('='.repeat(60));
    console.log('');
    
    // Step 1: Search for the restaurant
    const placeId = await searchRestaurant();
    
    // Step 2: Get full place details
    const placeData = await getPlaceDetails(placeId);
    
    // Step 3: Format the data
    const restaurantData = formatRestaurantData(placeData, placeId);
    
    // Save to JSON file for review
    const outputFile = './restaurant-data-output.json';
    fs.writeFileSync(outputFile, JSON.stringify(restaurantData, null, 2));
    
    console.log('='.repeat(60));
    console.log('✓ SUCCESS! Restaurant data fetched and formatted');
    console.log('='.repeat(60));
    console.log(`\nOutput saved to: ${outputFile}`);
    console.log('\nNext steps:');
    console.log('1. Review the JSON file to ensure data is correct');
    console.log('2. Add the restaurant object to 276_reduced.ts');
    console.log('3. Ensure proper formatting and placement in the array\n');
    
    // Also print a preview
    console.log('Preview:');
    console.log(JSON.stringify({
      name: restaurantData.google_data.displayName?.text,
      place_id: restaurantData.google_place_id,
      address: restaurantData.original_place.properties.location.address,
      city: restaurantData.city,
      neighborhood: restaurantData.neighborhood_extracted,
      price: restaurantData.price_display,
      rating: restaurantData.google_data.rating,
      types: restaurantData.google_data.types?.slice(0, 3)
    }, null, 2));
    
  } catch (error) {
    console.error('\n✗ FAILED:', error.message);
    process.exit(1);
  }
}

main();

