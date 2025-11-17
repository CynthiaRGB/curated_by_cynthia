const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_PLACES_API_KEY || '';
const DATA_FILE = './api/data/final_data.ts';
const OUTPUT_DIR = './public/restaurant-photos';

// Specific restaurants to download photos for (by name or place_id)
const TARGET_RESTAURANTS = [
  'ChIJ5-ZTbqhZwokROw_GJzQx1dw', // Take 31
  'ChIJR_bK295bwokR8gM6QgEdmkY'  // Peter Luger Steak House
];

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Restaurant information (place IDs and names)
const RESTAURANT_INFO = {
  'ChIJ5-ZTbqhZwokROw_GJzQx1dw': 'Take 31',
  'ChIJR_bK295bwokR8gM6QgEdmkY': 'Peter Luger Steak House'
};

// Build target restaurants array from place IDs
const targetRestaurants = TARGET_RESTAURANTS.map(placeId => ({
  google_place_id: placeId,
  google_data: {
    displayName: { text: RESTAURANT_INFO[placeId] || 'Unknown' }
  }
}));

console.log(`Processing ${targetRestaurants.length} target restaurant(s):`);
targetRestaurants.forEach(r => {
  console.log(`  - ${r.google_data.displayName.text} (${r.google_place_id})`);
});

// Load existing photo mapping
const mappingPath = path.join(OUTPUT_DIR, 'photo-mapping.json');
let photoMapping = {};
if (fs.existsSync(mappingPath)) {
  try {
    photoMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    console.log(`\nLoaded existing photo mapping with ${Object.keys(photoMapping).length} restaurants`);
  } catch (e) {
    console.log('\nCould not load existing mapping, starting fresh');
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

// Function to get highest resolution photo URL (max 4000px)
function getPhotoUrl(photoName) {
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=4000&maxWidthPx=4000&key=${GOOGLE_API_KEY}`;
}

// Function to fetch photos metadata from Google Places API if missing
async function fetchPhotosMetadata(placeId) {
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    const fieldMask = 'photos';
    
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fieldMask
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const placeData = await response.json();
    return placeData.photos || [];
  } catch (error) {
    console.error(`   ✗ Error fetching photos metadata: ${error.message}`);
    return [];
  }
}

// Main download function
async function downloadPhotos() {
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  console.log('\n' + '='.repeat(60));
  console.log('Starting photo downloads...');
  console.log('='.repeat(60) + '\n');
  
  for (let i = 0; i < targetRestaurants.length; i++) {
    const restaurant = targetRestaurants[i];
    const placeId = restaurant.google_place_id;
    const restaurantName = restaurant.google_data?.displayName?.text || 'Unknown';
    
    // If no photos in metadata, try fetching from API
    let photos = restaurant.google_data?.photos || [];
    if (!photos || photos.length === 0) {
      console.log(`⚠️  [${i + 1}/${targetRestaurants.length}] ${restaurantName}: No photos in metadata, fetching from API...`);
      photos = await fetchPhotosMetadata(placeId);
      
      if (!photos || photos.length === 0) {
        console.log(`   ✗ No photos available for this restaurant\n`);
        continue;
      }
      
      console.log(`   ✓ Found ${photos.length} photo(s) from API\n`);
    }
    
    // Download first 3 photos (or all if less than 3)
    // Ensure photos have the 'name' field (they might be from API fetch)
    const validPhotos = photos.filter(p => p.name || p.photoUri || p.uri);
    const photosToDownload = validPhotos.slice(0, Math.min(3, validPhotos.length));
    const localPhotoPaths = [];
    
    console.log(`📥 [${i + 1}/${targetRestaurants.length}] ${restaurantName}`);
    console.log(`   Place ID: ${placeId}`);
    console.log(`   Downloading ${photosToDownload.length} photo(s) (max 4000px resolution)...\n`);
    
    for (let j = 0; j < photosToDownload.length; j++) {
      const photo = photosToDownload[j];
      
      // Get photo name - could be 'name', 'photoUri', or 'uri'
      const photoName = photo?.name || photo?.photoUri || photo?.uri;
      
      if (!photoName) {
        console.error(`   ✗ Photo ${j + 1}: No photo name/URI found`);
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
        // Extract photo name from URI if needed (format: places/ChIJ.../photos/AXxpX...)
        const photoNameForUrl = photoName.includes('/') ? photoName : `places/${placeId}/photos/${photoName}`;
        const photoUrl = getPhotoUrl(photoNameForUrl);
        
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
      console.log(`   → Saved ${localPhotoPaths.length} photo(s) for ${restaurantName}\n`);
    } else {
      console.log(`   → No photos saved for ${restaurantName}\n`);
    }
  }
  
  // Save the mapping file
  fs.writeFileSync(mappingPath, JSON.stringify(photoMapping, null, 2));
  console.log(`✅ Photo mapping saved to: ${mappingPath}`);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary:');
  console.log(`   Success: ${successCount} photos`);
  console.log(`   Skipped (already exists): ${skippedCount} photos`);
  console.log(`   Errors: ${errorCount} photos`);
  console.log(`   Total restaurants processed: ${targetRestaurants.length}`);
  console.log(`   Photos saved to: ${OUTPUT_DIR}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run the download
if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: Google Places API key not found!');
  console.error('   Set GOOGLE_PLACES_API_KEY or VITE_GOOGLE_PLACES_API_KEY environment variable');
  console.error('   Or add it to .env file');
  process.exit(1);
}

console.log('⚠️  WARNING: Downloading and hosting Google Places API photos may violate Google\'s Terms of Service.\n');

downloadPhotos().catch(console.error);

