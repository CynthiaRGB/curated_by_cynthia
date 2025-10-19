// add-cynthias-picks.js
// Run this script to add cynthias_pick field to your restaurant data

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cynthia's favorite restaurants (matched by address for accuracy)
const CYNTHIAS_FAVORITES = [
  // New York City
  { name: "Buvette", address: "42 Grove St", city: "NYC" },
  { name: "Casino", address: "171 E Broadway", city: "NYC" },
  { name: "Take 31", address: "15 E 31st St", city: "NYC" },
  { name: "La Mercerie", address: "53 Howard St", city: "NYC" },
  { name: "OLIO E PIU", address: "3 Greenwich Ave", city: "NYC" },
  { name: "Kiki's", address: "130 Division St", city: "NYC" },
  { name: "NR", address: "339 E 75th St", city: "NYC" },
  { name: "Thai Diner", address: "186 Mott St", city: "NYC" },
  { name: "Cosme", address: "35 E 21st St", city: "NYC" },
  { name: "Hi-Collar", address: "231 E 9th St", city: "NYC" },
  { name: "Le Coucou", address: "138 Lafayette St", city: "NYC" },
  { name: "Peter Luger Steak House", address: "178 Broadway, Brooklyn", city: "NYC" },
  { name: "Peter Luger", address: "178 Broadway, Brooklyn", city: "NYC" },
  { name: "Cafe Mogador", address: "101 St Marks Pl", city: "NYC" },
  
  // Tokyo
  { name: "Cafe Les Jeux Grenier", address: "Minamiaoyama, 5 Chome", city: "Tokyo" },
  { name: "Chatei Hatou", address: "1 Chome-15-19 Shibuya", city: "Tokyo" },
  { name: "Café Trois Chambres", address: "Daizawa, 5 Chome-36-14", city: "Tokyo" },
  { name: "Hitsumabushi Bincho", address: "Ginza, 2 Chome-2-14", city: "Tokyo" },
  { name: "il tram", address: "Miyoshi, 4 Chome-9-5", city: "Tokyo" },
  { name: "Ramen Takahashi", address: "Kabukicho, 1 Chome-27-3", city: "Tokyo" },
  { name: "Path", address: "Tomigaya, 1 Chome-44-2", city: "Tokyo" },
  
  // Paris
  { name: "La Tour Montlhéry", address: "5 Rue des Prouvaires", city: "Paris" },
  { name: "Chez Denise", address: "5 Rue des Prouvaires", city: "Paris" },
  { name: "JanTchi", address: "6 Rue Thérèse", city: "Paris" },
  { name: "Les Antiquaires", address: "13 Rue du Bac", city: "Paris" },
  { name: "Le Cabanon de la Butte", address: "6 Rue Lamarck", city: "Paris" },
  { name: "Crêperie Little Breizh", address: "11 Rue Grégoire de Tours", city: "Paris" },
  { name: "Créatures", address: "25 Rue de la Chau", city: "Paris" },
  { name: "Restaurant le Meurice Alain Ducasse", address: "228 Rue de Rivoli", city: "Paris" },
  { name: "Le Meurice", address: "228 Rue de Rivoli", city: "Paris" },
  
  // Seoul
  { name: "Cafe Onion Anguk", address: "5 Gyedong-gil, Jongno", city: "Seoul" },
  { name: "Katsu by Konban", address: "36 Seolleung-ro 153-gil, Gangnam", city: "Seoul" },
  { name: "Keunkiwajip", address: "20-7 Bukchon-ro, Jongno", city: "Seoul" },
  { name: "DongBaek Bakery", address: "17-24 Supyo-ro 28-gil, Jongno", city: "Seoul" },
  { name: "Onryang", address: "4 Baekjegobun-ro 43-gil, Songpa", city: "Seoul" }
];

// Read the restaurants TS file
const restaurantsPath = path.join(__dirname, 'api', 'data', '285_with_photo.ts');
console.log('Reading restaurants data from:', restaurantsPath);

let data;
let fileContent;
try {
  fileContent = fs.readFileSync(restaurantsPath, 'utf8');
  // Extract the restaurantData array from the TypeScript file
  const match = fileContent.match(/export const restaurantData = (\[[\s\S]*\]);/);
  if (!match) {
    throw new Error('Could not find restaurantData export in TypeScript file');
  }
  data = JSON.parse(match[1]);
} catch (error) {
  console.error('Error reading restaurants file:', error.message);
  process.exit(1);
}

