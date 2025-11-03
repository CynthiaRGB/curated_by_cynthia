import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the restaurant data files
const mainDataFile = join(__dirname, 'api/data/latest_277.ts');
const additionalDataFile = join(__dirname, 'api/data/additional_restaurants_google_api.ts');

// Parse TypeScript file and extract the restaurantData array
function extractRestaurantData(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  // Extract the array content between export const restaurantData = [ and ];
  const match = content.match(/export const restaurantData = (\[[\s\S]*\]);/);
  if (!match) {
    throw new Error(`Could not parse restaurant data from ${filePath}`);
  }
  
  // Evaluate the array (this works because it's valid JavaScript)
  // We need to use eval or Function constructor since it's a TS file with export
  const arrayContent = match[1];
  const restaurants = eval(arrayContent);
  return restaurants;
}

// Find restaurants without generativeSummary or editorialSummary
function findRestaurantsWithoutSummaries(restaurants) {
  return restaurants.filter(restaurant => {
    const googleData = restaurant.google_data || {};
    const hasGenerativeSummary = googleData.generativeSummary !== undefined;
    const hasEditorialSummary = googleData.editorialSummary !== undefined;
    
    // Return true if NEITHER summary exists
    return !hasGenerativeSummary && !hasEditorialSummary;
  });
}

try {
  console.log('Loading restaurant data from latest_277.ts...');
  const mainRestaurants = extractRestaurantData(mainDataFile);
  console.log(`Found ${mainRestaurants.length} restaurants in main file`);
  
  console.log('\nLoading restaurant data from additional_restaurants_google_api.ts...');
  const additionalRestaurants = extractRestaurantData(additionalDataFile);
  console.log(`Found ${additionalRestaurants.length} restaurants in additional file`);
  
  console.log('\nAnalyzing restaurants...');
  const mainWithoutSummaries = findRestaurantsWithoutSummaries(mainRestaurants);
  const additionalWithoutSummaries = findRestaurantsWithoutSummaries(additionalRestaurants);
  
  const allWithoutSummaries = [...mainWithoutSummaries, ...additionalWithoutSummaries];
  
  console.log(`\n========================================`);
  console.log(`RESTAURANTS WITHOUT SUMMARIES`);
  console.log(`========================================`);
  console.log(`Total: ${allWithoutSummaries.length} restaurants`);
  console.log(`\nFrom main file: ${mainWithoutSummaries.length}`);
  console.log(`From additional file: ${additionalWithoutSummaries.length}`);
  
  console.log(`\n========================================`);
  console.log(`DETAILED LIST:`);
  console.log(`========================================\n`);
  
  allWithoutSummaries.forEach((restaurant, index) => {
    const name = restaurant.google_data?.displayName?.text || 
                 restaurant.original_place?.properties?.location?.name || 
                 'Unknown';
    const placeId = restaurant.google_place_id || 'N/A';
    const address = restaurant.google_data?.shortFormattedAddress || 
                   restaurant.google_data?.formattedAddress ||
                   restaurant.original_place?.properties?.location?.address || 
                   'N/A';
    const rating = restaurant.google_data?.rating || 'N/A';
    const userRatingCount = restaurant.google_data?.userRatingCount || 'N/A';
    
    console.log(`${index + 1}. ${name}`);
    console.log(`   Place ID: ${placeId}`);
    console.log(`   Address: ${address}`);
    console.log(`   Rating: ${rating} (${userRatingCount} reviews)`);
    console.log('');
  });
  
  // Also create a JSON file with just the names and place IDs for easy reference
  const summary = allWithoutSummaries.map(restaurant => ({
    name: restaurant.google_data?.displayName?.text || 
          restaurant.original_place?.properties?.location?.name || 
          'Unknown',
    placeId: restaurant.google_place_id || 'N/A',
    address: restaurant.google_data?.shortFormattedAddress || 
             restaurant.google_data?.formattedAddress ||
             restaurant.original_place?.properties?.location?.address || 
             'N/A',
    rating: restaurant.google_data?.rating || null,
    userRatingCount: restaurant.google_data?.userRatingCount || null,
    source: restaurant.original_place?.properties?.date ? 'main' : 'additional'
  }));
  
  const outputFile = join(__dirname, 'restaurants_without_summaries.json');
  writeFileSync(outputFile, JSON.stringify(summary, null, 2));
  console.log(`\n✅ Summary saved to: ${outputFile}`);
  
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}

