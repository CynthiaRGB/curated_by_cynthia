const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const DATA_FILE = './api/data/276_reduced.ts';
const OUTPUT_DIR = './public/restaurant-photos';

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read and parse the data file
console.log('Reading data file...');
const dataContent = fs.readFileSync(DATA_FILE, 'utf-8');

// Extract the restaurant data array
const match = dataContent.match(/export const restaurantData = (\[[\s\S]*\]);/);
if (!match) {
  throw new Error('Could not find restaurantData export in file');
}

let restaurants;
try {
  const jsonStr = match[1];
  restaurants = eval(`(${jsonStr})`);
} catch (e) {
  console.error('Error parsing restaurant data:', e);
  process.exit(1);
}

console.log(`Found ${restaurants.length} restaurants`);
console.log(`GOOGLE_API_KEY is ${GOOGLE_API_KEY ? 'SET' : 'NOT SET'}\n`);

// Find restaurants with photos
const restaurantsWithPhotos = restaurants.filter(
  r => r.google_data?.photos && Array.isArray(r.google_data.photos) && r.google_data.photos.length > 0
);

console.log(`Found ${restaurantsWithPhotos.length} restaurants with photos\n`);

// Mapping file to store place_id -> local image paths
const photoMapping = {};

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
        fs.unlinkSync(filepath);
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

// Function to get highest resolution photo URL
function getPhotoUrl(photoName) {
  // Request highest resolution (up to 4000px)
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=4000&maxWidthPx=4000&key=${GOOGLE_API_KEY}`;
}

// Main download function
async function downloadAllPhotos() {
  let totalPhotos = 0;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  // Count total photos to download
  restaurantsWithPhotos.forEach(r => {
    const photoCount = Math.min(3, r.google_data.photos.length); // First 3 photos
    totalPhotos += photoCount;
  });
  
  console.log(`Will download up to ${totalPhotos} photos (first 3 per restaurant)\n`);
  
  let currentPhotoIndex = 0;
  
  for (let i = 0; i < restaurantsWithPhotos.length; i++) {
    const restaurant = restaurantsWithPhotos[i];
    const placeId = restaurant.google_place_id;
    const restaurantName = restaurant.google_data?.displayName?.text || 'Unknown';
    const photos = restaurant.google_data.photos;
    
    // Download first 3 photos (or all if less than 3)
    const photosToDownload = photos.slice(0, Math.min(3, photos.length));
    const localPhotoPaths = [];
    
    console.log(`📥 [${i + 1}/${restaurantsWithPhotos.length}] ${restaurantName}: Downloading ${photosToDownload.length} photo(s)...`);
    
    for (let j = 0; j < photosToDownload.length; j++) {
      const photo = photosToDownload[j];
      currentPhotoIndex++;
      
      if (!photo?.name) {
        console.error(`  ✗ Photo ${j + 1}: No photo name found`);
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
          console.log(`  ✓ Photo ${j + 1}/${photosToDownload.length}: Already exists (${(stats.size / 1024).toFixed(1)} KB)`);
          localPhotoPaths.push(`/restaurant-photos/${filename}`);
          successCount++;
          continue;
        }
      }
      
      try {
        const photoUrl = getPhotoUrl(photo.name);
        
        await downloadImage(photoUrl, filepath);
        
        // Verify file was created and has content
        const stats = fs.statSync(filepath);
        if (stats.size > 0) {
          console.log(`  ✓ Photo ${j + 1}/${photosToDownload.length}: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
          localPhotoPaths.push(`/restaurant-photos/${filename}`);
          successCount++;
        } else {
          console.error(`  ✗ Photo ${j + 1}/${photosToDownload.length}: File is empty`);
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
          errorCount++;
        }
        
        // Rate limiting: wait 200ms between requests to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  ✗ Photo ${j + 1}/${photosToDownload.length}: ${error.message}`);
        errorCount++;
      }
    }
    
    // Store mapping
    if (localPhotoPaths.length > 0) {
      photoMapping[placeId] = localPhotoPaths;
    }
    
    console.log(`  → Saved ${localPhotoPaths.length} photo(s) for ${restaurantName}\n`);
  }
  
  // Save the mapping file
  const mappingPath = path.join(OUTPUT_DIR, 'photo-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(photoMapping, null, 2));
  console.log(`✅ Mapping saved to: ${mappingPath}`);
  
  console.log(`\n📊 Summary:`);
  console.log(`   Success: ${successCount} photos`);
  console.log(`   Errors: ${errorCount} photos`);
  console.log(`   Total restaurants processed: ${restaurantsWithPhotos.length}`);
  console.log(`   Photos saved to: ${OUTPUT_DIR}`);
  console.log(`\n⚠️  Note: These photos are served from Vercel's CDN at /restaurant-photos/`);
}

// Run the download
if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: GOOGLE_PLACES_API_KEY environment variable is not set!');
  console.error('   Set it by running: export GOOGLE_PLACES_API_KEY="your-api-key"');
  process.exit(1);
}

console.log('⚠️  WARNING: Downloading and hosting Google Places API photos may violate Google\'s Terms of Service.\n');

downloadAllPhotos().catch(console.error);

