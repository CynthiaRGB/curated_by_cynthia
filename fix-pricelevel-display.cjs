const fs = require('fs');

const DATA_FILE = './api/data/final_data.ts';

// Map Google priceLevel to price_display
function mapPriceLevelToDisplay(priceLevel) {
  const priceMap = {
    'PRICE_LEVEL_FREE': 'Free',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$'
  };
  return priceMap[priceLevel] || null;
}

function fixPriceLevelDisplay() {
  console.log('Reading data file...');
  const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
  
  // Use require to load the data (works for .ts files in Node)
  delete require.cache[require.resolve(DATA_FILE)];
  const { restaurantData } = require(DATA_FILE);
  const restaurants = restaurantData;
  
  console.log(`Found ${restaurants.length} restaurants\n`);
  
  let updatedCount = 0;
  const updates = [];
  
  for (let i = 0; i < restaurants.length; i++) {
    const restaurant = restaurants[i];
    
    // Only process restaurants that:
    // 1. Have priceLevel
    // 2. Do NOT have priceRange (no startPrice and no endPrice)
    const hasPriceRange = restaurant.google_data?.priceRange?.startPrice || 
                         restaurant.google_data?.priceRange?.endPrice;
    const hasPriceLevel = restaurant.google_data?.priceLevel;
    
    if (hasPriceLevel && !hasPriceRange) {
      const expectedDisplay = mapPriceLevelToDisplay(restaurant.google_data.priceLevel);
      const currentDisplay = restaurant.price_display;
      
      if (expectedDisplay && currentDisplay !== expectedDisplay) {
        restaurant.price_display = expectedDisplay;
        updatedCount++;
        
        if (updates.length < 20) {
          updates.push({
            name: restaurant.google_data.displayName?.text || 'Unknown',
            city: restaurant.city || 'Unknown',
            priceLevel: restaurant.google_data.priceLevel,
            old: currentDisplay,
            new: expectedDisplay
          });
        }
      }
    }
  }
  
  // Write back to file
  if (updatedCount > 0) {
    console.log(`Updating ${updatedCount} restaurants...\n`);
    
    // Find the array boundaries
    const exportStart = fileContent.indexOf('export const restaurantData = [');
    if (exportStart === -1) {
      throw new Error('Could not find export statement');
    }
    
    // Find the closing bracket
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let arrayStart = exportStart + 'export const restaurantData = '.length;
    let arrayEnd = arrayStart;
    
    for (let i = arrayStart; i < fileContent.length; i++) {
      const char = fileContent[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '[') bracketCount++;
        else if (char === ']') {
          if (bracketCount === 0) {
            arrayEnd = i + 1;
            while (arrayEnd < fileContent.length && /\s/.test(fileContent[arrayEnd])) arrayEnd++;
            if (fileContent[arrayEnd] === ';') arrayEnd++;
            break;
          }
          bracketCount--;
        }
      }
    }
    
    const newRestaurantsJson = JSON.stringify(restaurants, null, 2);
    const beforeArray = fileContent.substring(0, arrayStart);
    const afterArray = fileContent.substring(arrayEnd);
    const newFileContent = beforeArray + newRestaurantsJson + afterArray;
    
    fs.writeFileSync(DATA_FILE, newFileContent, 'utf-8');
    
    console.log('='.repeat(60));
    console.log('UPDATE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total restaurants: ${restaurants.length}`);
    console.log(`Updated: ${updatedCount}`);
    
    if (updates.length > 0) {
      console.log(`\nSample updates:`);
      updates.forEach(update => {
        console.log(`  ${update.name} (${update.city}):`);
        console.log(`    priceLevel: ${update.priceLevel}`);
        console.log(`    ${update.old} → ${update.new}`);
      });
    }
    
    console.log('='.repeat(60));
    console.log('✅ Update completed successfully!\n');
  } else {
    console.log('No restaurants needed updating.\n');
  }
}

try {
  fixPriceLevelDisplay();
} catch (error) {
  console.error('❌ Update failed:', error);
  process.exit(1);
}

