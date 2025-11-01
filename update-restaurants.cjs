const fs = require('fs');

// Configuration
const DATA_FILE = './api/data/276_reduced.ts';
const BACKUP_FILE = `${DATA_FILE}.backup-${Date.now()}`;

// Restaurants to delete
const RESTAURANTS_TO_DELETE = [
  'Nagatanien tokyo store igamono',
  'DASHI OKUME Brooklyn',
  '209 Stand',
  'Spiral',
  'Halle Saint-Pierre',
  'Bateaux Parisiens',
  'Root Everyday'
];

// Restaurants to mark as cynthias_pick
const RESTAURANTS_TO_MARK_PICK = [
  'Salinas Restaurant',
  'Savoul (Sabouru)',
  'Sequoia Rooftop Bar',
  'THESE',
  'Le Petit Marché',
  'Stohrer',
  'Baennom',
  'Hoho Sikdang Ikseon',
  'Tomiño Taberna Gallega',
  'Crown Shy',
  'OKONOMI Brooklyn'
];

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

// Track changes
let deletedCount = 0;
let markedPickCount = 0;
let bakeriCount = 0;
const bakeriIds = [];

// Find and process restaurants
restaurants = restaurants.filter(restaurant => {
  const name = restaurant.google_data?.displayName?.text || '';
  
  // Check if should be deleted
  if (RESTAURANTS_TO_DELETE.includes(name)) {
    console.log(`🗑️  Deleting: ${name}`);
    deletedCount++;
    return false; // Remove from array
  }
  
  // Check if should be marked as cynthias_pick
  if (RESTAURANTS_TO_MARK_PICK.includes(name)) {
    if (restaurant.cynthias_pick !== true) {
      console.log(`👑 Marking as Cynthia's pick: ${name}`);
      restaurant.cynthias_pick = true;
      markedPickCount++;
    }
  }
  
  // Track Bakeri entries
  if (name === 'Bakeri') {
    bakeriCount++;
    bakeriIds.push({
      placeId: restaurant.google_place_id,
      address: restaurant.original_place?.properties?.location?.address || 'N/A'
    });
  }
  
  return true; // Keep in array
});

// Check for duplicate Bakeri
if (bakeriCount > 1) {
  console.log(`\n⚠️  Found ${bakeriCount} Bakeri entries:`);
  bakeriIds.forEach((b, idx) => {
    console.log(`   ${idx + 1}. ${b.placeId} - ${b.address}`);
  });
  
  // Keep only the first one, remove duplicates
  let foundFirst = false;
  restaurants = restaurants.filter(restaurant => {
    const name = restaurant.google_data?.displayName?.text || '';
    if (name === 'Bakeri') {
      if (!foundFirst) {
        foundFirst = true;
        console.log(`   ✓ Keeping first Bakeri: ${restaurant.google_place_id}`);
        return true;
      } else {
        console.log(`   ✗ Removing duplicate Bakeri: ${restaurant.google_place_id}`);
        deletedCount++;
        return false;
      }
    }
    return true;
  });
}

// Save the updated data
console.log('\n💾 Saving updated data...');

const newContent = `// Auto-generated from 285_restaurants_enriched.json
// Do not edit manually - regenerate by running: node convert-data.js
// Photos enriched on ${new Date().toISOString()}
// Updated: ${new Date().toISOString()}

export const restaurantData = ${JSON.stringify(restaurants, null, 2)};
`;

fs.writeFileSync(DATA_FILE, newContent);

console.log(`✅ Data saved to: ${DATA_FILE}`);
console.log(`\n📊 Summary:`);
console.log(`   Deleted: ${deletedCount} restaurants`);
console.log(`   Marked as Cynthia's pick: ${markedPickCount} restaurants`);
console.log(`   Total restaurants: ${restaurants.length}`);

