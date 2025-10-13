// test-filter-service.js
// Comprehensive test suite for the filter service

import { preFilterRestaurants } from './src/services/filterService.js';

console.log('🧪 FILTER SERVICE TEST SUITE\n');
console.log('='.repeat(70));

// Test cases organized by category
const testCases = [
  // === LOCATION TESTS ===
  {
    category: 'Location - Specific Neighborhoods',
    tests: [
      {
        query: 'restaurants in West Village',
        expectedNeighborhood: 'West Village',
        expectedCount: [5, 12],
        shouldInclude: ['Buvette', 'OLIO E PIU'], // Your picks
      },
      {
        query: 'cafe in Shibuya',
        expectedNeighborhood: 'Shibuya',
        expectedCount: [3, 12],
        shouldInclude: ['Chatei Hatou'], // Your pick
      },
      {
        query: 'dinner in Gangnam',
        expectedNeighborhood: 'Gangnam',
        expectedCount: [3, 12],
        shouldInclude: ['Katsu by Konban'], // Your pick
      },
      {
        query: 'brunch in Crown Heights',
        expectedNeighborhood: 'Crown Heights',
        expectedCount: [3, 12],
      },
    ]
  },

  // === CUISINE TESTS ===
  {
    category: 'Cuisine Type',
    tests: [
      {
        query: 'italian restaurant in NYC',
        expectedCuisine: 'italian',
        expectedCount: [5, 12],
        shouldInclude: ['OLIO E PIU'], // Your pick
      },
      {
        query: 'ramen in Tokyo',
        expectedCuisine: 'ramen',
        expectedCount: [3, 12],
        shouldInclude: ['Ramen Takahashi'], // Your pick
      },
      {
        query: 'french in Paris',
        expectedCuisine: 'french',
        expectedCount: [5, 12],
        shouldInclude: ['Le Coucou', 'Restaurant le Meurice'], // Your picks
      },
      {
        query: 'bakery in Brooklyn',
        expectedCuisine: 'bakery',
        expectedCount: [3, 12],
      },
    ]
  },

  // === PRICE TESTS ===
  {
    category: 'Price Level',
    tests: [
      {
        query: 'cheap eats in NYC',
        expectedPrice: '$',
        expectedCount: [5, 12],
        validatePrice: (results) => {
          const prices = results.map(r => r.price_display).filter(p => p);
          return prices.every(p => p === '$' || p === '$$');
        }
      },
      {
        query: 'expensive dinner in Manhattan',
        expectedPrice: '$$$',
        expectedCount: [5, 12],
        validatePrice: (results) => {
          const prices = results.map(r => r.price_display).filter(p => p);
          return prices.some(p => p === '$$$' || p === '$$$$');
        }
      },
      {
        query: 'fine dining in Paris',
        expectedPrice: '$$$$',
        expectedCount: [3, 12],
        shouldInclude: ['Restaurant le Meurice'], // Your expensive pick
      },
    ]
  },

  // === CYNTHIA'S PICKS TESTS ===
  {
    category: "Cynthia's Picks Boost",
    tests: [
      {
        query: 'brunch in NYC',
        expectedCount: [8, 12],
        validateBoost: (results) => {
          // Check if your picks appear in top 5
          const top5 = results.slice(0, 5);
          const picksInTop5 = top5.filter(r => r.cynthias_pick);
          console.log(`      → ${picksInTop5.length} of your picks in top 5`);
          return picksInTop5.length >= 2; // At least 2 picks should be boosted to top
        },
        shouldInclude: ['Buvette', 'Cafe Mogador', 'Le Coucou'],
      },
      {
        query: 'cafe in Tokyo',
        expectedCount: [5, 12],
        validateBoost: (results) => {
          const top3 = results.slice(0, 3);
          const picksInTop3 = top3.filter(r => r.cynthias_pick);
          console.log(`      → ${picksInTop3.length} of your picks in top 3`);
          return picksInTop3.length >= 1;
        },
        shouldInclude: ['Cafe Les Jeux Grenier', 'Chatei Hatou', 'Path'],
      },
    ]
  },

  // === COMBINED FILTERS TESTS ===
  {
    category: 'Combined Filters',
    tests: [
      {
        query: 'cheap ramen in Shibuya',
        expectedNeighborhood: 'Shibuya',
        expectedCuisine: 'ramen',
        expectedPrice: '$',
        expectedCount: [2, 12],
      },
      {
        query: 'expensive french in West Village',
        expectedNeighborhood: 'West Village',
        expectedCuisine: 'french',
        expectedPrice: '$$$',
        expectedCount: [2, 12],
      },
      {
        query: 'bakery with coffee in Brooklyn',
        expectedCount: [3, 12],
        validateAmenities: (results) => {
          return results.some(r => r.google_data.servesCoffee === true);
        }
      },
    ]
  },

  // === EDGE CASES ===
  {
    category: 'Edge Cases',
    tests: [
      {
        query: 'pizza',
        expectedCount: [0, 12],
        description: 'No location specified - should still return results'
      },
      {
        query: 'restaurant in Antarctica',
        expectedCount: [0, 0],
        description: 'Non-existent location - should return empty array'
      },
      {
        query: 'asdfghjkl',
        expectedCount: [0, 12],
        description: 'Gibberish query - should return something or empty'
      },
    ]
  },
];

