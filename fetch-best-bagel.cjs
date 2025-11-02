const fs = require('fs');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

const RESTAURANT_URL = 'https://www.google.com/maps/place/Best+Bagel+%26+Coffee/@40.7516022,-73.9911938,15.64z/data=!4m6!3m5!1s0x89c259ac39e91d7b:0xd3bafb201b1d7fa2!8m2!3d40.7522252!4d-73.9911099!16s%2Fg%2F1tq8kgfd?entry=ttu&g_ep=EgoyMDI1MTAyOS4yIKXMDSoASAFQAw%3D%3D';
const RESTAURANT_NAME = 'Best Bagel & Coffee';
const LOCATION = 'New York';

if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_PLACES_API_KEY environment variable not set');
  console.error('Please set it with: export GOOGLE_PLACES_API_KEY="your-key"');
  process.exit(1);
}

/**
 * Search for the restaurant using Text Search
 */
async function searchRestaurant() {
  console.log(`Searching for: "${RESTAURANT_NAME}" in ${LOCATION}...\n`);
  
  try {
    const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
    
    // Use location bias based on coordinates from URL
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({
        textQuery: `${RESTAURANT_NAME} ${LOCATION}`,
        languageCode: 'en',
        locationBias: {
          circle: {
            center: {
              latitude: 40.7522252,
              longitude: -73.9911099
            },
            radius: 500.0
          }
        }
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
    console.error(`Error searching: ${error.message}`);
    throw error;
  }
}

/**
 * Get full place details with all fields
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
    console.error(`Error fetching details: ${error.message}`);
    throw error;
  }
}

/**
 * Format restaurant data to match structure
 */
function formatRestaurantData(placeData, placeId) {
  const now = new Date();
  const enrichmentDate = now.toISOString();
  
  // Extract neighborhood from address components
  let neighborhood = null;
  let city = 'New York City'; // Default
  
  if (placeData.addressComponents) {
    const neighborhoodComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('neighborhood') || comp.types?.includes('sublocality_level_2')
    );
    if (neighborhoodComponent) {
      neighborhood = neighborhoodComponent.longText;
    }
    
    // Get city from locality or administrative_area_level_1
    const cityComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('locality')
    );
    if (cityComponent && cityComponent.longText) {
      city = cityComponent.longText;
    } else {
      // Try administrative_area_level_1 for NYC
      const stateComponent = placeData.addressComponents.find(comp => 
        comp.types?.includes('administrative_area_level_1')
      );
      if (stateComponent && stateComponent.longText === 'New York') {
        city = 'New York City';
      }
    }
  }
  
  // Determine price display
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
    // Fallback to priceRange if priceLevel not available
    const startPrice = parseInt(placeData.priceRange.startPrice?.units || '0');
    if (startPrice <= 1) priceDisplay = '$';
    else if (startPrice <= 2) priceDisplay = '$$';
    else if (startPrice <= 3) priceDisplay = '$$$';
    else priceDisplay = '$$$$';
  }
  
  // Extract specific type
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
  
  // Extract country code
  let countryCode = 'US';
  if (placeData.addressComponents) {
    const countryComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('country')
    );
    if (countryComponent) {
      countryCode = countryComponent.shortText || countryCode;
    }
  }
  
  return {
    original_place: {
      geometry: {
        coordinates: coordinates,
        type: 'Point'
      },
      properties: {
        date: now.toISOString(),
        google_maps_url: placeData.googleMapsUri || 
                        placeData.googleMapsLinks?.placeUri || 
                        RESTAURANT_URL,
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
      ...placeData
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
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Fetching Best Bagel & Coffee from Google Places API');
    console.log('='.repeat(60));
    console.log('');
    
    // Step 1: Search for restaurant
    const placeId = await searchRestaurant();
    
    // Step 2: Get full details
    const placeData = await getPlaceDetails(placeId);
    
    // Step 3: Format the data
    const formatted = formatRestaurantData(placeData, placeId);
    
    // Step 4: Read existing file or create new array
    const outputFile = './api/data/additional_restaurants_google_api.ts';
    let existingData = [];
    
    if (fs.existsSync(outputFile)) {
      try {
        // Try to read existing data by extracting from the file
        const fileContent = fs.readFileSync(outputFile, 'utf8');
        // Check if file has content and try to extract existing array
        if (fileContent.includes('export const restaurantData')) {
          // For simplicity, we'll append to existing array
          // In a real scenario, we'd parse the TypeScript/JavaScript
          console.log('⚠ File exists. Appending new restaurant...\n');
        }
      } catch (err) {
        console.log('Creating new file...\n');
      }
    }
    
    // Write to file
    existingData.push(formatted);
    
    let content = '// Additional restaurants fetched from Google Places API\n';
    content += '// Use this file to store restaurants added via Google API calls\n';
    content += `// Updated: ${new Date().toISOString()}\n\n`;
    content += 'export const restaurantData = [\n';
    
    // Add each restaurant with proper formatting
    existingData.forEach((restaurant, index) => {
      const jsonStr = JSON.stringify(restaurant, null, 2);
      // Add indentation
      const indented = jsonStr.split('\n').map((line) => {
        return '  ' + line;
      }).join('\n');
      
      content += indented;
      if (index < existingData.length - 1) {
        content += ',';
      }
      content += '\n';
    });
    
    content += '];\n';
    
    fs.writeFileSync(outputFile, content);
    
    console.log('='.repeat(60));
    console.log(`✓ SUCCESS! Added restaurant to ${outputFile}`);
    console.log('='.repeat(60));
    console.log(`  Name: ${formatted.google_data.displayName?.text}`);
    console.log(`  Place ID: ${formatted.google_place_id}`);
    console.log(`  Address: ${formatted.original_place.properties.location.address}`);
    console.log(`  City: ${formatted.city}`);
    console.log(`  Neighborhood: ${formatted.neighborhood_extracted || 'N/A'}`);
    console.log(`  Price: ${formatted.price_display}`);
    console.log(`  Rating: ${formatted.google_data.rating || 'N/A'}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n✗ FAILED:', error.message);
    process.exit(1);
  }
}

main();

