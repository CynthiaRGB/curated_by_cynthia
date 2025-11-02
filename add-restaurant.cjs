#!/usr/bin/env node

/**
 * Complete Restaurant Addition Script
 * 
 * This script automates the entire process of adding a new restaurant:
 * 1. Fetches restaurant data from Google Places API using Google Maps URL
 * 2. Saves to additional_restaurants_google_api.ts
 * 3. Enriches with metadata tags using Claude API
 * 4. Removes unwanted metadata fields
 * 5. Downloads first 3 photos at highest resolution
 * 
 * Usage: node add-restaurant.cjs "https://www.google.com/maps/place/..."
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const RESTAURANT_URL = process.argv[2];

// File paths
const ADDITIONAL_RESTAURANTS_FILE = './api/data/additional_restaurants_google_api.ts';
const OUTPUT_DIR = './public/restaurant-photos';
const MAPPING_FILE = path.join(OUTPUT_DIR, 'photo-mapping.json');

// Metadata fields to remove
const FIELDS_TO_REMOVE = [
  'websiteUri',
  'regularOpeningHours',
  'currentOpeningHours',
  'utcOffsetMinutes',
  'addressComponents',
  'adrFormatAddress',
  'pureServiceAreaBusiness'
];

if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: GOOGLE_PLACES_API_KEY environment variable not set');
  console.error('   Set it with: export GOOGLE_PLACES_API_KEY="your-key"');
  process.exit(1);
}

if (!RESTAURANT_URL) {
  console.error('❌ ERROR: Please provide a Google Maps URL');
  console.error('   Usage: node add-restaurant.cjs "https://www.google.com/maps/place/..."');
  process.exit(1);
}

// Extract restaurant name from URL
function extractRestaurantNameFromUrl(url) {
  const match = url.match(/place\/([^/@]+)/);
  if (match) {
    return decodeURIComponent(match[1].replace(/\+/g, ' '));
  }
  return null;
}

// Extract coordinates from URL for location bias
function extractCoordinatesFromUrl(url) {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    return {
      latitude: parseFloat(match[1]),
      longitude: parseFloat(match[2])
    };
  }
  return null;
}

/**
 * Step 1: Search for restaurant using Google Places API
 */
async function searchRestaurant(url) {
  const restaurantName = extractRestaurantNameFromUrl(url);
  const coords = extractCoordinatesFromUrl(url);
  
  console.log(`\n🔍 Step 1: Searching for restaurant...`);
  console.log(`   URL: ${url}`);
  console.log(`   Name: ${restaurantName || 'Unknown'}\n`);
  
  try {
    const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
    
    const body = {
      textQuery: restaurantName || url,
      languageCode: 'en'
    };
    
    // Add location bias if coordinates found
    if (coords) {
      body.locationBias = {
        circle: {
          center: coords,
          radius: 500.0
        }
      };
    }
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.places || data.places.length === 0) {
      throw new Error('No restaurants found with that URL');
    }
    
    const place = data.places[0];
    const placeId = place.id;
    
    console.log(`✓ Found restaurant:`);
    console.log(`   Name: ${place.displayName?.text || 'N/A'}`);
    console.log(`   Address: ${place.formattedAddress || 'N/A'}`);
    console.log(`   Place ID: ${placeId}\n`);
    
    return placeId;
  } catch (error) {
    console.error(`❌ Error searching: ${error.message}`);
    throw error;
  }
}

/**
 * Step 2: Get full place details
 */
async function getPlaceDetails(placeId) {
  console.log(`📥 Step 2: Fetching full place details...\n`);
  
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
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
    console.log(`✓ Successfully fetched place details\n`);
    
    return placeData;
  } catch (error) {
    console.error(`❌ Error fetching details: ${error.message}`);
    throw error;
  }
}

/**
 * Step 3: Format restaurant data
 */
