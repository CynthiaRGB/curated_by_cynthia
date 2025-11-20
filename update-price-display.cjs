const fs = require('fs');
const path = require('path');

const DATA_FILE = './api/data/final_data.ts';

// Exact range mappings by city and currency
const RANGE_MAPPINGS = {
  'New York City': {
    'USD': {
      '1-10': '$',
      '10-20': '$',
      '20-30': '$$',
      '30-50': '$$',
      '50-100': '$$$',
      '100+': '$$$$'
    }
  },
  'Tokyo': {
    'JPY': {
      '1-1000': '$',
      '1-2000': '$',
      '1000-2000': '$',
      '1000-3000': '$$',
      '2000-3000': '$$',
      '4000-5000': '$$',
      '10000+': '$$$$'
    }
  },
  'Paris': {
    'EUR': {
      '1-10': '$',
      '10-20': '$',
      '10-30': '$$',
      '20-30': '$$',
      '20-40': '$$',
      '40-50': '$$',
      '100+': '$$$$'
    }
  },
  'Seoul': {
    'KRW': {
      '1-10000': '$',
      '1-20000': '$',
      '10000-20000': '$',
      '10000-30000': '$$',
      '20000-30000': '$$',
      '40000-60000': '$$$',
      '100000+': '$$$$'
    }
  }
};

/**
 * Map Google priceLevel to price_display
 */
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

/**
 * Calculate price_display from priceRange using exact range mappings
 */
function calculatePriceDisplayFromRange(priceRange, city) {
  if (!priceRange) {
    return null;
  }

  const hasStart = priceRange.startPrice && priceRange.startPrice.units;
  const hasEnd = priceRange.endPrice && priceRange.endPrice.units;
  
  if (!hasStart && !hasEnd) {
    return null;
  }

  const currencyCode = (priceRange.endPrice?.currencyCode || priceRange.startPrice?.currencyCode);
  if (!currencyCode) {
    return null;
  }

  const cityMapping = RANGE_MAPPINGS[city];
  if (!cityMapping) {
    return null;
  }

  const currencyMapping = cityMapping[currencyCode];
  if (!currencyMapping) {
    return null;
  }

  // If only startPrice exists (no endPrice), check for "+" ranges
  if (hasStart && !hasEnd) {
    const start = parseInt(priceRange.startPrice.units, 10);
    if (currencyCode === 'USD' && start >= 100) {
      return currencyMapping['100+'] || null;
    } else if (currencyCode === 'JPY' && start >= 10000) {
      return currencyMapping['10000+'] || null;
    } else if (currencyCode === 'EUR' && start >= 100) {
      return currencyMapping['100+'] || null;
    } else if (currencyCode === 'KRW' && start >= 100000) {
      return currencyMapping['100000+'] || null;
    }
    return null;
  }

  // If both startPrice and endPrice exist, match the exact range
  if (hasStart && hasEnd) {
    const start = parseInt(priceRange.startPrice.units, 10);
    const end = parseInt(priceRange.endPrice.units, 10);
    const rangeKey = `${start}-${end}`;

    // Try exact match first
    if (currencyMapping[rangeKey]) {
      return currencyMapping[rangeKey];
    }

    // If no exact match, try to find matching range
    for (const [key, value] of Object.entries(currencyMapping)) {
      if (key.includes('+')) continue; // Skip "+" ranges
      const [rangeStart, rangeEnd] = key.split('-').map(n => parseInt(n, 10));
      if (start === rangeStart && end === rangeEnd) {
        return value;
      }
    }

    return null;
  }

  return null;
}

/**
 * Main function to update price_display for all restaurants
 */
