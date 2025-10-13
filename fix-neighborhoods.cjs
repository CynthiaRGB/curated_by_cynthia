// fix-neighborhoods.js
// Add proper neighborhood names based on ZIP codes and coordinates

const fs = require('fs');
const path = require('path');

// NYC ZIP code to neighborhood mapping
const NYC_ZIP_TO_NEIGHBORHOOD = {
  // Manhattan - Downtown
  '10002': 'Lower East Side',
  '10003': 'East Village',
  '10009': 'East Village',
  '10012': 'SoHo',
  '10013': 'Tribeca',
  '10014': 'West Village',
  '10011': 'Greenwich Village',
  '10010': 'Gramercy',
  '10016': 'Murray Hill',
  '10017': 'Midtown East',
  
  // Manhattan - Midtown
  '10018': 'Midtown',
  '10019': 'Midtown West',
  '10020': 'Midtown',
  '10021': 'Upper East Side',
  '10022': 'Midtown East',
  '10023': 'Upper West Side',
  '10024': 'Upper West Side',
  '10025': 'Upper West Side',
  
  // Manhattan - Uptown
  '10026': 'Harlem',
  '10027': 'Harlem',
  '10028': 'Upper East Side',
  '10029': 'East Harlem',
  '10030': 'Harlem',
  '10031': 'Hamilton Heights',
  '10032': 'Washington Heights',
  '10033': 'Washington Heights',
  '10034': 'Inwood',
  '10035': 'East Harlem',
  
  // Brooklyn
  '11201': 'Brooklyn Heights',
  '11205': 'Fort Greene',
  '11206': 'Williamsburg',
  '11211': 'Williamsburg',
  '11215': 'Park Slope',
  '11217': 'Park Slope',
  '11222': 'Greenpoint',
  '11225': 'Crown Heights',
  '11226': 'Flatbush',
  '11238': 'Prospect Heights',
  '11249': 'Williamsburg',
  
  // Queens
  '11101': 'Long Island City',
  '11102': 'Astoria',
  '11103': 'Astoria',
  '11104': 'Sunnyside',
  '11106': 'Astoria',
  '11354': 'Flushing',
  '11355': 'Flushing',
  '11368': 'Corona',
  '11372': 'Jackson Heights',
  '11373': 'Elmhurst',
  '11374': 'Rego Park',
  '11375': 'Forest Hills',
};

// Read the restaurants JSON file
const restaurantsPath = path.join(__dirname, 'src', 'data', 'google_enriched_restaurants_311_clean.json');
console.log('Reading restaurants data from:', restaurantsPath);

let restaurantData;
try {
  const fileContent = fs.readFileSync(restaurantsPath, 'utf8');
  restaurantData = JSON.parse(fileContent);
  console.log(`✓ Loaded ${restaurantData.places.length} restaurants\n`);
} catch (error) {
  console.error('Error reading restaurant data:', error.message);
  process.exit(1);
}

let restaurants = restaurantData.places;

// Function to extract ZIP code from restaurant data
function getZipCode(restaurant) {
  const addressComponents = restaurant.google_data?.addressComponents || [];
  const zipComponent = addressComponents.find(c => c.types && c.types.includes('postal_code'));
  return zipComponent?.shortText || null;
}

// Update neighborhoods based on ZIP codes
let updated = 0;
let notUpdated = 0;

restaurants = restaurants.map(restaurant => {
  const zip = getZipCode(restaurant);
  const currentNeighborhood = restaurant.neighborhood_extracted;
  
  // Only update if we have a ZIP code mapping and current value is too broad
  const broadLocations = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', null, ''];
  
  if (zip && NYC_ZIP_TO_NEIGHBORHOOD[zip] && broadLocations.includes(currentNeighborhood)) {
    updated++;
    const newNeighborhood = NYC_ZIP_TO_NEIGHBORHOOD[zip];
    console.log(`✓ ${restaurant.google_data.displayName.text}`);
    console.log(`  ${currentNeighborhood || 'null'} → ${newNeighborhood} (${zip})`);
    
    return {
      ...restaurant,
      neighborhood_extracted: newNeighborhood
    };
  } else {
    notUpdated++;
    // Keep existing (might be Tokyo, Paris, Seoul which we handle separately)
    return restaurant;
  }
});

// Report results
console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log(`  Total restaurants: ${restaurants.length}`);
console.log(`  NYC neighborhoods updated: ${updated}`);
console.log(`  Not updated (non-NYC or already specific): ${notUpdated}`);

// Breakdown by neighborhood
const neighborhoodCounts = {};
restaurants.forEach(r => {
  const n = r.neighborhood_extracted || 'Unknown';
  neighborhoodCounts[n] = (neighborhoodCounts[n] || 0) + 1;
});

console.log('\nTop neighborhoods:');
Object.entries(neighborhoodCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([neighborhood, count]) => {
    console.log(`  ${neighborhood}: ${count}`);
  });

// Create backup
const backupPath = restaurantsPath.replace('.json', '.backup.json');
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, JSON.stringify(JSON.parse(fs.readFileSync(restaurantsPath, 'utf8')), null, 2));
  console.log(`\n✓ Backup created: ${backupPath}`);
}

// Write updated data
const updatedData = {
  ...restaurantData,
  places: restaurants
};
fs.writeFileSync(restaurantsPath, JSON.stringify(updatedData, null, 2));
console.log(`✓ Updated data written to: ${restaurantsPath}`);

console.log('\n' + '='.repeat(60));
console.log('✨ Done! NYC neighborhoods now use ZIP code mapping');
console.log('\nNote: Tokyo, Paris, and Seoul neighborhoods need separate handling');
console.log('since they use different address systems.');
console.log('='.repeat(60));