// fix-neighborhoods.js
// Add proper neighborhood names based on ZIP codes and coordinates

const fs = require('fs');
const path = require('path');

// NYC ZIP code to neighborhood mapping
const NYC_ZIP_TO_NEIGHBORHOOD = {
  // Manhattan - Downtown
  '10002': 'Lower East Side',
  '10003': 'East Village',
  '10009': 'East Village',
  '10012': 'SoHo',
  '10013': 'Tribeca',
  '10014': 'West Village',
  '10011': 'Greenwich Village',
  '10010': 'Gramercy',
  '10016': 'Murray Hill',
  '10017': 'Midtown East',
  
  // Manhattan - Midtown
  '10018': 'Midtown',
  '10019': 'Midtown West',
  '10020': 'Midtown',
  '10021': 'Upper East Side',
  '10022': 'Midtown East',
  '10023': 'Upper West Side',
  '10024': 'Upper West Side',
  '10025': 'Upper West Side',
  
  // Manhattan - Uptown
  '10026': 'Harlem',
  '10027': 'Harlem',
  '10028': 'Upper East Side',
  '10029': 'East Harlem',
  '10030': 'Harlem',
  '10031': 'Hamilton Heights',
  '10032': 'Washington Heights',
  '10033': 'Washington Heights',
  '10034': 'Inwood',
  '10035': 'East Harlem',
  
  // Brooklyn
  '11201': 'Brooklyn Heights',
  '11205': 'Fort Greene',
  '11206': 'Williamsburg',
  '11211': 'Williamsburg',
  '11215': 'Park Slope',
  '11217': 'Park Slope',
  '11222': 'Greenpoint',
  '11225': 'Crown Heights',
  '11226': 'Flatbush',
  '11238': 'Prospect Heights',
  '11249': 'Williamsburg',
  
  // Queens
  '11101': 'Long Island City',
  '11102': 'Astoria',
  '11103': 'Astoria',
  '11104': 'Sunnyside',
  '11106': 'Astoria',
  '11354': 'Flushing',
  '11355': 'Flushing',
  '11368': 'Corona',
  '11372': 'Jackson Heights',
  '11373': 'Elmhurst',
  '11374': 'Rego Park',
  '11375': 'Forest Hills',
};

// Tokyo neighborhood patterns (from addressComponents)
const TOKYO_NEIGHBORHOODS = {
  'Shibuya': 'Shibuya',
  'Shinjuku': 'Shinjuku',
  'Minato': 'Minato', // Roppongi, Aoyama area
  'Chuo': 'Ginza', // Ginza is in Chuo ward
  'Setagaya': 'Setagaya',
  'Meguro': 'Meguro',
  'Koto': 'Koto',
  'Chiyoda': 'Chiyoda',
};

// Paris arrondissement to neighborhood
const PARIS_ARRONDISSEMENTS = {
  '75001': '1st Arrondissement',
  '75002': '2nd Arrondissement',
  '75003': '3rd Arrondissement',
  '75004': '4th Arrondissement',
  '75005': '5th Arrondissement',
  '75006': '6th Arrondissement',
  '75007': '7th Arrondissement',
  '75008': '8th Arrondissement',
  '75009': '9th Arrondissement',
  '75010': '10th Arrondissement',
  '75011': '11th Arrondissement',
  '75012': '12th Arrondissement',
  '75013': '13th Arrondissement',
  '75014': '14th Arrondissement',
  '75015': '15th Arrondissement',
  '75016': '16th Arrondissement',
  '75017': '17th Arrondissement',
  '75018': '18th Arrondissement',
  '75019': '19th Arrondissement',
  '75020': '20th Arrondissement',
};

// Seoul district patterns
const SEOUL_DISTRICTS = {
  'Gangnam': 'Gangnam',
  'Jongno': 'Jongno',
  'Jung': 'Jung',
  'Songpa': 'Songpa',
  'Mapo': 'Mapo',
  'Yongsan': 'Yongsan',
  'Seongdong': 'Seongdong',
  'Gwangjin': 'Gwangjin',
};

// Read the restaurants JSON file
const restaurantsPath = path.join(__dirname, 'src', 'data', 'restaurants.json');
console.log('Reading restaurants data from:', restaurantsPath);

