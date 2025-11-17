#!/usr/bin/env node

/**
 * Complete Restaurant Addition Script (Consolidated)
 * 
 * This script automates the entire process of adding a new restaurant:
 * 1. Search (if URL provided) or use Place ID directly
 * 2. Fetch full place details from Google Places API
 * 3. Save fetched data in a new file (critical: never write directly into latest data file!)
 * 4. Format the fetched data to be consistent with the rest of data in latest data file
 * 5. Remove unwanted metadata fields
 * 6. Download first 3 photos at highest resolution
 * 7. Update vercel photo mapping
 * 8. Enrich empty metadata tags using Claude API (includes GENERATIVE SUMMARY in prompt)
 * 
 * Requires:
 * - GOOGLE_PLACES_API_KEY environment variable
 * - ANTHROPIC_API_KEY environment variable
 * 
 * Usage:
 *   node add-restaurant-consolidated.cjs "https://www.google.com/maps/place/..."
 *   OR
 *   node add-restaurant-consolidated.cjs --place-id "ChIJ..." [--name "Restaurant Name"]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_PLACES_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Parse command line arguments
const args = process.argv.slice(2);
let RESTAURANT_URL = null;
let PLACE_ID = null;
let RESTAURANT_NAME = null;

if (args[0] === '--place-id' && args[1]) {
  PLACE_ID = args[1];
  RESTAURANT_NAME = args[3] === '--name' ? args[4] : null;
} else if (args[0] && !args[0].startsWith('--')) {
  RESTAURANT_URL = args[0];
}

// File paths
const RESTAURANT_DATA_FILE = './api/data/latest_277.ts';
const OUTPUT_DIR = './public/restaurant-photos';
const MAPPING_FILE = path.join(OUTPUT_DIR, 'photo-mapping.json');
const TEMP_OUTPUT_DIR = './api/data/temp';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

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

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ERROR: ANTHROPIC_API_KEY environment variable not set');
  console.error('   Set it with: export ANTHROPIC_API_KEY="your-key"');
  process.exit(1);
}

if (!RESTAURANT_URL && !PLACE_ID) {
  console.error('❌ ERROR: Please provide either a Google Maps URL or Place ID');
  console.error('   Usage (URL): node add-restaurant-consolidated.cjs "https://www.google.com/maps/place/..."');
  console.error('   Usage (Place ID): node add-restaurant-consolidated.cjs --place-id "ChIJ..." [--name "Restaurant Name"]');
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
 * Step 1: Search for restaurant using Google Places API (only if URL provided)
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
 * Step 2: Get full place details by Place ID
 */
async function getPlaceDetails(placeId) {
  const stepNum = PLACE_ID ? '1' : '2';
  console.log(`📥 Step ${stepNum}: Fetching full place details...\n`);
  if (PLACE_ID) {
    console.log(`   Place ID: ${placeId}\n`);
  }
  
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
      'photos',
      'reviews'
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
    console.log(`✓ Successfully fetched place details`);
    if (PLACE_ID) {
      console.log(`   Name: ${placeData.displayName?.text || 'N/A'}`);
      console.log(`   Address: ${placeData.formattedAddress || 'N/A'}`);
    }
    console.log(`\n`);
    
    return placeData;
  } catch (error) {
    console.error(`❌ Error fetching details: ${error.message}`);
    throw error;
  }
}

/**
 * Step 3: Save fetched data to a new file (CRITICAL: never write directly to latest_277.ts!)
 */
function saveFetchedDataToNewFile(placeData, placeId) {
  console.log(`💾 Step 3: Saving fetched data to new file...\n`);
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(TEMP_OUTPUT_DIR)) {
    fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true });
  }
  
  // Generate filename with timestamp and place ID
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedPlaceId = placeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `restaurant_${sanitizedPlaceId}_${timestamp}.json`;
  const filepath = path.join(TEMP_OUTPUT_DIR, filename);
  
  // Save raw fetched data
  fs.writeFileSync(filepath, JSON.stringify(placeData, null, 2), 'utf8');
  
  console.log(`✓ Saved fetched data to: ${filepath}\n`);
  
  return filepath;
}

