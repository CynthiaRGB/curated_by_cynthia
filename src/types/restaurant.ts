// src/types/restaurant.ts
// TypeScript types for restaurant data with enriched tags

export interface Restaurant {
  // Original place data
  original_place: {
    geometry: {
      coordinates: [number, number];
      type: string;
    };
    properties: {
      location: {
        address: string;
        country_code: string;
      };
    };
  };

  // Google Place data
  google_place_id: string;
  google_data: {
    displayName: {
      text: string;
    };
    primaryType?: string;
    types?: string[];
    rating?: number;
    userRatingCount?: number;
    priceRange?: {
      startPrice: { units: string };
      endPrice: { units: string };
    };
    regularOpeningHours?: {
      periods: Array<{
        open: { day: number; hour: number; minute: number };
        close: { day: number; hour: number; minute: number };
      }>;
      weekdayDescriptions: string[];
    };
    formattedAddress?: string;
    addressComponents?: Array<{
      longText: string;
      shortText: string;
      types: string[];
    }>;
    takeout?: boolean;
    delivery?: boolean;
    dineIn?: boolean;
    servesCoffee?: boolean;
    servesBrunch?: boolean;
    servesBreakfast?: boolean;
    servesLunch?: boolean;
    servesDinner?: boolean;
    servesBeer?: boolean;
    servesWine?: boolean;
    servesCocktails?: boolean;
    servesDessert?: boolean;
    servesVegetarianFood?: boolean;
    editorialSummary?: {
      text: string;
    };
    generativeSummary?: {
      overview: {
        text: string;
      };
    };
    reviewSummary?: {
      text: {
        text: string;
      };
    };
    reviews?: Array<{
      rating: number;
      text: {
        text: string;
      };
    }>;
  };

  // Extracted metadata
  place_classification: string;
  specific_type?: string;
  neighborhood_extracted?: string;
  price_display?: string;
  city?: string;
  cynthias_pick?: boolean;

  // ENRICHED TAGS (NEW)
  vibe_tags?: string[];
  occasion_tags?: string[];
  crowd_tags?: string[];
  service_tags?: string[];
  noise_level?: string;
  food_quality_tags?: string[];
  value_tag?: string;
  special_features?: string[];
  booking_tags?: string[];
  negative_tags?: string[];
  accolades_tags?: string[];
}

export interface ExtractedKeywords {
  // Location
  neighborhood?: string;
  borough?: string;
  city?: string;
  
  // Cuisine/Type
  cuisineType?: string;
  
  // Meal time
  mealType?: 'breakfast' | 'brunch' | 'lunch' | 'dinner' | 'late-night' | null;
  
  // Price preference
  priceLevel?: 'budget' | 'moderate' | 'upscale' | 'any';
  
  // Amenities
  needsTakeout?: boolean;
  needsCoffee?: boolean;
  
  // Vibes (now filtered using enriched tags)
  vibeKeywords: string[];

  // NEW: Occasion filtering
  occasionType?: string | null;

  // NEW: Noise preference
  noisePreference?: 'quiet' | 'any' | null;

  // NEW: Special requirements
  requiresInstagrammable?: boolean;
  requiresMichelin?: boolean;
  requiresCynthiasPick?: boolean;
}
export type City = 'New York City' | 'Tokyo' | 'Paris' | 'Seoul';