let restaurants;
try {
  const fileContent = fs.readFileSync(restaurantsPath, 'utf8');
  restaurants = JSON.parse(fileContent);
  console.log(`✓ Loaded ${restaurants.length} restaurants\n`);
} catch (error) {
  console.error('Error reading restaurants.json:', error.message);
  process.exit(1);
}

// Function to extract neighborhood based on city
function extractNeighborhood(restaurant) {
  const address = restaurant.original_place?.properties?.location?.address || '';
  const addressComponents = restaurant.google_data?.addressComponents || [];
  const zip = getZipCode(restaurant);
  
  // Detect city
  if (address.includes('New York') || address.includes('Brooklyn') || address.includes('Queens')) {
    // NYC - use ZIP code
    return NYC_ZIP_TO_NEIGHBORHOOD[zip] || null;
  } 
  else if (address.includes('Tokyo') || address.includes('Japan')) {
    // Tokyo - extract ward/district from address
    for (const [ward, neighborhood] of Object.entries(TOKYO_NEIGHBORHOODS)) {
      if (address.includes(ward)) {
        return neighborhood;
      }
    }
    // Fallback: check addressComponents for locality
    const locality = addressComponents.find(c => c.types.includes('locality'));
    if (locality) {
      const localityText = locality.longText;
      for (const ward of Object.keys(TOKYO_NEIGHBORHOODS)) {
        if (localityText.includes(ward)) {
          return TOKYO_NEIGHBORHOODS[ward];
        }
      }
    }
    return null;
  }
  else if (address.includes('Paris') || address.includes('France')) {
    // Paris - use postal code for arrondissement
    if (zip && PARIS_ARRONDISSEMENTS[zip]) {
      return PARIS_ARRONDISSEMENTS[zip];
    }
    // Also check address for arrondissement number
    const arrondMatch = address.match(/750(\d{2})/);
    if (arrondMatch) {
      return PARIS_ARRONDISSEMENTS[arrondMatch[0]];
    }
    return null;
  }
  else if (address.includes('Seoul') || address.includes('South Korea')) {
    // Seoul - extract district from address
    for (const [district, name] of Object.entries(SEOUL_DISTRICTS)) {
      if (address.includes(district)) {
        return name;
      }
    }
    // Check addressComponents
    const locality = addressComponents.find(c => 
      c.types.includes('sublocality_level_1') || c.types.includes('locality')
    );
    if (locality) {
      for (const district of Object.keys(SEOUL_DISTRICTS)) {
        if (locality.longText.includes(district)) {
          return SEOUL_DISTRICTS[district];
        }
      }
    }
    return null;
  }
  
  return null;
}

// Function to extract ZIP code from restaurant data
function getZipCode(restaurant) {
  const addressComponents = restaurant.google_data?.addressComponents || [];
  const zipComponent = addressComponents.find(c => c.types.includes('postal_code'));
  return zipComponent?.shortText || null;
}

// Function to extract neighborhood based on city
function extractNeighborhood(restaurant) {
  const address = restaurant.original_place?.properties?.location?.address || '';
  const addressComponents = restaurant.google_data?.addressComponents || [];
  const zip = getZipCode(restaurant);
  
  // Detect city
  if (address.includes('New York') || address.includes('Brooklyn') || address.includes('Queens')) {
    // NYC - use ZIP code
    return NYC_ZIP_TO_NEIGHBORHOOD[zip] || null;
  } 
  else if (address.includes('Tokyo') || address.includes('Japan')) {
    // Tokyo - extract ward/district from address
    for (const [ward, neighborhood] of Object.entries(TOKYO_NEIGHBORHOODS)) {
      if (address.includes(ward)) {
        return neighborhood;
      }
    }
    // Fallback: check addressComponents for locality
    const locality = addressComponents.find(c => c.types.includes('locality'));
    if (locality) {
      const localityText = locality.longText;
      for (const ward of Object.keys(TOKYO_NEIGHBORHOODS)) {
        if (localityText.includes(ward)) {
          return TOKYO_NEIGHBORHOODS[ward];
        }
      }
    }
    return null;
  }
  else if (address.includes('Paris') || address.includes('France')) {
    // Paris - use postal code for arrondissement
    if (zip && PARIS_ARRONDISSEMENTS[zip]) {
      return PARIS_ARRONDISSEMENTS[zip];
    }
    // Also check address for arrondissement number
    const arrondMatch = address.match(/750(\d{2})/);
    if (arrondMatch) {
      return PARIS_ARRONDISSEMENTS[arrondMatch[0]];
    }
    return null;
  }
  else if (address.includes('Seoul') || address.includes('South Korea')) {
    // Seoul - extract district from address
    for (const [district, name] of Object.entries(SEOUL_DISTRICTS)) {
      if (address.includes(district)) {
        return name;
      }
    }
    // Check addressComponents
    const locality = addressComponents.find(c => 
      c.types.includes('sublocality_level_1') || c.types.includes('locality')
    );
    if (locality) {
      for (const district of Object.keys(SEOUL_DISTRICTS)) {
        if (locality.longText.includes(district)) {
          return SEOUL_DISTRICTS[district];
        }
      }
    }
    return null;
  }
  
  return null;
}

