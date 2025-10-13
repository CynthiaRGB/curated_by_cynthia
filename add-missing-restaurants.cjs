// add-missing-restaurants.cjs
// Script to add missing restaurants from Google Places API data

const fs = require('fs');
const path = require('path');

// Missing restaurants with their expected Google Places data structure
const MISSING_RESTAURANTS = [
  // You'll paste the Google Places API response data here
  // Each entry should follow this structure:
  /*
  {
    original_place: {
      geometry: { /* coordinates */ },
      properties: {
        location: { /* location data */ },
        google_maps_url: "https://maps.google.com/..."
      }
    },
    google_place_id: "ChIJ...", // From Google Places API
    google_data: {
      name: "Restaurant Name",
      id: "ChIJ...",
      types: ["restaurant", "food"],
      nationalPhoneNumber: "+1...",
      internationalPhoneNumber: "+1...",
      formattedAddress: "Full Address",
      addressComponents: [/* address parts */],
      rating: 4.5,
      userRatingCount: 150,
      displayName: { text: "Restaurant Name" },
      priceLevel: 2
    },
    cynthias_pick: true // Mark as Cynthia's pick
  }
  */
];

// Read the current restaurant data
const restaurantsPath = path.join(__dirname, 'src', 'data', 'google_enriched_restaurants_311_clean.json');
console.log('Reading current restaurant data from:', restaurantsPath);

let restaurantData;
try {
  const fileContent = fs.readFileSync(restaurantsPath, 'utf8');
  restaurantData = JSON.parse(fileContent);
  console.log(`✓ Loaded ${restaurantData.places.length} restaurants\n`);
} catch (error) {
  console.error('Error reading restaurant data:', error.message);
  process.exit(1);
}

// Add missing restaurants
if (MISSING_RESTAURANTS.length === 0) {
  console.log('⚠️  No missing restaurants to add. Please paste the Google Places API data into the MISSING_RESTAURANTS array.');
  console.log('\nInstructions:');
  console.log('1. Use Google Places API tester to get data for each missing restaurant');
  console.log('2. Copy the response data and paste it into the MISSING_RESTAURANTS array above');
  console.log('3. Run this script again');
  process.exit(0);
}

// Add the missing restaurants
const newRestaurants = [...restaurantData.places, ...MISSING_RESTAURANTS];
restaurantData.places = newRestaurants;

// Update metadata
restaurantData.metadata.places_processed = newRestaurants.length;
restaurantData.metadata.places_enriched = newRestaurants.length;
restaurantData.metadata.last_updated = new Date().toISOString();
restaurantData.metadata.cynthias_picks_added = MISSING_RESTAURANTS.length;

// Create backup
const backupPath = restaurantsPath.replace('.json', `.backup-${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(restaurantData, null, 2));
console.log(`✓ Backup created: ${backupPath}`);

// Write updated data
fs.writeFileSync(restaurantsPath, JSON.stringify(restaurantData, null, 2));
console.log(`✓ Updated data written to: ${restaurantsPath}`);

console.log('\n' + '='.repeat(60));
console.log(`✨ Added ${MISSING_RESTAURANTS.length} missing restaurants!`);
console.log(`   Total restaurants: ${newRestaurants.length}`);
console.log(`   Cynthia's picks: ${newRestaurants.filter(r => r.cynthias_pick).length}`);
console.log('='.repeat(60));

