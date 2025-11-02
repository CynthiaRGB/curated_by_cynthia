const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const DATA_FILE = './api/data/additional_restaurants_google_api.ts';
const OUTPUT_DIR = './public/restaurant-photos';
const RESTAURANT_NAME = 'Best Bagel & Coffee';

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: GOOGLE_PLACES_API_KEY environment variable is not set!');
  console.error('   Set it by running: export GOOGLE_PLACES_API_KEY="your-api-key"');
  process.exit(1);
}

// Read and parse the data file
console.log('Reading data file...');
const dataContent = fs.readFileSync(DATA_FILE, 'utf-8');

// Extract the restaurant data array
let restaurants;
try {
  // Find array boundaries
  const startIdx = dataContent.indexOf('export const restaurantData = [');
  let arrayStartIdx = dataContent.indexOf('[', startIdx);
  
  // Count brackets to find matching closing bracket
  let bracketCount = 0;
  let arrayEndIdx = arrayStartIdx;
  for (let i = arrayStartIdx; i < dataContent.length; i++) {
    if (dataContent[i] === '[') bracketCount++;
    else if (dataContent[i] === ']') {
      bracketCount--;
      if (bracketCount === 0) {
        arrayEndIdx = i + 1;
        break;
      }
    }
  }
  
  const arrayStr = dataContent.substring(arrayStartIdx, arrayEndIdx);
  restaurants = JSON.parse(arrayStr);
} catch (e) {
  console.error('Error parsing restaurant data:', e.message);
  process.exit(1);
}

// Find the target restaurant
const restaurant = restaurants.find(r => {
  const name = r.google_data?.displayName?.text || '';
  return name === RESTAURANT_NAME;
});

if (!restaurant) {
  console.error(`❌ Restaurant "${RESTAURANT_NAME}" not found!`);
  process.exit(1);
}

const placeId = restaurant.google_place_id;
const restaurantName = restaurant.google_data?.displayName?.text || 'Unknown';
const photos = restaurant.google_data?.photos || [];

if (!photos || photos.length === 0) {
  console.error(`❌ No photos found for ${restaurantName}`);
  process.exit(1);
}

console.log(`✓ Found restaurant: ${restaurantName}`);
console.log(`✓ Place ID: ${placeId}`);
console.log(`✓ Total photos available: ${photos.length}\n`);

// Load existing photo mapping
const mappingPath = path.join(OUTPUT_DIR, 'photo-mapping.json');
let photoMapping = {};
if (fs.existsSync(mappingPath)) {
  try {
    photoMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    console.log(`✓ Loaded existing photo mapping\n`);
  } catch (e) {
    console.log('Starting fresh photo mapping\n');
  }
}

// Function to download an image
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(filepath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        downloadImage(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
      } else {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

// Function to sanitize filename
function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

// Function to get highest resolution photo URL (max 4000px for highest quality)
function getPhotoUrl(photoName) {
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=4000&maxWidthPx=4000&key=${GOOGLE_API_KEY}`;
}

// Main download function
async function downloadPhotos() {
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  console.log('='.repeat(60));
  console.log('Downloading photos for Best Bagel & Coffee');
  console.log('='.repeat(60) + '\n');
  
  // Download first 3 photos (or all if less than 3)
  const photosToDownload = photos.slice(0, Math.min(3, photos.length));
  const localPhotoPaths = [];
  
  console.log(`📥 Downloading ${photosToDownload.length} photo(s) at highest resolution (max 4000px)...\n`);
  
  for (let j = 0; j < photosToDownload.length; j++) {
    const photo = photosToDownload[j];
    
    if (!photo?.name) {
      console.error(`   ✗ Photo ${j + 1}: No photo name found`);
      errorCount++;
      continue;
    }
    
    // Create filename: place_id_photo_index.jpg
    const filename = `${sanitizeFilename(placeId)}_${j + 1}.jpg`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 0) {
        console.log(`   ✓ Photo ${j + 1}/${photosToDownload.length}: Already exists - ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
        localPhotoPaths.push(`/restaurant-photos/${filename}`);
        skippedCount++;
        continue;
      }
    }
    
    try {
      const photoUrl = getPhotoUrl(photo.name);
      
      process.stdout.write(`   ⬇️  Photo ${j + 1}/${photosToDownload.length}: Downloading... `);
      await downloadImage(photoUrl, filepath);
      
      // Verify file was created and has content
      const stats = fs.statSync(filepath);
      if (stats.size > 0) {
        console.log(`✓ ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
        localPhotoPaths.push(`/restaurant-photos/${filename}`);
        successCount++;
      } else {
        console.log(`✗ File is empty`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        errorCount++;
      }
      
      // Rate limiting: wait 200ms between requests to avoid hitting rate limits
      if (j < photosToDownload.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
    } catch (error) {
      console.log(`✗ ${error.message}`);
      errorCount++;
    }
  }
  
  // Store mapping
  if (localPhotoPaths.length > 0) {
    photoMapping[placeId] = localPhotoPaths;
    fs.writeFileSync(mappingPath, JSON.stringify(photoMapping, null, 2));
    console.log(`\n✓ Photo mapping updated: ${mappingPath}`);
    console.log(`   → Saved ${localPhotoPaths.length} photo(s) for ${restaurantName}\n`);
  } else {
    console.log(`\n⚠️  No photos saved for ${restaurantName}\n`);
  }
  
  console.log('='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Success: ${successCount} photos`);
  console.log(`   Skipped (already exists): ${skippedCount} photos`);
  console.log(`   Errors: ${errorCount} photos`);
  console.log(`   Photos saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60) + '\n');
}

// Run the download
console.log('⚠️  WARNING: Downloading and hosting Google Places API photos may violate Google\'s Terms of Service.\n');

downloadPhotos().catch(console.error);

