// Restaurant type definitions for Curated by Cynthia

export interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

export interface Location {
  address: string;
  country_code: string;
}

export interface Properties {
  location: Location;
  google_maps_url?: string;
}

export interface Geometry {
  coordinates: [number, number]; // [longitude, latitude]
}

export interface OriginalPlace {
  geometry: Geometry;
  properties: Properties;
}

export interface DisplayName {
  text: string;
}

export interface PriceRange {
  startPrice: { units: string };
  endPrice: { units: string };
}

export interface OpeningPeriod {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number };
}

export interface RegularOpeningHours {
  periods: OpeningPeriod[];
  weekdayDescriptions: string[];
}

export interface GenerativeSummary {
  overview: { text: string };
}

export interface ReviewSummary {
  text: { text: string };
}

export interface GoogleData {
  displayName: DisplayName;
  name?: string;
  id?: string;
  primaryType?: string;
  types: string[];
  rating?: number;
  userRatingCount?: number;
  priceRange?: PriceRange;
  regularOpeningHours?: RegularOpeningHours;
  takeout?: boolean;
  servesCoffee?: boolean;
  generativeSummary?: GenerativeSummary;
  reviewSummary?: ReviewSummary;
  addressComponents: AddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  formattedAddress?: string;
  
  // Meal service flags
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  
  // Food service flags
  servesVegetarianFood?: boolean;
  servesDessert?: boolean;
  
  // Beverage service flags
  servesBeer?: boolean;
  servesWine?: boolean;
  servesCocktails?: boolean;
  
  // Additional metadata
  editorialSummary?: { text: string };
  reviews?: Array<{ text: { text: string } }>;
  weekdayDescriptions?: string[];
}

export interface Restaurant {
  // Core identification
  google_place_id: string;
  
  // Location data
  city: string;
  neighborhood_extracted: string;
  specific_type: string;
  place_classification: string;
  
  // Google Places data
  google_data: GoogleData;
  original_place: OriginalPlace;
  
  // Enrichment metadata
  enrichment_status?: string;
  enrichment_date?: string;
  
  // Cynthia's curation
  cynthias_pick?: boolean;
  
  // Price display
  price_display?: string;
}

// Filter service types
export interface ExtractedKeywords {
  // Original query
  originalQuery?: string;
  
  // Location
  neighborhood?: string;
  borough?: string;
  city?: string;
  
  // Cuisine/Type
  cuisineType?: string;
  cuisineTypeInfo?: { primary: string[], secondary: string[] };
  
  // Meal time
  mealType?: 'breakfast' | 'brunch' | 'lunch' | 'dinner' | 'late-night' | null;
  
  // Price preference
  priceLevel?: 'budget' | 'moderate' | 'upscale' | 'any';
  
  // Amenities
  needsTakeout?: boolean;
  needsCoffee?: boolean;
  
  // Vibes (save for Claude, don't filter on these)
  vibeKeywords: string[];
}

// Legacy types for backward compatibility
export interface RestaurantStatistics {
  totalRestaurants: number;
  averageRating: string;
  cuisineTypes: number;
  cities: number;
}

export interface FilterOptions {
  city?: string;
  cuisine?: string;
  priceLevel?: number;
  minRating?: number;
}

export interface SearchQuery {
  text: string;
  city?: string;
  filters?: FilterOptions;
}

export interface RestaurantFilter {
  city?: string;
  cuisine?: string;
  priceLevel?: number;
  minRating?: number;
}

export type City = 'New York City' | 'Tokyo' | 'Seoul' | 'Paris';