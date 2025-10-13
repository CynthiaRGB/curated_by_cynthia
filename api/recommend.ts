// api/recommend.ts - Vercel serverless function with filtering service

import type { VercelRequest, VercelResponse } from '@vercel/node';

// We'll load the data dynamically to avoid bundling issues

// Simple filtering functions (copied from filterService.ts)
function extractKeywords(query: string) {
  const lowerQuery = query.toLowerCase();
  
  // Extract city
  let city = null;
  if (lowerQuery.includes('paris')) city = 'paris';
  else if (lowerQuery.includes('new york') || lowerQuery.includes('nyc')) city = 'nyc';
  else if (lowerQuery.includes('seoul')) city = 'seoul';
  else if (lowerQuery.includes('tokyo')) city = 'tokyo';
  else if (lowerQuery.includes('brooklyn')) city = 'nyc';
  
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

function matchesLocation(restaurant: any, keywords: any): boolean {
  if (!keywords.neighborhood && !keywords.borough && !keywords.city) {
    return true; // No location filter
  }

  // Check city match
  if (keywords.city) {
    const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
    
    switch (keywords.city) {
      case 'nyc':
        return address.includes('new york') || address.includes('nyc');
      case 'tokyo':
        return address.includes('tokyo') || address.includes('japan');
      case 'seoul':
        return address.includes('seoul') || address.includes('korea');
      case 'paris':
        return address.includes('paris') || address.includes('france');
      default:
        return true;
    }
  }

  return false;
}

function matchesCuisineType(restaurant: any, keywords: any): boolean {
  if (!keywords.cuisineType) {
    return true; // No cuisine filter
  }

  const cuisineType = keywords.cuisineType.toLowerCase();
  const restaurantTypes = [
    restaurant.google_data?.primaryType?.toLowerCase(),
    restaurant.specific_type?.toLowerCase(),
    ...(restaurant.google_data?.types || []).map((t: string) => t.toLowerCase())
  ].filter(Boolean);

  // Special handling for specific cuisine types
  if (cuisineType === 'coffee') {
    return restaurantTypes.some((type: string) => 
      type.includes('coffee') || type.includes('cafe')
    ) || restaurant.google_data?.servesCoffee;
  }

  if (cuisineType === 'romantic') {
    const romanticKeywords = ['romantic', 'intimate', 'cozy', 'fine dining', 'upscale'];
    return romanticKeywords.some(keyword => 
      restaurantTypes.some((type: string) => type.includes(keyword))
    );
  }

  return restaurantTypes.some((type: string) => type.includes(cuisineType));
}

function calculateQualityScore(restaurant: any): number {
  const rating = restaurant.google_data?.rating || 0;
  const reviewCount = restaurant.google_data?.userRatingCount || 0;
  const baseScore = rating * Math.log10(reviewCount + 1);
  const cynthiaMultiplier = restaurant.cynthias_pick ? 1.5 : 1.0;
  return baseScore * cynthiaMultiplier;
}

async function preFilterRestaurants(query: string) {
  // For now, use a simple hardcoded dataset to test the functionality
  // TODO: Load full dataset from file system
  const restaurants = [
    {
      google_data: {
        displayName: { text: "Don Angie" },
        rating: 4.5,
        userRatingCount: 1200,
        primaryType: "restaurant",
        types: ["restaurant", "italian"],
      },
      original_place: {
        properties: {
          location: {
            address: "103 Greenwich Ave, New York, NY 10014, USA",
          },
        },
      },
      neighborhood_extracted: "West Village",
      specific_type: "italian",
      cynthias_pick: true,
      price_display: "$$$",
    },
    {
      google_data: {
        displayName: { text: "L'Artusi" },
        rating: 4.4,
        userRatingCount: 800,
        primaryType: "restaurant",
        types: ["restaurant", "italian"],
      },
      original_place: {
        properties: {
          location: {
            address: "228 W 10th St, New York, NY 10014, USA",
          },
        },
      },
      neighborhood_extracted: "West Village",
      specific_type: "italian",
      cynthias_pick: true,
      price_display: "$$$",
    },
    {
      google_data: {
        displayName: { text: "Via Carota" },
        rating: 4.3,
        userRatingCount: 600,
        primaryType: "restaurant",
        types: ["restaurant", "italian"],
      },
      original_place: {
        properties: {
          location: {
            address: "51 Grove St, New York, NY 10014, USA",
          },
        },
      },
      neighborhood_extracted: "West Village",
      specific_type: "italian",
      cynthias_pick: false,
      price_display: "$$",
    }
  ];
  const keywords = extractKeywords(query);
  
  // Special case: "Cynthia's favorites"
  if (query.toLowerCase().includes("cynthia's favorites") || query.toLowerCase().includes("cynthias favorites")) {
    let cynthiasPicks = restaurants.filter(restaurant => restaurant.cynthias_pick === true);
    
    // Filter by city if specified
    if (keywords.city) {
      cynthiasPicks = cynthiasPicks.filter(restaurant => {
        const address = restaurant.original_place?.properties?.location?.address?.toLowerCase() || '';
        
        switch (keywords.city) {
          case 'nyc':
          case 'new york city':
            return address.includes('new york') || address.includes('nyc');
          case 'tokyo':
            return address.includes('tokyo') || address.includes('japan');
          case 'seoul':
            return address.includes('seoul') || address.includes('korea');
          case 'paris':
            return address.includes('paris') || address.includes('france');
          default:
            return true;
        }
      });
    }
    
    return cynthiasPicks.sort((a, b) => calculateQualityScore(b) - calculateQualityScore(a));
  }
  
  // Regular filtering
  const filteredRestaurants = restaurants.filter(restaurant => {
    return matchesLocation(restaurant, keywords) && matchesCuisineType(restaurant, keywords);
  });

  // Sort by quality score
  return filteredRestaurants.sort((a, b) => calculateQualityScore(b) - calculateQualityScore(a));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('Filtering restaurants for query:', query);
    
    // Use the filtering service
    const filteredRestaurants = await preFilterRestaurants(query);
    
    console.log(`Found ${filteredRestaurants.length} restaurants`);

    if (filteredRestaurants.length === 0) {
      return res.status(200).json({
        recommendations: [],
        summary: "I couldn't find any restaurants matching your criteria. Try broadening your search!",
        usedClaude: false,
      });
    }

    // Return top 10 results with simple formatting
    const topResults = filteredRestaurants.slice(0, 10).map(restaurant => ({
      restaurantName: restaurant.google_data?.displayName?.text || 'Unknown Restaurant',
      address: restaurant.original_place?.properties?.location?.address || 'Address not available',
      neighborhood: restaurant.neighborhood_extracted || '',
      rating: restaurant.google_data?.rating || 0,
      reviewCount: restaurant.google_data?.userRatingCount || 0,
      priceRange: restaurant.price_display || 'N/A',
      cuisineType: restaurant.specific_type || '',
      cynthiasPick: restaurant.cynthias_pick || false,
      reason: `Highly rated ${restaurant.specific_type || 'restaurant'} in ${restaurant.neighborhood_extracted || 'this area'}`,
      highlights: [
        `${restaurant.google_data?.rating || 0}⭐ (${restaurant.google_data?.userRatingCount || 0} reviews)`,
        restaurant.specific_type || 'Restaurant',
        restaurant.price_display || 'Price varies'
      ],
      matchScore: Math.round(calculateQualityScore(restaurant)),
    }));

    return res.status(200).json({
      recommendations: topResults,
      summary: `Found ${topResults.length} great restaurants for you!`,
      usedClaude: false,
    });

  } catch (error: any) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}