function formatRestaurantData(placeData, placeId, url) {
  const now = new Date();
  const enrichmentDate = now.toISOString();
  
  // Extract neighborhood from address components
  let neighborhood = null;
  let city = 'New York City'; // Default, will be updated if found
  
  if (placeData.addressComponents) {
    const neighborhoodComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('neighborhood') || comp.types?.includes('sublocality_level_2')
    );
    if (neighborhoodComponent) {
      neighborhood = neighborhoodComponent.longText;
    }
    
    // Get city from locality
    const cityComponent = placeData.addressComponents.find(comp => 
      comp.types?.includes('locality')
    );
    if (cityComponent && cityComponent.longText) {
      city = cityComponent.longText;
    } else {
      // Try administrative_area_level_1
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
                        url,
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
 * Step 4: Save to additional restaurants file
 */
function saveToAdditionalRestaurants(restaurant) {
  console.log(`💾 Step 4: Saving to additional restaurants file...\n`);
  
  let restaurants = [];
  let originalContent = '';
  
  // Read existing file
  if (fs.existsSync(ADDITIONAL_RESTAURANTS_FILE)) {
    originalContent = fs.readFileSync(ADDITIONAL_RESTAURANTS_FILE, 'utf8');
    const match = originalContent.match(/export const restaurantData = (\[[\s\S]*\]);/);
    if (match) {
      restaurants = JSON.parse(match[1]);
    }
  }
  
  // Check if restaurant already exists
  const exists = restaurants.some(r => r.google_place_id === restaurant.google_place_id);
  if (exists) {
    console.log(`⚠️  Restaurant already exists in file, updating...\n`);
    restaurants = restaurants.map(r => 
      r.google_place_id === restaurant.google_place_id ? restaurant : r
    );
  } else {
    restaurants.push(restaurant);
  }
  
  // Write back to file
  const header = originalContent.match(/(\/\/.*\n)*/) ? originalContent.match(/(\/\/.*\n)*/)[0] : 
                 '// Additional restaurants fetched from Google Places API\n' +
                 '// Use this file to store restaurants added via Google API calls\n' +
                 `// Updated: ${new Date().toISOString()}\n\n`;
  
  const output = header + 'export const restaurantData = ' + 
                 JSON.stringify(restaurants, null, 2) + ';\n';
  
  fs.writeFileSync(ADDITIONAL_RESTAURANTS_FILE, output, 'utf8');
  console.log(`✓ Saved to ${ADDITIONAL_RESTAURANTS_FILE}\n`);
}

/**
 * Step 5: Remove unwanted metadata fields
 */
function removeUnwantedFields(restaurant) {
  console.log(`🧹 Step 5: Removing unwanted metadata fields...\n`);
  
  FIELDS_TO_REMOVE.forEach(field => {
    if (restaurant.google_data && restaurant.google_data[field] !== undefined) {
      delete restaurant.google_data[field];
      console.log(`   ✓ Removed: ${field}`);
    }
  });
  
  // Save back to file
  let restaurants = [];
  const content = fs.readFileSync(ADDITIONAL_RESTAURANTS_FILE, 'utf8');
  const match = content.match(/export const restaurantData = (\[[\s\S]*\]);/);
  if (match) {
    restaurants = JSON.parse(match[1]);
    restaurants = restaurants.map(r => 
      r.google_place_id === restaurant.google_place_id ? restaurant : r
    );
    
    const header = content.match(/(\/\/.*\n)*/)[0];
    const output = header + 'export const restaurantData = ' + 
                   JSON.stringify(restaurants, null, 2) + ';\n';
    fs.writeFileSync(ADDITIONAL_RESTAURANTS_FILE, output, 'utf8');
  }
  
  console.log(`✓ Metadata cleaned\n`);
}

/**
 * Step 6: Download photos
 */
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        downloadImage(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
      } else {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

function getPhotoUrl(photoName) {
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=4000&maxWidthPx=4000&key=${GOOGLE_API_KEY}`;
}

async function downloadPhotos(restaurant) {
  console.log(`📸 Step 6: Downloading photos...\n`);
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const photos = restaurant.google_data?.photos || [];
  if (!photos || photos.length === 0) {
    console.log(`⚠️  No photos available\n`);
    return;
  }
  
  const placeId = restaurant.google_place_id;
  const photosToDownload = photos.slice(0, Math.min(3, photos.length));
  const localPhotoPaths = [];
  
  // Load existing mapping
  let photoMapping = {};
  if (fs.existsSync(MAPPING_FILE)) {
    try {
      photoMapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
    } catch (e) {
      // Ignore
    }
  }
  
  console.log(`   Downloading ${photosToDownload.length} photo(s) at highest resolution...\n`);
  
  for (let j = 0; j < photosToDownload.length; j++) {
    const photo = photosToDownload[j];
    
    if (!photo?.name) {
      console.error(`   ✗ Photo ${j + 1}: No photo name found`);
      continue;
    }
    
    const filename = `${sanitizeFilename(placeId)}_${j + 1}.jpg`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 0) {
        console.log(`   ✓ Photo ${j + 1}/${photosToDownload.length}: Already exists - ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
        localPhotoPaths.push(`/restaurant-photos/${filename}`);
        continue;
      }
    }
    
    try {
      const photoUrl = getPhotoUrl(photo.name);
      process.stdout.write(`   ⬇️  Photo ${j + 1}/${photosToDownload.length}: Downloading... `);
      await downloadImage(photoUrl, filepath);
      
      const stats = fs.statSync(filepath);
      if (stats.size > 0) {
        console.log(`✓ ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
        localPhotoPaths.push(`/restaurant-photos/${filename}`);
      } else {
        console.log(`✗ File is empty`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
      
      if (j < photosToDownload.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.log(`✗ ${error.message}`);
    }
  }
  
  // Save mapping
  if (localPhotoPaths.length > 0) {
    photoMapping[placeId] = localPhotoPaths;
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(photoMapping, null, 2));
    console.log(`\n   ✓ Photo mapping updated\n`);
  }
}

/**
 * Step 7: Enrich with metadata tags (optional, requires Anthropic API key)
 */
async function enrichRestaurant(placeId) {
  if (!ANTHROPIC_API_KEY) {
    console.log(`⚠️  Step 7: Skipping enrichment (ANTHROPIC_API_KEY not set)\n`);
    console.log(`   To enable enrichment, set: export ANTHROPIC_API_KEY="your-key"`);
    console.log(`   Then run: node enrich-additional-restaurants.js\n`);
    return;
  }
  
  console.log(`🤖 Step 7: Enriching with metadata tags...\n`);
  console.log(`   Running enrichment script...\n`);
  
  try {
    execSync('node enrich-additional-restaurants.js', { 
      stdio: 'inherit',
      env: { ...process.env, ANTHROPIC_API_KEY }
    });
    console.log(`✓ Enrichment complete\n`);
  } catch (error) {
    console.error(`⚠️  Enrichment failed: ${error.message}\n`);
    console.log(`   You can run it manually later: node enrich-additional-restaurants.js\n`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🍽️  Restaurant Addition Script');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Search
    const placeId = await searchRestaurant(RESTAURANT_URL);
    
    // Step 2: Get details
    const placeData = await getPlaceDetails(placeId);
    
    // Step 3: Format
    console.log(`📝 Step 3: Formatting restaurant data...\n`);
    const restaurant = formatRestaurantData(placeData, placeId, RESTAURANT_URL);
    console.log(`✓ Formatted: ${restaurant.google_data.displayName?.text}\n`);
    
    // Step 4: Save
    saveToAdditionalRestaurants(restaurant);
    
    // Step 5: Remove unwanted fields
    removeUnwantedFields(restaurant);
    
    // Step 6: Download photos
    await downloadPhotos(restaurant);
    
    // Step 7: Enrich (optional)
    await enrichRestaurant(placeId);
    
    console.log('='.repeat(60));
    console.log('✅ SUCCESS! Restaurant added successfully');
    console.log('='.repeat(60));
    console.log(`\n📍 Restaurant: ${restaurant.google_data.displayName?.text}`);
    console.log(`   Place ID: ${restaurant.google_place_id}`);
    console.log(`   Address: ${restaurant.original_place.properties.location.address}`);
    console.log(`   City: ${restaurant.city}`);
    console.log(`   Price: ${restaurant.price_display}`);
    console.log(`   Rating: ${restaurant.google_data.rating || 'N/A'}`);
    console.log(`\n📁 Saved to: ${ADDITIONAL_RESTAURANTS_FILE}`);
    console.log(`📸 Photos: ${OUTPUT_DIR}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Review the restaurant data in ${ADDITIONAL_RESTAURANTS_FILE}`);
    if (!ANTHROPIC_API_KEY) {
      console.log(`   2. Run enrichment: export ANTHROPIC_API_KEY="your-key" && node enrich-additional-restaurants.js`);
    }
    console.log(`   3. Merge into your main data file when ready`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ FAILED:', error.message);
    console.error('='.repeat(60) + '\n');
    process.exit(1);
  }
}

// Run
main();

