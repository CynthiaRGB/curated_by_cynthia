// add-price-display.js
// Run this script to add price_display field ($ $$ $$$ $$$$) to your restaurant data

const fs = require('fs');
const path = require('path');

// Function to convert price range to dollar signs
function getPriceDisplay(priceRange) {
  if (!priceRange || !priceRange.startPrice || !priceRange.endPrice) {
    return null; // No price data
  }
  
  const startPrice = parseInt(priceRange.startPrice.units);
  const endPrice = parseInt(priceRange.endPrice.units);
  const avgPrice = (startPrice + endPrice) / 2;
  
  // Convert to dollar signs based on average price
  if (avgPrice <= 10) return '$';
  if (avgPrice <= 25) return '$$';
  if (avgPrice <= 50) return '$$$';
  return '$$$$';
}

// Read the restaurants JSON file
const restaurantsPath = path.join(__dirname, 'src', 'data', 'google_enriched_restaurants_311_clean.json');
console.log('Reading restaurants data from:', restaurantsPath);

let restaurantData;
try {
  const fileContent = fs.readFileSync(restaurantsPath, 'utf8');
  restaurantData = JSON.parse(fileContent);
  restaurants = restaurantData.places; // The restaurants are in the 'places' array
  console.log(`✓ Loaded ${restaurants.length} restaurants\n`);
} catch (error) {
  console.error('Error reading restaurant data:', error.message);
  process.exit(1);
}

// Update the restaurants data with price_display
let pricesAdded = 0;
let noPriceData = 0;

restaurants = restaurants.map(restaurant => {
  const priceDisplay = getPriceDisplay(restaurant.google_data?.priceRange);
  
  if (priceDisplay) {
    pricesAdded++;
  } else {
    noPriceData++;
  }
  
  return {
    ...restaurant,
    price_display: priceDisplay
  };
});

// Sample output for verification
console.log('Sample price conversions:');
const samples = restaurants.filter(r => r.price_display).slice(0, 5);
samples.forEach(r => {
  const range = r.google_data.priceRange;
  console.log(`  ${r.google_data.displayName.text}: $${range.startPrice.units}-$${range.endPrice.units} → ${r.price_display}`);
});

// Report results
console.log('\n' + '='.repeat(60));
console.log(`Summary:`);
console.log(`  Total restaurants: ${restaurants.length}`);
console.log(`  Price display added: ${pricesAdded}`);
console.log(`  No price data: ${noPriceData}`);

// Breakdown by price level
const priceBreakdown = {
  '$': restaurants.filter(r => r.price_display === '$').length,
  '$$': restaurants.filter(r => r.price_display === '$$').length,
  '$$$': restaurants.filter(r => r.price_display === '$$$').length,
  '$$$$': restaurants.filter(r => r.price_display === '$$$$').length,
};
console.log(`\n  Price breakdown:`);
console.log(`    $ (budget): ${priceBreakdown['$']}`);
console.log(`    $$ (moderate): ${priceBreakdown['$$']}`);
console.log(`    $$$ (upscale): ${priceBreakdown['$$$']}`);
console.log(`    $$$$ (luxury): ${priceBreakdown['$$$$']}`);

// Create backup
const backupPath = restaurantsPath.replace('.json', `.backup-${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(restaurantData, null, 2));
console.log(`\n✓ Backup created: ${backupPath}`);

// Update the restaurantData with the modified restaurants
restaurantData.places = restaurants;

// Write updated data
fs.writeFileSync(restaurantsPath, JSON.stringify(restaurantData, null, 2));
console.log(`✓ Updated data written to: ${restaurantsPath}`);

console.log('\n' + '='.repeat(60));
console.log('✨ Done! Price display field added to all restaurants');
console.log('\nPrice conversion logic:');
console.log('  Average ≤ $10  → $');
console.log('  Average ≤ $25  → $$');
console.log('  Average ≤ $50  → $$$');
console.log('  Average > $50  → $$$$');
console.log('\nNext steps:');
console.log('  1. Review the sample conversions above');
console.log('  2. Run your filter service to test price filtering!');
console.log('='.repeat(60));