// Run tests
let totalTests = 0;
let passedTests = 0;
let failedTests = [];

testCases.forEach(category => {
  console.log(`\n📋 ${category.category}`);
  console.log('-'.repeat(70));
  
  category.tests.forEach((test, idx) => {
    totalTests++;
    const testNum = `${category.category}.${idx + 1}`;
    
    console.log(`\n  Test: "${test.query}"`);
    if (test.description) {
      console.log(`        ${test.description}`);
    }
    
    try {
      const results = preFilterRestaurants(test.query);
      let passed = true;
      let failReasons = [];
      
      // Check result count
      const [minCount, maxCount] = test.expectedCount;
      if (results.length < minCount || results.length > maxCount) {
        passed = false;
        failReasons.push(`Expected ${minCount}-${maxCount} results, got ${results.length}`);
      }
      console.log(`    ✓ Returned ${results.length} restaurants`);
      
      // Check if specific restaurants are included
      if (test.shouldInclude) {
        test.shouldInclude.forEach(name => {
          const found = results.some(r => 
            r.google_data.displayName.text.includes(name)
          );
          if (!found) {
            passed = false;
            failReasons.push(`Expected to find "${name}"`);
          } else {
            console.log(`    ✓ Found: ${name}`);
          }
        });
      }
      
      // Custom price validation
      if (test.validatePrice) {
        if (!test.validatePrice(results)) {
          passed = false;
          failReasons.push('Price validation failed');
        } else {
          console.log(`    ✓ Price filter working correctly`);
        }
      }
      
      // Custom boost validation
      if (test.validateBoost) {
        if (!test.validateBoost(results)) {
          passed = false;
          failReasons.push('Boost validation failed');
        } else {
          console.log(`    ✓ Cynthia's picks boosted correctly`);
        }
      }
      
      // Custom amenities validation
      if (test.validateAmenities) {
        if (!test.validateAmenities(results)) {
          passed = false;
          failReasons.push('Amenities validation failed');
        } else {
          console.log(`    ✓ Amenities filter working`);
        }
      }
      
      // Show top 3 results
      if (results.length > 0) {
        console.log(`\n    Top 3 results:`);
        results.slice(0, 3).forEach((r, i) => {
          const pick = r.cynthias_pick ? '🏆' : '  ';
          const price = r.price_display || 'N/A';
          const rating = r.google_data.rating || 'N/A';
          console.log(`      ${i + 1}. ${pick} ${r.google_data.displayName.text} (${price}, ⭐${rating})`);
        });
      }
      
      if (passed) {
        passedTests++;
        console.log(`\n    ✅ PASSED`);
      } else {
        console.log(`\n    ❌ FAILED`);
        failReasons.forEach(reason => console.log(`       - ${reason}`));
        failedTests.push({ test: testNum, query: test.query, reasons: failReasons });
      }
      
    } catch (error) {
      console.log(`\n    ❌ ERROR: ${error.message}`);
      failedTests.push({ test: testNum, query: test.query, reasons: [error.message] });
    }
  });
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${totalTests - passedTests} ❌`);
console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (failedTests.length > 0) {
  console.log('\n❌ Failed Tests:');
  failedTests.forEach(fail => {
    console.log(`\n  ${fail.test}: "${fail.query}"`);
    fail.reasons.forEach(reason => console.log(`    - ${reason}`));
  });
}

console.log('\n' + '='.repeat(70));

// Exit with appropriate code
process.exit(failedTests.length > 0 ? 1 : 0);