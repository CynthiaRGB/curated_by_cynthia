const fs = require('fs');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// Restaurants to fetch - extracted from Google Maps URLs
const restaurants = [
  {
    name: 'Ningyocho Imahan',
    placeId: 'ChIJgZqPF5xZwokRpvgGBzKP6FU', // Will extract from URL or search
    url: 'https://www.google.com/maps/place/Ningyocho+Imahan/@35.6855801,139.7742317,15.92z/data=!4m10!1m2!2m1!1sImahan!3m6!1s0x6018894fd1c12f2f:0x306acc4e4e9ed1cf!8m2!3d35.6857703!4d139.7836715'
  },
  {
    name: 'Yakitori Nonotori Gencho Toranomon Hills Station Tower',
    placeId: 'ChIJjRtEAgCLGGARzMsbWVOiGKI', // Already added to 276_reduced.ts, but we'll fetch it anyway
    url: 'https://www.google.com/maps/place/Yakitori+Nonotori+Gencho+Toranomon+Hills+Station+Tower/@35.6659795,139.7450278,17.14z/data=!4m15!1m8!3m7!1s0x60188b916d85198f:0x1572d29c15676716'
  }
];

if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_PLACES_API_KEY environment variable not set');
  process.exit(1);
}

/**
 * Extract place ID from Google Maps URL or search for it
 */
async function getPlaceId(restaurant) {
  // Try to extract from URL first
  const urlMatch = restaurant.url.match(/1s([^!]+)/);
  if (urlMatch) {
    // The place ID is encoded in the URL, but we need the actual Google Place ID
    // Let's search by name instead
    console.log(`Searching for: "${restaurant.name}"...`);
    
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
          textQuery: `${restaurant.name} Tokyo`,
          languageCode: 'en'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.places && data.places.length > 0) {
        const placeId = data.places[0].id;
        console.log(`  ✓ Found: ${data.places[0].displayName?.text}`);
        console.log(`  Place ID: ${placeId}\n`);
        return placeId;
      }
      
      throw new Error('No results found');
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}\n`);
      return null;
    }
  }
  
  return restaurant.placeId;
}

/**
 * Get full place details with all fields
 */
async function getPlaceDetails(placeId) {
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    // Request all fields
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
    
    return await response.json();
  } catch (error) {
    console.error(`  ✗ Error fetching details: ${error.message}\n`);
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
  let city = 'Tokyo'; // Default
  
  if (placeData.addressComponents) {
    const neighborhoodComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('neighborhood') || comp.types?.includes('sublocality_level_2')
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
  let countryCode = 'JP';
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
                        `https://maps.google.com/?cid=${placeId}`,
        location: {
          address: formattedAddress,
          country_code: countryCode,
          name: placeData.displayName?.text || 'Unknown'
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
  console.log('='.repeat(60));
  console.log('Fetching Additional Restaurants from Google Places API');
  console.log('='.repeat(60));
  console.log('');
  
  const results = [];
  
  for (const restaurant of restaurants) {
    try {
      // Get place ID
      const placeId = await getPlaceId(restaurant);
      if (!placeId) {
        console.log(`⚠ Skipping ${restaurant.name} - could not find place ID\n`);
        continue;
      }
      
      // Get full details
      console.log(`Fetching full details for ${restaurant.name}...`);
      const placeData = await getPlaceDetails(placeId);
      console.log(`✓ Successfully fetched details\n`);
      
      // Format the data
      const formatted = formatRestaurantData(placeData, placeId);
      results.push(formatted);
      
      console.log(`✓ Added: ${formatted.google_data.displayName?.text}`);
      console.log(`  Place ID: ${formatted.google_place_id}`);
      console.log(`  Address: ${formatted.original_place.properties.location.address}`);
      console.log(`  City: ${formatted.city}`);
      console.log(`  Neighborhood: ${formatted.neighborhood_extracted || 'N/A'}`);
      console.log(`  Price: ${formatted.price_display}`);
      console.log(`  Rating: ${formatted.google_data.rating || 'N/A'}\n`);
      
    } catch (error) {
      console.error(`✗ Failed to fetch ${restaurant.name}: ${error.message}\n`);
    }
  }
  
  // Write to file
  if (results.length > 0) {
    const outputFile = './api/data/additional_restaurants_google_api.ts';
    
    let content = '// Additional restaurants fetched from Google Places API\n';
    content += '// Use this file to store restaurants added via Google API calls\n';
    content += `// Created: ${new Date().toISOString()}\n\n`;
    content += 'export const restaurantData = [\n';
    
    // Add each restaurant with proper formatting
    results.forEach((restaurant, index) => {
      const jsonStr = JSON.stringify(restaurant, null, 2);
      // Add indentation
      const indented = jsonStr.split('\n').map((line, i) => {
        if (i === 0) return '  ' + line;
        return '  ' + line;
      }).join('\n');
      
      content += indented;
      if (index < results.length - 1) {
        content += ',';
      }
      content += '\n';
    });
    
    content += '];\n';
    
    fs.writeFileSync(outputFile, content);
    
    console.log('='.repeat(60));
    console.log(`✓ SUCCESS! Added ${results.length} restaurant(s) to ${outputFile}`);
    console.log('='.repeat(60));
  } else {
    console.log('⚠ No restaurants were successfully fetched');
  }
}

main();

