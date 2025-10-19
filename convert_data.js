const fs = require('fs');
const path = require('path');

// Read the JSON file
const data = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'api', 'data', '285_restaurants_enriched.json'),
    'utf-8'
  )
);

// Create TypeScript file content
const tsContent = `// Auto-generated from 285_restaurants_enriched.json
// Do not edit manually - regenerate by running: node convert-data.js

export const restaurantData = ${JSON.stringify(data, null, 2)};
`;

// Write the TypeScript file
fs.writeFileSync(
  path.join(__dirname, 'api', 'data', 'restaurantData.ts'),
  tsContent
);

const originalSize = fs.statSync(path.join(__dirname, 'api', 'data', '285_restaurants_enriched.json')).size;
const newSize = fs.statSync(path.join(__dirname, 'api', 'data', 'restaurantData.ts')).size;

console.log('✅ Created restaurantData.ts');
console.log(`Original JSON: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`New TypeScript: ${(newSize / 1024 / 1024).toFixed(2)} MB`);