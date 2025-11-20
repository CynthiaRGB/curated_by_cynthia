const fs = require('fs');
const path = require('path');

const DATA_FILE = './api/data/final_data.ts';

// City-specific price thresholds (using endPrice)
const PRICE_THRESHOLDS = {
  USD: {
    budget: 20,
    moderate: 45,
    upscale: 100,
    // luxury: > 100
  },
  JPY: {
    budget: 2000,
    moderate: 5000,
    upscale: 10000,
    // luxury: > 10000
  },
  EUR: {
    budget: 20,
    moderate: 40,
    upscale: 70,
    // luxury: > 70
  },
  KRW: {
    budget: 15000,
    moderate: 35000,
    upscale: 80000,
    // luxury: > 80000
  }
};

// Map Google priceLevel to price_display
function mapPriceLevelToDisplay(priceLevel) {
  const priceMap = {
    'PRICE_LEVEL_FREE': 'Free',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$'
  };
  return priceMap[priceLevel] || 'N/A';
}

// Calculate price_display from priceRange using exact range mappings
function calculatePriceDisplayFromRange(priceRange, city) {
  if (!priceRange) {
    return 'N/A';
  }

  const hasStart = priceRange.startPrice && priceRange.startPrice.units;
  const hasEnd = priceRange.endPrice && priceRange.endPrice.units;
  
  if (!hasStart && !hasEnd) {
    return 'N/A';
  }

  const currencyCode = (priceRange.endPrice?.currencyCode || priceRange.startPrice?.currencyCode);
  if (!currencyCode) {
    return 'N/A';
  }

  // Exact range mappings by city and currency
  const rangeMappings = {
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

  const cityMapping = rangeMappings[city];
  if (!cityMapping) {
    return 'N/A';
  }

  const currencyMapping = cityMapping[currencyCode];
  if (!currencyMapping) {
    return 'N/A';
  }

  // If only startPrice exists (no endPrice), check for "+" ranges
  if (hasStart && !hasEnd) {
    const start = parseInt(priceRange.startPrice.units, 10);
    // Check for startPrice-only ranges (e.g., $100+, ¥10000+)
    if (currencyCode === 'USD' && start >= 100) {
      return currencyMapping['100+'] || 'N/A';
    } else if (currencyCode === 'JPY' && start >= 10000) {
      return currencyMapping['10000+'] || 'N/A';
    } else if (currencyCode === 'EUR' && start >= 100) {
      return currencyMapping['100+'] || 'N/A';
    } else if (currencyCode === 'KRW' && start >= 100000) {
      return currencyMapping['100000+'] || 'N/A';
    }
    // If startPrice doesn't match a "+" range, return N/A
    return 'N/A';
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

    // If no exact match, try to find the best matching range
    // Check each range in the mapping
    for (const [key, value] of Object.entries(currencyMapping)) {
      if (key.includes('+')) continue; // Skip "+" ranges
      
      const [rangeStart, rangeEnd] = key.split('-').map(n => parseInt(n, 10));
      if (start === rangeStart && end === rangeEnd) {
        return value;
      }
    }

    // If still no match, return N/A
    return 'N/A';
  }

  return 'N/A';
}

// Main migration function
function migratePriceDisplay() {
  console.log('Reading data file...');
  const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
  
  // Extract the restaurants array from the TypeScript file
  // The file should have: export const restaurantData = [...]
  const arrayMatch = fileContent.match(/export const restaurantData = (\[[\s\S]*\]);/);
  if (!arrayMatch) {
    throw new Error('Could not find restaurantData array in data file');
  }

  const restaurantsJson = arrayMatch[1];
  const restaurants = eval(`(${restaurantsJson})`); // Safe here since we control the file

  console.log(`Found ${restaurants.length} restaurants`);
  
  let updatedCount = 0;
  let priceLevelCount = 0;
  let priceRangeCount = 0;
  let naCount = 0;
  const stats = {
    byPriceLevel: {},
    byCurrency: {},
    byDisplay: {}
  };

  for (let i = 0; i < restaurants.length; i++) {
    const restaurant = restaurants[i];
    let newPriceDisplay = 'N/A';

    // Priority 1: Calculate from priceRange (startPrice and/or endPrice)
    if (restaurant.google_data?.priceRange?.startPrice || restaurant.google_data?.priceRange?.endPrice) {
      newPriceDisplay = calculatePriceDisplayFromRange(restaurant.google_data.priceRange, restaurant.city);
      // Debug: Check OLIO E PIÙ specifically
      if (restaurant.google_place_id === 'ChIJ_RUJvZZZwokRNUEv3K4nSik') {
        console.log(`[DEBUG] OLIO E PIÙ: city=${restaurant.city}, newPriceDisplay=${newPriceDisplay}, current=${restaurant.price_display}`);
      }
      if (newPriceDisplay !== 'N/A') {
        priceRangeCount++;
        const currency = restaurant.google_data.priceRange.endPrice?.currencyCode || 
                        restaurant.google_data.priceRange.startPrice?.currencyCode || 
                        'UNKNOWN';
        stats.byCurrency[currency] = (stats.byCurrency[currency] || 0) + 1;
      }
    }
    // Priority 2: Use priceLevel as fallback if priceRange is not available
    else if (restaurant.google_data?.priceLevel) {
      newPriceDisplay = mapPriceLevelToDisplay(restaurant.google_data.priceLevel);
      priceLevelCount++;
      stats.byPriceLevel[restaurant.google_data.priceLevel] = (stats.byPriceLevel[restaurant.google_data.priceLevel] || 0) + 1;
    }
    // Priority 3: No price data available
    else {
      naCount++;
    }

    // Update the price_display field
    if (restaurant.price_display !== newPriceDisplay) {
      restaurant.price_display = newPriceDisplay;
      updatedCount++;
    }

    stats.byDisplay[newPriceDisplay] = (stats.byDisplay[newPriceDisplay] || 0) + 1;
  }

  // Reconstruct the file content
  const newRestaurantsJson = JSON.stringify(restaurants, null, 2);
  const newFileContent = fileContent.replace(
    /export const restaurantData = \[[\s\S]*\];/,
    `export const restaurantData = ${newRestaurantsJson};`
  );

  // Write back to file
  console.log('\nWriting updated data back to file...');
  fs.writeFileSync(DATA_FILE, newFileContent, 'utf-8');

  // Print statistics
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary:');
  console.log('='.repeat(60));
  console.log(`Total restaurants: ${restaurants.length}`);
  console.log(`Updated price_display: ${updatedCount}`);
  console.log(`\nSource breakdown:`);
  console.log(`  - From priceLevel: ${priceLevelCount}`);
  console.log(`  - From priceRange.endPrice: ${priceRangeCount}`);
  console.log(`  - Set to N/A (no data): ${naCount}`);
  
  console.log(`\nPrice level distribution:`);
  Object.entries(stats.byPriceLevel).forEach(([level, count]) => {
    console.log(`  - ${level}: ${count}`);
  });

  console.log(`\nCurrency distribution (from priceRange):`);
  Object.entries(stats.byCurrency).forEach(([currency, count]) => {
    console.log(`  - ${currency}: ${count}`);
  });

  console.log(`\nFinal price_display distribution:`);
  Object.entries(stats.byDisplay).forEach(([display, count]) => {
    console.log(`  - ${display}: ${count}`);
  });
  console.log('='.repeat(60) + '\n');
}

// Run migration
try {
  migratePriceDisplay();
  console.log('✅ Migration completed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}

