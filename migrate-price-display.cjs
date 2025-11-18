const fs = require('fs');
const path = require('path');

const DATA_FILE = './api/data/final_data.ts';

// City-specific price thresholds (using endPrice)
const PRICE_THRESHOLDS = {
  USD: {
    budget: 15,
    moderate: 35,
    upscale: 75,
    // luxury: > 75
  },
  JPY: {
    budget: 1500,
    moderate: 4000,
    upscale: 12000,
    // luxury: > 12000
  },
  EUR: {
    budget: 20,
    moderate: 50,
    upscale: 120,
    // luxury: > 120
  },
  KRW: {
    budget: 20000,
    moderate: 50000,
    upscale: 120000,
    // luxury: > 120000
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

// Calculate price_display from priceRange.endPrice
function calculatePriceDisplayFromRange(priceRange, city) {
  if (!priceRange || !priceRange.endPrice) {
    return 'N/A';
  }

  const currencyCode = priceRange.endPrice.currencyCode;
  const units = parseInt(priceRange.endPrice.units || '0', 10);

  if (!units || units <= 0) {
    return 'N/A';
  }

  const thresholds = PRICE_THRESHOLDS[currencyCode];
  if (!thresholds) {
    // Unknown currency, return N/A
    return 'N/A';
  }

  // Check if units is in normalized scale (1-4) vs actual currency amount
  // If units <= 4, it's likely normalized, so map directly
  if (units <= 4) {
    const normalizedMap = {
      1: '$',
      2: '$$',
      3: '$$$',
      4: '$$$$'
    };
    return normalizedMap[units] || 'N/A';
  }

  // Use actual currency thresholds
  if (units < thresholds.budget) {
    return '$';
  } else if (units < thresholds.moderate) {
    return '$$';
  } else if (units < thresholds.upscale) {
    return '$$$';
  } else {
    return '$$$$';
  }
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

    // Priority 1: Use priceLevel if available
    if (restaurant.google_data?.priceLevel) {
      newPriceDisplay = mapPriceLevelToDisplay(restaurant.google_data.priceLevel);
      priceLevelCount++;
      stats.byPriceLevel[restaurant.google_data.priceLevel] = (stats.byPriceLevel[restaurant.google_data.priceLevel] || 0) + 1;
    }
    // Priority 2: Calculate from priceRange.endPrice
    else if (restaurant.google_data?.priceRange?.endPrice) {
      newPriceDisplay = calculatePriceDisplayFromRange(restaurant.google_data.priceRange, restaurant.city);
      priceRangeCount++;
      const currency = restaurant.google_data.priceRange.endPrice.currencyCode || 'UNKNOWN';
      stats.byCurrency[currency] = (stats.byCurrency[currency] || 0) + 1;
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

