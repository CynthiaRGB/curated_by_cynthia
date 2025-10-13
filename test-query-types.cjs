// Test query type detection
const fs = require('fs');

// Load the data
const data = JSON.parse(fs.readFileSync('src/data/285_restaurants_reduced_metadata.json', 'utf8'));
const restaurants = data.places || [];

// Test the isComplexQuery function logic
function extractKeywords(query) {
  const lowerQuery = query.toLowerCase();
  
  // Extract city
  let city = null;
  if (lowerQuery.includes('paris')) city = 'paris';
  else if (lowerQuery.includes('new york') || lowerQuery.includes('nyc')) city = 'nyc';
  else if (lowerQuery.includes('seoul')) city = 'seoul';
  else if (lowerQuery.includes('tokyo')) city = 'tokyo';
  else if (lowerQuery.includes('brooklyn')) city = 'nyc'; // Brooklyn is part of NYC
  
  // Extract neighborhood
  let neighborhood = null;
  const neighborhoodMatch = lowerQuery.match(/(?:in|at|near)\s+([^,\s]+)/);
  if (neighborhoodMatch) {
    neighborhood = neighborhoodMatch[1];
  }
  
  // Extract cuisine type
  let cuisineType = null;
  const cuisineKeywords = ['coffee', 'pizza', 'sushi', 'italian', 'french', 'korean', 'japanese', 'mexican', 'thai', 'chinese', 'indian', 'brunch', 'breakfast', 'lunch', 'dinner', 'dessert', 'bakery', 'cafe', 'bar', 'wine', 'cocktail', 'seafood', 'steak', 'vegetarian', 'vegan', 'fast food', 'fine dining', 'casual', 'romantic', 'family', 'outdoor', 'rooftop', 'galettes', 'crepes'];
  
  for (const keyword of cuisineKeywords) {
    if (lowerQuery.includes(keyword)) {
      cuisineType = keyword;
      break;
    }
  }
  
  return { city, neighborhood, cuisineType };
}

function isComplexQuery(query, keywords) {
  const lowerQuery = query.toLowerCase();
  
  // Complex query indicators
  const complexIndicators = [
    'romantic', 'anniversary', 'date', 'special occasion', 'celebration',
    'birthday', 'proposal', 'intimate', 'cozy', 'atmospheric',
    'best', 'recommend', 'suggest', 'favorite', 'top', 'must try',
    'hidden gem', 'local favorite', 'insider', 'secret',
    'budget', 'cheap', 'expensive', 'affordable', 'splurge',
    'family', 'kids', 'child', 'group', 'large party',
    'outdoor', 'patio', 'rooftop', 'garden', 'terrace',
    'quick', 'fast', 'slow', 'leisurely', 'rushed',
    'healthy', 'light', 'heavy', 'comfort food',
    'trendy', 'hip', 'cool', 'popular', 'buzz',
    'quiet', 'loud', 'noisy', 'peaceful'
  ];
  
  // Check for complex indicators
  for (const indicator of complexIndicators) {
    if (lowerQuery.includes(indicator)) {
      return true;
    }
  }
  
  // Check for multiple criteria (cuisine + location + other)
  const criteriaCount = [
    keywords.cuisineType,
    keywords.city,
    keywords.neighborhood
  ].filter(Boolean).length;
  
  // If more than 2 criteria, it's complex
  if (criteriaCount >= 2) {
    return true;
  }
  
  // Check for subjective language
  const subjectiveWords = ['good', 'great', 'amazing', 'delicious', 'wonderful', 'perfect', 'excellent'];
  for (const word of subjectiveWords) {
    if (lowerQuery.includes(word)) {
      return true;
    }
  }
  
  return false;
}

// Test queries
const testQueries = [
  'coffee shops in Brooklyn',
  'romantic Italian for anniversary',
  'restaurants in Paris',
  'best sushi in Tokyo',
  'Cynthia\'s favorites in New York City'
];

console.log('Testing query complexity detection...\n');

testQueries.forEach(query => {
  console.log(`=== Testing: "${query}" ===`);
  
  const keywords = extractKeywords(query);
  const isComplex = isComplexQuery(query, keywords);
  
  console.log('Keywords:', keywords);
  console.log('Is complex:', isComplex);
  console.log('Expected behavior:', isComplex ? '🤖 Claude-powered' : '⚡ Instant filtering');
  console.log('');
});
