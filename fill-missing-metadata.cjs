#!/usr/bin/env node

/**
 * Fill Missing Metadata Script
 * 
 * This script fetches missing original_place and google_place_id metadata
 * for restaurants that only have google_data.
 * 
 * Requires:
 * - GOOGLE_PLACES_API_KEY environment variable
 * 
 * Usage: node fill-missing-metadata.cjs
 */

const fs = require('fs');
const path = require('path');

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
const RESTAURANT_DATA_FILE = './api/data/latest_277.ts';

// Place IDs to fix
const PLACE_IDS = [
  'ChIJLXL2BvijfDURmTrYFPQIGUc', // Cafe Onion Anguk
  'ChIJB6TgGcSifDURzk0WJaCjK6I'  // Keunkiwajip
];

if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: Google Places API key not found');
  console.error('   Set GOOGLE_PLACES_API_KEY or VITE_GOOGLE_PLACES_API_KEY environment variable');
  process.exit(1);
}

/**
 * Get full place details from Google Places API
 */
async function getPlaceDetails(placeId) {
  console.log(`\n📥 Fetching place details for ${placeId}...`);
  
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    const fieldMask = [
      'id',
      'displayName',
      'formattedAddress',
      'addressComponents',
      'location',
      'googleMapsUri',
      'googleMapsLinks',
      'postalAddress'
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
    console.log(`   Name: ${placeData.displayName?.text || 'N/A'}`);
    console.log(`   Address: ${placeData.formattedAddress || 'N/A'}`);
    
    return placeData;
  } catch (error) {
    console.error(`❌ Error fetching details: ${error.message}`);
    throw error;
  }
}

/**
 * Build original_place structure from place data
 */
function buildOriginalPlace(placeData, placeId) {
  const coordinates = placeData.location 
    ? [placeData.location.longitude, placeData.location.latitude]
    : [0, 0];
  
  const formattedAddress = placeData.formattedAddress || 'Address not available';
  
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
  
  // Get Google Maps URL
  const mapsUrl = placeData.googleMapsUri || 
                  placeData.googleMapsLinks?.placeUri || 
                  `https://maps.google.com/?cid=${placeId}`;
  
  return {
    geometry: {
      coordinates: coordinates,
      type: 'Point'
    },
    properties: {
      date: new Date().toISOString(),
      google_maps_url: mapsUrl,
      location: {
        address: formattedAddress,
        country_code: countryCode,
        name: placeData.displayName?.text || 'Unknown'
      }
    },
    type: 'Feature'
  };
}

/**
 * Find restaurant in data file and update it
 */
async function updateRestaurantData(placeId, originalPlace) {
  console.log(`\n📝 Reading restaurant data file...`);
  
  let content = fs.readFileSync(RESTAURANT_DATA_FILE, 'utf8');
  
  // Find the restaurant by looking for the place ID in google_data.id
  // Pattern: "id": "ChIJLXL2BvijfDURmTrYFPQIGUc"
  const idPattern = `"id":\\s*"${placeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`;
  const idRegex = new RegExp(idPattern);
  
  if (!idRegex.test(content)) {
    console.error(`❌ Restaurant with place ID ${placeId} not found in data file`);
    return false;
  }
  
  console.log(`✓ Found restaurant with place ID ${placeId}`);
  
  // Find the position where "id" field appears in google_data
  const idMatch = content.match(idRegex);
  if (!idMatch) {
    console.error(`❌ Could not locate restaurant ID in file`);
    return false;
  }
  
  const idIndex = idMatch.index;
  
  // Find the start of this restaurant object (look backwards for opening brace with proper indentation)
  let startIndex = idIndex;
  
  // Look backwards to find the opening brace of the restaurant object
  // We're looking for "  {" (two spaces + opening brace) on a new line
  for (let i = idIndex - 1; i >= 0; i--) {
    // Check if we found a pattern like "  {" at the start of a line
    if (content.substring(i, i + 3) === '  {' && (i === 0 || content[i - 1] === '\n')) {
      startIndex = i;
      break;
    }
  }
  
  // Check if it already has original_place and google_place_id
  // Look for "google_place_id" or "original_place" between startIndex and idIndex
  const restaurantStart = content.substring(startIndex, idIndex + 100);
  const hasOriginalPlace = restaurantStart.includes('"original_place"');
  const hasGooglePlaceId = restaurantStart.includes('"google_place_id"');
  
  if (hasOriginalPlace && hasGooglePlaceId) {
    console.log(`✓ Restaurant already has original_place and google_place_id`);
    return true;
  }
  
  // Format the original_place object with proper indentation (4 spaces for fields)
  const originalPlaceJson = JSON.stringify(originalPlace, null, 2);
  const originalPlaceLines = originalPlaceJson.split('\n');
  const indentedOriginalPlace = originalPlaceLines.map((line, i) => {
    // First line is just "{", subsequent lines need 4 more spaces
    if (i === 0) return '    "original_place": ' + line;
    return '    ' + line;
  }).join('\n');
  
  // Build the insertion string with proper formatting
  let insertStr = indentedOriginalPlace + ',\n';
  insertStr += `    "google_place_id": "${placeId}",\n`;
  
  // Insert after the opening brace (after "  {")
  const insertPosition = startIndex + 3; // After "  {"
  const beforeInsert = content.substring(0, insertPosition);
  const afterInsert = content.substring(insertPosition);
  
  // Check if there's already a newline after the opening brace
  const needsNewline = !afterInsert.startsWith('\n');
  
  content = beforeInsert + (needsNewline ? '\n' : '') + insertStr + afterInsert;
  
  // Write back to file
  fs.writeFileSync(RESTAURANT_DATA_FILE, content, 'utf8');
  console.log(`✓ Added original_place and google_place_id to restaurant`);
  
  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('FILL MISSING METADATA');
  console.log('='.repeat(80));
  console.log(`\nProcessing ${PLACE_IDS.length} restaurant(s)...`);
  
  for (const placeId of PLACE_IDS) {
    try {
      // Fetch place details
      const placeData = await getPlaceDetails(placeId);
      
      // Build original_place structure
      const originalPlace = buildOriginalPlace(placeData, placeId);
      
      // Update restaurant data
      await updateRestaurantData(placeId, originalPlace);
      
      console.log(`\n✓ Successfully processed ${placeId}`);
    } catch (error) {
      console.error(`\n❌ Failed to process ${placeId}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('DONE');
  console.log('='.repeat(80));
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

