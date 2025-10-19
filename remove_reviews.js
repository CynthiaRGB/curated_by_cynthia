const fs = require('fs');
const path = require('path');

// Read the JSON file
const data = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'api', 'data', '285_review_subtracted.json'),
    'utf-8'
  )
);

console.log(`Original data: ${data.length} restaurants`);

// Process each restaurant to remove reviews but keep reviewSummary
let processedCount = 0;
let reviewsRemoved = 0;

const processedData = data.map(restaurant => {
  const processed = { ...restaurant };
  
  // Check if restaurant has reviews
  if (processed.reviews && Array.isArray(processed.reviews)) {
    reviewsRemoved += processed.reviews.length;
    delete processed.reviews;
    processedCount++;
  }
  
  return processed;
});

console.log(`Processed ${processedCount} restaurants with reviews`);
console.log(`Total individual reviews removed: ${reviewsRemoved}`);

// Write the processed data back to the file
fs.writeFileSync(
  path.join(__dirname, 'api', 'data', '285_review_subtracted.json'),
  JSON.stringify(processedData, null, 2)
);

// Check file sizes
const originalSize = fs.statSync(path.join(__dirname, 'api', 'data', '285_restaurants_enriched.json')).size;
const newSize = fs.statSync(path.join(__dirname, 'api', 'data', '285_review_subtracted.json')).size;

console.log('✅ Successfully removed reviews while keeping reviewSummary');
console.log(`Original file: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`New file: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Size reduction: ${((originalSize - newSize) / 1024 / 1024).toFixed(2)} MB`);
