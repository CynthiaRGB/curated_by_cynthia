const fs = require('fs');

// Configuration
const DATA_FILE = './api/data/276_reduced.ts';
const BACKUP_FILE = `${DATA_FILE}.backup-${Date.now()}`;

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

console.log(`Found ${restaurants.length} restaurants\n`);

let removedCount = 0;

// Remove regularOpeningHours from all restaurants
restaurants.forEach((restaurant, index) => {
  if (restaurant.google_data?.regularOpeningHours !== undefined) {
    delete restaurant.google_data.regularOpeningHours;
    removedCount++;
  }
});

console.log(`Removed regularOpeningHours from ${removedCount} restaurants\n`);

// Save the updated data
console.log('💾 Saving updated data...');

const newContent = `// Auto-generated from 285_restaurants_enriched.json
// Do not edit manually - regenerate by running: node convert-data.js
// Photos enriched on ${new Date().toISOString()}
// Updated: ${new Date().toISOString()}

export const restaurantData = ${JSON.stringify(restaurants, null, 2)};
`;

fs.writeFileSync(DATA_FILE, newContent);

console.log(`✅ Data saved to: ${DATA_FILE}`);
console.log(`\n📊 Summary:`);
console.log(`   Restaurants processed: ${restaurants.length}`);
console.log(`   Fields removed: ${removedCount}`);

