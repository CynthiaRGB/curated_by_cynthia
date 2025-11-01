const fs = require('fs');
const path = require('path');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const DATA_FILE = './api/data/276_reduced.ts';
const BACKUP_FILE = `${DATA_FILE}.backup-${Date.now()}`;

// Read and parse the data file
console.log('Reading data file...');
const dataContent = fs.readFileSync(DATA_FILE, 'utf-8');

// Create backup
console.log(`Creating backup: ${BACKUP_FILE}`);
fs.writeFileSync(BACKUP_FILE, dataContent);

// Extract the restaurant data array
const match = dataContent.match(/export const restaurantData = (\[[\s\S]*\]);/);
if (!match) {
  throw new Error('Could not find restaurantData export in file');
}

let restaurants;
try {
  const jsonStr = match[1];
  restaurants = eval(`(${jsonStr})`);
} catch (e) {
  console.error('Error parsing restaurant data:', e);
  process.exit(1);
}

console.log(`Found ${restaurants.length} restaurants`);
console.log(`GOOGLE_API_KEY is ${GOOGLE_API_KEY ? 'SET' : 'NOT SET'}\n`);

// Filter restaurants that need photos
const restaurantsNeedingPhotos = restaurants.filter(r => {
  // Skip cynthias_pick (they already have photos)
  if (r.cynthias_pick === true) {
    return false;
  }
  
  // Skip if photos array already exists and has content
  if (r.google_data?.photos && Array.isArray(r.google_data.photos) && r.google_data.photos.length > 0) {
    return false;
  }
  
  return true;
});

console.log(`Found ${restaurantsNeedingPhotos.length} restaurants that need photos\n`);

// Function to fetch photos from Google Places API
async function fetchPhotosForPlace(placeId) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY not set');
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${GOOGLE_API_KEY}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Goog-FieldMask': 'photos'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Place not found
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const placeData = await response.json();
    
    if (placeData.photos && placeData.photos.length > 0) {
      return placeData.photos;
    }
    
    return null; // No photos found
  } catch (error) {
    console.error(`  ✗ API Error: ${error.message}`);
    return null;
  }
}

// Function to find restaurant index in the original array
function findRestaurantIndex(placeId) {
  return restaurants.findIndex(r => r.google_place_id === placeId);
}

// Main enrichment function
async function enrichPhotos() {
  let successCount = 0;
  let noPhotosCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  for (let i = 0; i < restaurantsNeedingPhotos.length; i++) {
    const restaurant = restaurantsNeedingPhotos[i];
    const placeId = restaurant.google_place_id;
    const restaurantName = restaurant.google_data?.displayName?.text || 'Unknown';
    
    // Double-check: skip if already has photos
    if (restaurant.google_data?.photos && Array.isArray(restaurant.google_data.photos) && restaurant.google_data.photos.length > 0) {
      console.log(`⊘ [${i + 1}/${restaurantsNeedingPhotos.length}] ${restaurantName}: Already has photos, skipping`);
      skippedCount++;
      continue;
    }
    
    // Double-check: skip if cynthias_pick
    if (restaurant.cynthias_pick === true) {
      console.log(`⊘ [${i + 1}/${restaurantsNeedingPhotos.length}] ${restaurantName}: Cynthia's pick, skipping`);
      skippedCount++;
      continue;
    }
    
    try {
      console.log(`📥 [${i + 1}/${restaurantsNeedingPhotos.length}] ${restaurantName}: Fetching photos...`);
      
      const photos = await fetchPhotosForPlace(placeId);
      
      if (photos && photos.length > 0) {
        // Find the restaurant in the original array and update it
        const index = findRestaurantIndex(placeId);
        if (index === -1) {
          console.error(`  ✗ Could not find restaurant in array!`);
          errorCount++;
          continue;
        }
        
        // Ensure google_data object exists
        if (!restaurants[index].google_data) {
          restaurants[index].google_data = {};
        }
        
        // Add photos array
        restaurants[index].google_data.photos = photos;
        
        console.log(`  ✓ Added ${photos.length} photo(s)`);
        successCount++;
      } else {
        console.log(`  ⊘ No photos found`);
        noPhotosCount++;
      }
      
      // Rate limiting: wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }
  
  // Save the updated data
  console.log('\n💾 Saving updated data...');
  
  // Create new TypeScript file content
  const newContent = `// Auto-generated from 285_restaurants_enriched.json
// Do not edit manually - regenerate by running: node convert-data.js
// Photos enriched on ${new Date().toISOString()}

export const restaurantData = ${JSON.stringify(restaurants, null, 2)};
`;
  
  fs.writeFileSync(DATA_FILE, newContent);
  
  console.log(`✅ Data saved to: ${DATA_FILE}`);
  console.log(`📊 Summary:`);
  console.log(`   Photos added: ${successCount}`);
  console.log(`   No photos found: ${noPhotosCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Total processed: ${restaurantsNeedingPhotos.length}`);
}

// Run the enrichment
if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: GOOGLE_PLACES_API_KEY environment variable is not set!');
  console.error('   Set it by running: export GOOGLE_PLACES_API_KEY="your-api-key"');
  process.exit(1);
}

enrichPhotos().catch(console.error);