function updatePriceDisplay() {
  console.log('Reading data file...');
  const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
  
  // Extract the restaurants array from the TypeScript file
  // Use a more robust method for large files
  const exportStart = fileContent.indexOf('export const restaurantData = [');
  if (exportStart === -1) {
    throw new Error('Could not find export statement');
  }
  
  // Find the matching closing bracket and semicolon
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
      if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        if (bracketCount === 0) {
          arrayEnd = i + 1;
          // Find the semicolon
          while (arrayEnd < fileContent.length && /\s/.test(fileContent[arrayEnd])) {
            arrayEnd++;
          }
          if (fileContent[arrayEnd] === ';') {
            arrayEnd++;
          }
          break;
        }
        bracketCount--;
      }
    }
  }
  
  // arrayEnd points to after the ], so we need to include it
  // But we need to find where the ] actually is
  let actualArrayEnd = arrayStart;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  
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
      if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        if (bracketCount === 0) {
          actualArrayEnd = i + 1; // Include the ]
          break;
        }
        bracketCount--;
      }
    }
  }
  
  const restaurantsJson = fileContent.substring(arrayStart, actualArrayEnd);
  const restaurants = JSON.parse(restaurantsJson); // Parse the JSON array

  console.log(`Found ${restaurants.length} restaurants\n`);
  
  let updatedCount = 0;
  let skippedCount = 0;
  let noPriceRangeCount = 0;
  const stats = {
    byCity: {},
    byCurrency: {},
    byDisplay: {},
    updates: []
  };

  for (let i = 0; i < restaurants.length; i++) {
    const restaurant = restaurants[i];
    const city = restaurant.city;
    let newPriceDisplay = null;
    
    // Priority 1: Calculate from priceRange data (startPrice and/or endPrice)
    if (restaurant.google_data?.priceRange?.startPrice || restaurant.google_data?.priceRange?.endPrice) {
      newPriceDisplay = calculatePriceDisplayFromRange(restaurant.google_data.priceRange, city);
      
      if (newPriceDisplay) {
        const oldPriceDisplay = restaurant.price_display;
        
        // Update if different
        if (oldPriceDisplay !== newPriceDisplay) {
          restaurant.price_display = newPriceDisplay;
          updatedCount++;
          
          // Track statistics
          const currency = restaurant.google_data.priceRange.endPrice?.currencyCode || 
                          restaurant.google_data.priceRange.startPrice?.currencyCode || 
                          'UNKNOWN';
          
          stats.byCity[city] = (stats.byCity[city] || 0) + 1;
          stats.byCurrency[currency] = (stats.byCurrency[currency] || 0) + 1;
          
          // Track some examples
          if (stats.updates.length < 10) {
            stats.updates.push({
              name: restaurant.google_data.displayName?.text || 'Unknown',
              city,
              old: oldPriceDisplay,
              new: newPriceDisplay,
              source: 'priceRange'
            });
          }
        } else {
          skippedCount++;
        }
      } else {
        // Could not calculate from priceRange (no matching range)
        skippedCount++;
      }
    }
    // Priority 2: Use priceLevel as fallback if no priceRange data
    else if (restaurant.google_data?.priceLevel) {
      newPriceDisplay = mapPriceLevelToDisplay(restaurant.google_data.priceLevel);
      
      if (newPriceDisplay) {
        const oldPriceDisplay = restaurant.price_display;
        
        // Update if different
        if (oldPriceDisplay !== newPriceDisplay) {
          restaurant.price_display = newPriceDisplay;
          updatedCount++;
          
          stats.byCity[city] = (stats.byCity[city] || 0) + 1;
          
          // Track some examples
          if (stats.updates.length < 10) {
            stats.updates.push({
              name: restaurant.google_data.displayName?.text || 'Unknown',
              city,
              old: oldPriceDisplay,
              new: newPriceDisplay,
              source: 'priceLevel'
            });
          }
        } else {
          skippedCount++;
        }
      }
    } else {
      // No priceRange or priceLevel data - leave as is
      noPriceRangeCount++;
    }

    // Track final distribution
    const finalDisplay = restaurant.price_display || 'N/A';
    stats.byDisplay[finalDisplay] = (stats.byDisplay[finalDisplay] || 0) + 1;
  }

  // Reconstruct the file content
  console.log('Stringifying updated restaurants...');
  const newRestaurantsJson = JSON.stringify(restaurants, null, 2);
  
  // Use the same boundaries we found earlier
  const exportStartPos = exportStart;
  const arrayEndPos = arrayEnd;
  
  for (let i = arrayEnd; i < fileContent.length; i++) {
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
      if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        if (bracketCount === 0) {
          arrayEnd = i + 1;
          // Find the semicolon
          while (arrayEnd < fileContent.length && /\s/.test(fileContent[arrayEnd])) {
            arrayEnd++;
          }
          if (fileContent[arrayEnd] === ';') {
            arrayEnd++;
          }
          break;
        }
        bracketCount--;
      }
    }
  }
  
  // Replace the array content
  const beforeArray = fileContent.substring(0, exportStartPos + 'export const restaurantData = '.length);
  const afterArray = fileContent.substring(arrayEndPos);
  const newFileContent = beforeArray + newRestaurantsJson + afterArray;

  // Write back to file
  console.log('Writing updated data back to file...\n');
  fs.writeFileSync(DATA_FILE, newFileContent, 'utf-8');
  
  // Verify write by checking one restaurant
  console.log('Verifying write...');
  const verifyContent = fs.readFileSync(DATA_FILE, 'utf-8');
  const testRestaurant = restaurants.find(r => r.google_place_id === 'ChIJ_RUJvZZZwokRNUEv3K4nSik');
  if (testRestaurant && verifyContent.includes(`"price_display": "${testRestaurant.price_display}"`)) {
    console.log(`✓ File written successfully (verified OLIO E PIÙ: ${testRestaurant.price_display})`);
  } else {
    console.log('✗ Warning: Could not verify file write');
  }

  // Print statistics
  console.log('='.repeat(60));
  console.log('UPDATE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total restaurants: ${restaurants.length}`);
  console.log(`Updated price_display: ${updatedCount}`);
  console.log(`Skipped (no change or no match): ${skippedCount}`);
  console.log(`No priceRange data (left unchanged): ${noPriceRangeCount}`);
  
  console.log(`\nUpdates by city:`);
  Object.entries(stats.byCity).forEach(([city, count]) => {
    console.log(`  ${city}: ${count}`);
  });

  console.log(`\nUpdates by currency:`);
  Object.entries(stats.byCurrency).forEach(([currency, count]) => {
    console.log(`  ${currency}: ${count}`);
  });

  if (stats.updates.length > 0) {
    console.log(`\nSample updates:`);
    stats.updates.forEach(update => {
      console.log(`  ${update.name} (${update.city}): ${update.old} → ${update.new}`);
    });
  }

  console.log(`\nFinal price_display distribution:`);
  Object.entries(stats.byDisplay).forEach(([display, count]) => {
    console.log(`  ${display}: ${count}`);
  });
  
  console.log('='.repeat(60));
  console.log('✅ Update completed successfully!\n');
}

// Run the update
try {
  updatePriceDisplay();
} catch (error) {
  console.error('❌ Update failed:', error);
  process.exit(1);
}

