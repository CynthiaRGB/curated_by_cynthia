// test-photo-extraction.js
// Extract photos for 5 restaurants to test

const fs = require('fs');
const path = require('path');

// Your Google Places API Key
const GOOGLE_API_KEY = 'YOUR_API_KEY_HERE'; // Replace with your actual key

// Read your restaurants data
const restaurantsPath = path.join(__dirname, 'src', 'data', 'google_enriched_restaurants_311_clean.json');
const data = JSON.parse(fs.readFileSync(restaurantsPath, 'utf8'));
const restaurants = data.places || data;

// Select 5 restaurants to test (let's pick some from different cities)
const testRestaurants = restaurants.slice(0, 5);

console.log(`Testing photo extraction for ${testRestaurants.length} restaurants:\n`);

async function fetchPhotosForRestaurant(restaurant) {
  const placeId = restaurant.google_place_id;
  const name = restaurant.google_data?.displayName?.text || 'Unknown';
  
  console.log(`Fetching photos for: ${name}`);
  console.log(`Place ID: ${placeId}`);
  
  try {
    // Google Places API (New) - Get Place Details with Photos
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${GOOGLE_API_KEY}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Goog-FieldMask': 'photos'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const placeData = await response.json();
    
    if (placeData.photos && placeData.photos.length > 0) {
      console.log(`✓ Found ${placeData.photos.length} photos`);
      console.log(`  First photo: ${placeData.photos[0].name}`);
      console.log(`  Dimensions: ${placeData.photos[0].widthPx}x${placeData.photos[0].heightPx}`);
      
      // Generate the photo URL
      const photoUrl = `https://places.googleapis.com/v1/${placeData.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_API_KEY}`;
      console.log(`  URL: ${photoUrl}\n`);
      
      return {
        name,
        placeId,
        photos: placeData.photos,
        testPhotoUrl: photoUrl
      };
    } else {
      console.log(`✗ No photos found\n`);
      return { name, placeId, photos: [] };
    }
  } catch (error) {
    console.error(`✗ Error fetching photos: ${error.message}\n`);
    return { name, placeId, error: error.message };
  }
}

async function testPhotoExtraction() {
  console.log('='.repeat(60));
  console.log('TESTING PHOTO EXTRACTION');
  console.log('='.repeat(60) + '\n');
  
  const results = [];
  
  for (const restaurant of testRestaurants) {
    const result = await fetchPhotosForRestaurant(restaurant);
    results.push(result);
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tested: ${results.length}`);
  console.log(`With photos: ${results.filter(r => r.photos?.length > 0).length}`);
  console.log(`Without photos: ${results.filter(r => !r.photos || r.photos.length === 0).length}`);
  console.log(`Errors: ${results.filter(r => r.error).length}`);
  
  // Save results to a file
  const outputPath = path.join(__dirname, 'photo-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${outputPath}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('NEXT STEPS:');
  console.log('='.repeat(60));
  console.log('1. Check photo-test-results.json for the results');
  console.log('2. Open one of the testPhotoUrl links in your browser to see the photo');
  console.log('3. If photos work, run the full enrichment for all 311 restaurants');
  console.log('4. Cost for 5 restaurants: ~$0.025 (negligible)');
  console.log('5. Cost for all 311 restaurants: ~$1.55');
  console.log('='.repeat(60));
}

// Run the test
testPhotoExtraction().catch(console.error);