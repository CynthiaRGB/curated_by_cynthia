// enrich-cynthias-picks-photos.js
// Add photos to Cynthia's 32 favorite restaurants

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Your Google Places API Key
const GOOGLE_API_KEY = 'AIzaSyAdkZl43KGOOCodXfDyqehjNtxcQRyxwdw'; // Replace with your actual key

// Read Cynthia's restaurants from TypeScript file
const restaurantsPath = path.join(__dirname, 'api', 'data', '32_cynthia_restaurants.ts');
console.log('Reading Cynthia\'s restaurants from:', restaurantsPath);

let cynthiasPicks;
try {
  const fileContent = fs.readFileSync(restaurantsPath, 'utf8');
  
  // Extract the JSON data from the TypeScript file
  // Handle: export const cynthiasPicksData = { "places": [...] }
  let jsonContent = fileContent;
  
  // Remove TypeScript export syntax
  jsonContent = jsonContent.replace(/export\s+const\s+\w+\s*=\s*/g, '');
  jsonContent = jsonContent.replace(/export\s+default\s+/g, '');
  
  // Remove type annotations and trailing semicolons
  jsonContent = jsonContent.replace(/:\s*Restaurant\[\]/g, '');
  jsonContent = jsonContent.replace(/;\s*$/g, '');
  
  // Parse the JSON
  const parsedData = eval('(' + jsonContent + ')');
  
  // Extract the places array from the data structure
  cynthiasPicks = parsedData.places || parsedData;
  
  console.log(`✓ Loaded ${cynthiasPicks.length} of Cynthia's picks\n`);
} catch (error) {
  console.error('Error reading restaurants file:', error.message);
  console.log('\nTip: Make sure 32_cynthia_restaurants.ts contains a JSON array');
  process.exit(1);
}

if (!cynthiasPicks || cynthiasPicks.length === 0) {
  console.error('❌ No restaurants found in the file!');
  process.exit(1);
}

/**
 * Fetch photos for a single restaurant from Google Places API
 */
async function fetchPhotosForRestaurant(restaurant) {
  const placeId = restaurant.google_place_id;
  const name = restaurant.google_data?.displayName?.text || 'Unknown';
  
  console.log(`Fetching photos for: ${name}`);
  
  try {
    // Google Places API (New) - Get Place Details with Photos
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Goog-FieldMask': 'photos',
        'X-Goog-Api-Key': GOOGLE_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const placeData = await response.json();
    
    if (placeData.photos && placeData.photos.length > 0) {
      console.log(`  ✓ Found ${placeData.photos.length} photos`);
      return placeData.photos;
    } else {
      console.log(`  ⚠ No photos available`);
      return [];
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return null; // null indicates error, empty array means no photos
  }
}

/**
 * Main enrichment process
 */
async function enrichCynthiasPicksWithPhotos() {
  console.log('='.repeat(60));
  console.log('ENRICHING CYNTHIA\'S PICKS WITH PHOTOS');
  console.log('='.repeat(60) + '\n');
  
  let successCount = 0;
  let noPhotosCount = 0;
  let errorCount = 0;
  
  // Process each of Cynthia's picks
  for (let i = 0; i < cynthiasPicks.length; i++) {
    const pick = cynthiasPicks[i];
    console.log(`\n[${i + 1}/${cynthiasPicks.length}]`);
    
    const photos = await fetchPhotosForRestaurant(pick);
    
    if (photos === null) {
      errorCount++;
    } else if (photos.length === 0) {
      noPhotosCount++;
    } else {
      successCount++;
      // Add photos to the restaurant's google_data
      pick.google_data.photos = photos;
    }
    
    // Add a delay to avoid rate limiting (200ms = 5 requests/second)
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('ENRICHMENT COMPLETE');
  console.log('='.repeat(60));
  console.log(`✓ Successfully enriched: ${successCount}`);
  console.log(`⚠ No photos found: ${noPhotosCount}`);
  console.log(`✗ Errors: ${errorCount}`);
  console.log(`Total processed: ${cynthiasPicks.length}`);
  
  // Create backup before saving
  const backupPath = restaurantsPath.replace('.ts', '.backup.ts');
  fs.writeFileSync(backupPath, fs.readFileSync(restaurantsPath, 'utf8'));
  console.log(`\n✓ Backup created: ${backupPath}`);
  
  // Save as JSON (easier to work with for now)
  const jsonOutputPath = path.join(__dirname, 'api', 'data', '32_cynthia_restaurants_with_photos.json');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(cynthiasPicks, null, 2));
  console.log(`✓ Updated data saved to: ${jsonOutputPath}`);
  
  // Generate a summary report
  const report = {
    date: new Date().toISOString(),
    total_picks: cynthiasPicks.length,
    enriched: successCount,
    no_photos: noPhotosCount,
    errors: errorCount,
    picks_with_photos: cynthiasPicks
      .filter(p => p.google_data.photos && p.google_data.photos.length > 0)
      .map(p => ({
        name: p.google_data.displayName.text,
        photo_count: p.google_data.photos.length,
        first_photo_url: `https://places.googleapis.com/v1/${p.google_data.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_API_KEY}`
      }))
  };
  
  const reportPath = path.join(__dirname, 'cynthias-picks-photo-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Report saved to: ${reportPath}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('COST ESTIMATE');
  console.log('='.repeat(60));
  console.log(`API calls made: ${cynthiasPicks.length}`);
  console.log(`Estimated cost: $${(cynthiasPicks.length * 0.005).toFixed(2)}`);
  console.log('(Based on $0.005 per Basic Data request)');
  
  console.log('\n' + '='.repeat(60));
  console.log('NEXT STEPS');
  console.log('='.repeat(60));
  console.log('1. Check cynthias-picks-photo-report.json for photo URLs');
  console.log('2. Test a few photo URLs in your browser');
  console.log('3. The enriched data is saved as JSON in:');
  console.log('   src/data/32_cynthia_restaurants_with_photos.json');
  console.log('4. Update your photo utility (photoUtils.ts) to use these photos');
  console.log('5. Deploy and enjoy beautiful photos for Cynthia\'s picks!');
  console.log('='.repeat(60));
}

// Run the enrichment
enrichCynthiasPicksWithPhotos().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});