// Update neighborhoods based on ZIP codes and city detection
let updated = 0;
let notUpdated = 0;

restaurants = restaurants.map(restaurant => {
  const newNeighborhood = extractNeighborhood(restaurant);
  const currentNeighborhood = restaurant.neighborhood_extracted;
  
  // Only update if we found a neighborhood and current value is too broad or null
  const broadLocations = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Tokyo', 'Paris', 'Seoul', null, ''];
  
  if (newNeighborhood && broadLocations.includes(currentNeighborhood)) {
    updated++;
    console.log(`✓ ${restaurant.google_data.displayName.text}`);
    console.log(`  ${currentNeighborhood || 'null'} → ${newNeighborhood}`);
    
    return {
      ...restaurant,
      neighborhood_extracted: newNeighborhood
    };
  } else {
    notUpdated++;
    return restaurant;
  }
});

// Report results
console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log(`  Total restaurants: ${restaurants.length}`);
console.log(`  Neighborhoods updated: ${updated}`);
console.log(`  Not updated (already specific or no mapping): ${notUpdated}`);

// Breakdown by city and neighborhood
const cityCounts = {
  NYC: 0,
  Tokyo: 0,
  Paris: 0,
  Seoul: 0,
  Other: 0
};

const neighborhoodCounts = {};
restaurants.forEach(r => {
  const address = r.original_place?.properties?.location?.address || '';
  if (address.includes('New York') || address.includes('Brooklyn') || address.includes('Queens')) {
    cityCounts.NYC++;
  } else if (address.includes('Tokyo')) {
    cityCounts.Tokyo++;
  } else if (address.includes('Paris')) {
    cityCounts.Paris++;
  } else if (address.includes('Seoul')) {
    cityCounts.Seoul++;
  } else {
    cityCounts.Other++;
  }
  
  const n = r.neighborhood_extracted || 'Unknown';
  neighborhoodCounts[n] = (neighborhoodCounts[n] || 0) + 1;
});

console.log('\nRestaurants by city:');
Object.entries(cityCounts).forEach(([city, count]) => {
  console.log(`  ${city}: ${count}`);
});

console.log('\nTop neighborhoods:');
Object.entries(neighborhoodCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([neighborhood, count]) => {
    console.log(`  ${neighborhood}: ${count}`);
  });

// Create backup
const backupPath = restaurantsPath.replace('.json', '.backup.json');
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, JSON.stringify(JSON.parse(fs.readFileSync(restaurantsPath, 'utf8')), null, 2));
  console.log(`\n✓ Backup created: ${backupPath}`);
}

// Write updated data
fs.writeFileSync(restaurantsPath, JSON.stringify(restaurants, null, 2));
console.log(`✓ Updated data written to: ${restaurantsPath}`);

console.log('\n' + '='.repeat(60));
console.log('✨ Done! Neighborhoods updated for all 4 cities');
console.log('\nNeighborhood extraction logic:');
console.log('  NYC: ZIP code → specific neighborhood');
console.log('  Tokyo: Ward/district from address');
console.log('  Paris: Postal code → arrondissement');
console.log('  Seoul: District from address');
console.log('='.repeat(60));