/**
 * Step 4: Format restaurant data to match project structure
 */
function formatRestaurantData(placeData, placeId, url) {
  const now = new Date();
  const enrichmentDate = now.toISOString();
  
  // Extract neighborhood from address components
  let neighborhood = null;
  let city = null; // Will be auto-detected
  
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
  let countryCode = 'US'; // Default
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
                        url || `https://maps.google.com/?cid=${placeId}`,
        location: {
          address: formattedAddress,
          country_code: countryCode,
          name: placeData.displayName?.text || RESTAURANT_NAME || 'Unknown'
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
 * Step 5: Remove unwanted metadata fields
 */
function removeUnwantedFields(restaurant) {
  FIELDS_TO_REMOVE.forEach(field => {
    if (restaurant.google_data && restaurant.google_data[field] !== undefined) {
      delete restaurant.google_data[field];
    }
  });
}

/**
 * Helper: Smart review sampling - use best 6 reviews for high-volume restaurants
 */
function sampleReviews(reviews, maxCount = 6) {
  if (!reviews || reviews.length === 0) return [];
  if (reviews.length <= maxCount) return reviews;
  
  // Sort by rating (prefer 4-5 star reviews for sentiment)
  const sorted = [...reviews].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return sorted.slice(0, maxCount);
}

/**
 * Helper: Extract relevant text from restaurant data for analysis
 */
function extractTextForAnalysis(restaurant) {
  const reviews = sampleReviews(restaurant.google_data?.reviews || [], 6);
  
  const reviewTexts = reviews.map((review, idx) => 
    `Review ${idx + 1} (${review.rating}★): ${review.text?.text || ''}`
  ).join('\n\n');

  const editorialSummary = restaurant.google_data?.editorialSummary?.text || '';
  const generativeSummary = restaurant.google_data?.generativeSummary?.overview?.text || '';
  const reviewSummary = restaurant.google_data?.reviewSummary?.text?.text || '';

  return {
    name: restaurant.google_data?.displayName?.text || 'Unknown',
    primaryType: restaurant.google_data?.primaryType || '',
    types: restaurant.google_data?.types || [],
    rating: restaurant.google_data?.rating || 0,
    reviewCount: restaurant.google_data?.userRatingCount || 0,
    priceDisplay: restaurant.price_display || '',
    reviewTexts,
    editorialSummary,
    generativeSummary,
    reviewSummary
  };
}

/**
 * Helper: Create the enrichment prompt for Claude
 */
function createEnrichmentPrompt(restaurantData) {
  return `You are analyzing restaurant review data to extract sentiment and thematic tags. Your goal is to identify the vibe, atmosphere, occasions, and notable features of this restaurant based on reviews and descriptions.

Restaurant: ${restaurantData.name}
Type: ${restaurantData.primaryType}
Rating: ${restaurantData.rating}★ (${restaurantData.reviewCount} reviews)
Price: ${restaurantData.priceDisplay}

EDITORIAL SUMMARY:
${restaurantData.editorialSummary || 'N/A'}

REVIEW SUMMARY:
${restaurantData.reviewSummary || 'N/A'}

GENERATIVE SUMMARY:
${restaurantData.generativeSummary || 'N/A'}

REVIEWS:
${restaurantData.reviewTexts || 'No reviews available'}

---

Extract tags for the following categories. Return ONLY a valid JSON object with no markdown formatting, explanations, or extra text.

TAG CATEGORIES:

1. vibe_tags (5-8 tags): romantic, cozy, trendy, casual, upscale, lively, quiet, intimate, rustic, modern, traditional, quirky, sophisticated, hip

2. occasion_tags (3-5 tags): date_night, first_date, second_date, anniversary, business_lunch, business_dinner, family_friendly, group_dining, solo_dining, celebration, casual_meetup, late_night, weekend_brunch

3. crowd_tags (2-4 tags): young_crowd, mature_crowd, tourist_friendly, locals_spot, see_and_be_seen, low_key, diverse_crowd, industry_hangout

4. service_tags (2-3 tags): attentive_service, quick_service, knowledgeable_staff, inconsistent_service, slow_service

5. noise_level (1 tag ONLY): loud, moderate_noise, quiet_ambiance

6. food_quality_tags (2-3 tags): exceptional_food, creative_menu, comfort_food, healthy_options, craft_cocktails, wine_focused, beer_selection, instagram_worthy_food

7. value_tag (1 tag ONLY): good_value, overpriced, splurge_worthy, affordable

8. special_features (1-4 tags): outdoor_seating, hidden_gem, speakeasy_vibe, historic_venue, scenic_views, unique_concept, chef_driven, instagrammable

9. booking_tags (1-2 tags): reservations_required, walk_in_friendly, long_wait_times, hard_to_get_into

10. negative_tags (0-2 tags): overrated, tourist_trap, cramped_space, service_issues

11. accolades_tags (0-3 tags): michelin_starred, michelin_1_star, michelin_2_star, michelin_3_star, michelin_bib_gourmand, james_beard_winner, james_beard_nominated, worlds_50_best, zagat_rated, eater_featured, ny_times_reviewed

IMPORTANT INSTRUCTIONS:
- Only include tags that are clearly supported by the review text or descriptions
- For instagrammable: look for mentions of "photogenic", "aesthetic", "beautiful space", "great for photos", "Instagram", "pretty"
- For accolades: scan for any mentions of Michelin, James Beard, Zagat, World's 50 Best, Eater features, or NYT reviews
- Be conservative - don't guess or assume tags
- Return valid JSON only, no markdown code blocks or extra formatting
- Use this exact structure:

{
  "vibe_tags": ["tag1", "tag2"],
  "occasion_tags": ["tag1", "tag2"],
  "crowd_tags": ["tag1", "tag2"],
  "service_tags": ["tag1", "tag2"],
  "noise_level": "tag",
  "food_quality_tags": ["tag1", "tag2"],
  "value_tag": "tag",
  "special_features": ["tag1", "tag2"],
  "booking_tags": ["tag1"],
  "negative_tags": [],
  "accolades_tags": []
}`;
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
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const photos = restaurant.google_data?.photos || [];
  if (!photos || photos.length === 0) {
    console.log(`⚠️  No photos available\n`);
    return [];
  }
  
  const placeId = restaurant.google_place_id;
  const photosToDownload = photos.slice(0, Math.min(3, photos.length));
  const localPhotoPaths = [];
  
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
  
  return localPhotoPaths;
}

/**
 * Step 7: Update photo mapping
 */
function updatePhotoMapping(placeId, localPhotoPaths) {
  // Load existing mapping
  let photoMapping = {};
  if (fs.existsSync(MAPPING_FILE)) {
    try {
      photoMapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
    } catch (e) {
      // Ignore
    }
  }
  
  // Update mapping
  if (localPhotoPaths.length > 0) {
    photoMapping[placeId] = localPhotoPaths;
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(photoMapping, null, 2));
    console.log(`\n   ✓ Photo mapping updated\n`);
  }
}

/**
 * Step 8: Enrich with metadata tags using Claude API
 */
async function enrichRestaurantWithTags(restaurant, retries = 3) {
  const restaurantData = extractTextForAnalysis(restaurant);
  const prompt = createEnrichmentPrompt(restaurantData);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      // Parse response
      let responseText = message.content[0].text;
      
      // Strip markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const tags = JSON.parse(responseText);

      // Update restaurant with tags
      Object.assign(restaurant, tags);
      
      const tagCount = Object.values(tags).flat().length + (tags.noise_level ? 1 : 0) + (tags.value_tag ? 1 : 0);
      console.log(`   ✓ Added ${tagCount} tags`);
      console.log(`   Input tokens: ${message.usage.input_tokens}, Output tokens: ${message.usage.output_tokens}\n`);
      
      return;
    } catch (error) {
      const isRetryable = error.message.includes('529') || 
                         error.message.includes('overloaded') ||
                         error.message.includes('rate_limit') ||
                         error.status === 529 ||
                         error.status === 429;
      
      if (isRetryable && attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`   ⚠️  API error (attempt ${attempt}/${retries}), retrying in ${backoffMs/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      // Final attempt failed or non-retryable error
      console.error(`   ❌ Enrichment failed: ${error.message}\n`);
      throw new Error(`Failed to enrich restaurant: ${error.message}`);
    }
  }
}

/**
 * Save final processed restaurant to a new file
 */
function saveFinalRestaurantToFile(restaurant, tempFilePath) {
  const finalFilename = tempFilePath.replace('.json', '_processed.json');
  fs.writeFileSync(finalFilename, JSON.stringify(restaurant, null, 2), 'utf8');
  console.log(`💾 Final processed restaurant saved to: ${finalFilename}\n`);
  return finalFilename;
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🍽️  Restaurant Addition Script (Consolidated)');
  console.log('='.repeat(60));
  console.log('⚠️  This script saves to NEW files - never modifies latest_277.ts directly!\n');
  
  try {
    let placeId;
    
    // Step 1: Get Place ID (either from search or direct input)
    if (PLACE_ID) {
      placeId = PLACE_ID;
    } else {
      placeId = await searchRestaurant(RESTAURANT_URL);
    }
    
    // Step 2: Get details
    const placeData = await getPlaceDetails(placeId);
    
    // Step 3: Save fetched data to new file
    const tempFilePath = saveFetchedDataToNewFile(placeData, placeId);
    
    // Step 4: Format
    console.log(`📝 Step 4: Formatting restaurant data...\n`);
    const restaurant = formatRestaurantData(placeData, placeId, RESTAURANT_URL);
    console.log(`✓ Formatted: ${restaurant.google_data.displayName?.text}\n`);
    
    // Step 5: Remove unwanted fields
    console.log(`🧹 Step 5: Removing unwanted metadata fields...\n`);
    removeUnwantedFields(restaurant);
    console.log(`✓ Metadata cleaned\n`);
    
    // Step 6: Download photos
    console.log(`📸 Step 6: Downloading photos...\n`);
    const localPhotoPaths = await downloadPhotos(restaurant);
    
    // Step 7: Update photo mapping
    console.log(`🗺️  Step 7: Updating photo mapping...\n`);
    updatePhotoMapping(placeId, localPhotoPaths);
    
    // Step 8: Enrich with tags
    console.log(`🤖 Step 8: Enriching with metadata tags...\n`);
    await enrichRestaurantWithTags(restaurant);
    
    // Save final processed restaurant
    const finalFilePath = saveFinalRestaurantToFile(restaurant, tempFilePath);
    
    console.log('='.repeat(60));
    console.log('✅ SUCCESS! Restaurant processed successfully');
    console.log('='.repeat(60));
    console.log(`\n📍 Restaurant: ${restaurant.google_data.displayName?.text}`);
    console.log(`   Place ID: ${restaurant.google_place_id}`);
    console.log(`   Address: ${restaurant.original_place.properties.location.address}`);
    console.log(`   City: ${restaurant.city || 'Auto-detected'}`);
    console.log(`   Price: ${restaurant.price_display}`);
    console.log(`   Rating: ${restaurant.google_data.rating || 'N/A'}`);
    console.log(`\n📁 Files created:`);
    console.log(`   Raw data: ${tempFilePath}`);
    console.log(`   Processed: ${finalFilePath}`);
    console.log(`📸 Photos: ${OUTPUT_DIR}`);
    console.log(`\n💡 Review the processed file and manually add to latest_277.ts when ready!`);
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
