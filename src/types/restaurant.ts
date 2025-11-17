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
      google_maps_url?: string;
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
    shortFormattedAddress?: string;
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
    photos?: Array<{
      name: string;
      widthPx?: number;
      heightPx?: number;
      authorAttributions?: Array<{
        displayName?: string;
        uri?: string;
        photoUri?: string;
      }>;
    }>;
    landmarks?: Array<{
      name?: string;
      placeId?: string;
      displayName?: {
        text: string;
        languageCode?: string;
      };
      types?: string[];
      spatialRelationship?: string;
      straightLineDistanceMeters?: number;
      travelDistanceMeters?: number;
    }>;
  };

  // Extracted metadata
  place_classification: string;
  specific_type?: string;
  neighborhood_extracted?: string;
  price_display?: string;
  city?: string;
  borough?: string; // NYC borough: "brooklyn" or "manhattan"
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
  neighborhood?: string | string[]; // Support single neighborhood or array for multiple
  borough?: string | string[]; // Support single borough or array for multiple (NYC only: "manhattan", "brooklyn")
  city?: string;
  landmark?: string | string[]; // Support single landmark or array for multiple (e.g., "Louvre", "Times Square")
  
  // Cuisine/Type
  cuisineType?: string;
  cuisineSpecialty?: string | null; // Specific dish/specialty (e.g., "pizza", "ramen", "yakitori", "dim sum")
  
  // Meal time
  mealType?: 'breakfast' | 'brunch' | 'lunch' | 'dinner' | 'late-night' | null;
  
  // Price preference
  priceLevel?: 'budget' | 'moderate' | 'upscale' | 'luxury' | 'any';
  
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
  requiresCoffeeFocus?: boolean; // For "coffee shop"/"coffee"/"cafe" queries - stricter matching
  requiresDessertFocus?: boolean; // For "dessert"/"pastry"/"cake" queries - stricter matching
  
  // Special features: Array of special features extracted from query
  // Available values: "cash_only", "chef_driven", "compact_seating", "counter_seating", "counter_service", 
  // "craft_driven", "hard_to_get_into", "hidden_gem", "historic_venue", "iconic_venue", "instagrammable", 
  // "outdoor_seating", "scenic_views", "speakeasy_vibe", "unique_concept"
  specialFeatures?: string[];
}

export type City = 'New York City' | 'Tokyo' | 'Paris' | 'Seoul';

// Query context for follow-up questions
export interface QueryContext {
  previousQuery: string;
  previousKeywords: ExtractedKeywords;
  previousResultIds: string[]; // google_place_id array
  city?: string;
}