const restaurants = data;
console.log(`✓ Loaded ${restaurants.length} restaurants\n`);

// Function to check if a restaurant matches Cynthia's favorites
function isCynthiasFavorite(restaurant) {
  const restaurantAddress = restaurant.original_place?.properties?.location?.address || '';
  const restaurantName = restaurant.google_data?.displayName?.text || '';
  
  return CYNTHIAS_FAVORITES.some(favorite => {
    // Match by address (more reliable than name)
    const addressMatch = restaurantAddress.toLowerCase().includes(favorite.address.toLowerCase());
    // Backup: match by name
    const nameMatch = restaurantName.toLowerCase().includes(favorite.name.toLowerCase());
    
    return addressMatch || nameMatch;
  });
}

// Update the restaurants data
let picksFound = 0;
let picksNotFound = [];

const updatedRestaurants = restaurants.map(restaurant => {
  const isFavorite = isCynthiasFavorite(restaurant);
  
  if (isFavorite) {
    picksFound++;
    const name = restaurant.google_data?.displayName?.text || 'Unknown';
    const address = restaurant.original_place?.properties?.location?.address || 'Unknown';
    console.log(`🏆 Found: ${name} (${address})`);
  }
  
  return {
    ...restaurant,
    cynthias_pick: isFavorite
  };
});

// Check which favorites weren't found
CYNTHIAS_FAVORITES.forEach(favorite => {
  const found = updatedRestaurants.some(r => {
    const address = r.original_place?.properties?.location?.address || '';
    return address.toLowerCase().includes(favorite.address.toLowerCase());
  });
  
  if (!found) {
    picksNotFound.push(`${favorite.name} (${favorite.address})`);
  }
});

// Report results
console.log('\n' + '='.repeat(60));
console.log(`Summary:`);
console.log(`  Total restaurants: ${updatedRestaurants.length}`);
console.log(`  Cynthia's picks found: ${picksFound}/${CYNTHIAS_FAVORITES.length}`);
console.log(`  Regular restaurants: ${updatedRestaurants.length - picksFound}`);

// Breakdown by city
const picksByCity = {
  NYC: updatedRestaurants.filter(r => r.cynthias_pick && 
    r.original_place?.properties?.location?.address?.includes('New York')).length,
  Tokyo: updatedRestaurants.filter(r => r.cynthias_pick && 
    r.original_place?.properties?.location?.address?.includes('Tokyo')).length,
  Paris: updatedRestaurants.filter(r => r.cynthias_pick && 
    r.original_place?.properties?.location?.address?.includes('Paris')).length,
  Seoul: updatedRestaurants.filter(r => r.cynthias_pick && 
    r.original_place?.properties?.location?.address?.includes('Seoul')).length,
};
console.log(`\n  Breakdown:`);
console.log(`    NYC picks: ${picksByCity.NYC}`);
console.log(`    Tokyo picks: ${picksByCity.Tokyo}`);
console.log(`    Paris picks: ${picksByCity.Paris}`);
console.log(`    Seoul picks: ${picksByCity.Seoul}`);

if (picksNotFound.length > 0) {
  console.log(`\n⚠️  Warning: ${picksNotFound.length} favorite(s) not found in data:`);
  picksNotFound.forEach(name => console.log(`     - ${name}`));
  console.log(`\n   These restaurants may not be in your 311-restaurant dataset.`);
}

// Create backup
const backupPath = restaurantsPath.replace('.ts', '.backup.ts');
fs.writeFileSync(backupPath, fileContent);
console.log(`\n✓ Backup created: ${backupPath}`);

// Update the data structure
data = updatedRestaurants;

// Write updated data back to TypeScript format
const updatedTsContent = `// Auto-generated from 285_review_subtracted.json
// Do not edit manually - regenerate by running: node convert-data.js

export const restaurantData = ${JSON.stringify(data, null, 2)};
`;
fs.writeFileSync(restaurantsPath, updatedTsContent);
console.log(`✓ Updated data written to: ${restaurantsPath}`);

console.log('\n' + '='.repeat(60));
console.log('✨ Done! Your favorite restaurants are now marked with cynthias_pick: true');
console.log('\nNext steps:');
console.log('  1. Review the changes in google_enriched_restaurants_311_clean.json');
console.log('  2. If something went wrong, restore from the backup file');
console.log('  3. Run enrich-cynthias-picks-photos.js to add photos!');
console.log('='.repeat(60));