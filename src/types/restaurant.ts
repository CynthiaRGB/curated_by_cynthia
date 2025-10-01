// Restaurant data types based on Google Places API enriched data

export interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
  languageCode: string;
}

export interface Location {
  address: string;
  country_code: string;
  name: string;
}

export interface Geometry {
  coordinates: [number, number]; // [longitude, latitude]
  type: "Point";
}

export interface OriginalPlace {
  geometry: Geometry;
  properties: {
    date: string;
    google_maps_url: string;
    location: Location;
  };
  type: "Feature";
}

export interface DisplayName {
  text: string;
  languageCode: string;
}

export interface ReviewSummary {
  reviewCount: number;
  averageRating: number;
  firstReview?: {
    author: string;
    text: string;
    rating: number;
    publishTime: string;
  };
}

export interface Photo {
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions: Array<{
    displayName: string;
    uri: string;
    photoUri: string;
  }>;
}

export interface GooglePlaceData {
  name: string;
  id: string;
  types: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  formattedAddress: string;
  addressComponents: AddressComponent[];
  displayName: DisplayName;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: "PRICE_LEVEL_FREE" | "PRICE_LEVEL_INEXPENSIVE" | "PRICE_LEVEL_MODERATE" | "PRICE_LEVEL_EXPENSIVE" | "PRICE_LEVEL_VERY_EXPENSIVE";
  websiteUri?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
  reviewSummary?: ReviewSummary;
  photos?: Photo[];
  regularOpeningHours?: {
    openNow: boolean;
    periods: Array<{
      open: {
        day: number;
        hour: number;
        minute: number;
      };
      close?: {
        day: number;
        hour: number;
        minute: number;
      };
    }>;
    weekdayDescriptions: string[];
  };
}

export interface Restaurant {
  original_place: OriginalPlace;
  google_place_id: string;
  google_data: GooglePlaceData;
}

export interface RestaurantData {
  metadata: {
    processing_date: string;
    source: string;
    original_file: string;
    test_mode: boolean;
    filtering_mode: string;
    places_processed: number;
    places_enriched: number;
    errors: number;
    api_calls_made: number;
    expected_api_calls: number;
    estimated_cost_usd: number;
    field_mask_used: string;
    classification_stats: {
      restaurant: number;
      non_restaurant: number;
      other: number;
    };
    places_filtered_out: number;
    restaurant_breakdown: {
      restaurants: number;
      bars: number;
      cafes: number;
      other_food: number;
    };
    cleaning_mode: string;
    cleaning_date: string;
    size_reduction: {
      removed_fields: string[];
      kept_fields: string[];
      reduction_date: string;
    };
  };
  places: Restaurant[];
}

// Helper types for filtering and searching
export type City = "New York City" | "Tokyo" | "Seoul" | "Paris";

export interface RestaurantFilter {
  city?: City;
  cuisine?: string;
  priceLevel?: string;
  minRating?: number;
  maxRating?: number;
  isOpenNow?: boolean;
}

export interface SearchQuery {
  text: string;
  city?: City;
  filters?: RestaurantFilter;
}
