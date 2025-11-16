// Script to add borough data to restaurants in latest_277.ts
// Run: node add-borough-data.cjs

const fs = require('fs');
const path = require('path');

// Brooklyn neighborhoods
const brooklynNeighborhoods = [
  'williamsburg', 'greenpoint', 'park slope', 'dumbo', 'cobble hill',
  'carroll gardens', 'red hook', 'brooklyn heights', 'fort greene',
  'prospect heights', 'bedford-stuyvesant', 'bushwick', 'gowanus',
  'sunset park', 'bay ridge', 'dyker heights', 'bensonhurst',
  'sheepshead bay', 'brighton beach', 'coney island', 'flatbush',
  'crown heights', 'east new york', 'brownsville', 'flatlands', 'southside'
];

const dataFile = path.join(__dirname, 'api/data/latest_277.ts');

console.log('Reading data file...');
const content = fs.readFileSync(dataFile, 'utf8');

// Extract the restaurant data array
const match = content.match(/export const restaurantData = (\[[\s\S]*\]);/);
if (!match) {
  console.error('Could not find restaurantData array');
  process.exit(1);
}

const dataStr = match[1];
let restaurants;
try {
  // Evaluate the array (safe since it's our own data file)
  restaurants = eval(dataStr);
} catch (e) {
  console.error('Error parsing restaurant data:', e);
  process.exit(1);
}

console.log(`Processing ${restaurants.length} restaurants...`);

let brooklynCount = 0;
let manhattanCount = 0;
let unchangedCount = 0;

restaurants.forEach((restaurant) => {
  const city = restaurant.city || '';
  const isNYC = city.toLowerCase().includes('new york') || city.toLowerCase().includes('nyc');
  
  if (!isNYC) {
    unchangedCount++;
    return; // Skip non-NYC restaurants
  }
  
  // Skip if borough already exists
  if (restaurant.borough) {
    unchangedCount++;
    return;
  }
  
  const address = (restaurant.original_place?.properties?.location?.address || '').toLowerCase();
  const neighborhood = (restaurant.neighborhood_extracted || '').toLowerCase();
  
  // Check if Brooklyn
  const isBrooklyn = address.includes('brooklyn') || 
                    brooklynNeighborhoods.some(n => neighborhood.includes(n));
  
  if (isBrooklyn) {
    restaurant.borough = 'brooklyn';
    brooklynCount++;
  } else {
    // If not Brooklyn and is NYC, assume Manhattan
    // (Midtown is Manhattan, and most NYC restaurants without Brooklyn address are Manhattan)
    restaurant.borough = 'manhattan';
    manhattanCount++;
  }
});

console.log(`\nBorough assignment complete:`);
console.log(`  Brooklyn: ${brooklynCount}`);
console.log(`  Manhattan: ${manhattanCount}`);
console.log(`  Unchanged (non-NYC or already has borough): ${unchangedCount}`);

// Reconstruct the file - need to be careful with formatting
// Since the file is huge, we'll use a more efficient approach
const beforeExport = content.substring(0, content.indexOf('export const restaurantData ='));
const afterArray = content.substring(content.indexOf('];', content.indexOf('export const restaurantData =')) + 2);

// Write restaurants as JSON (will be minified, but that's okay for now)
const restaurantsJson = JSON.stringify(restaurants);
const newContent = beforeExport + `export const restaurantData = ${restaurantsJson} as any;` + afterArray;

// Write back to file
fs.writeFileSync(dataFile, newContent, 'utf8');
console.log(`\n✅ Updated ${dataFile}`);
console.log('⚠️  Note: This is a large file. TypeScript compilation may take a moment.');

