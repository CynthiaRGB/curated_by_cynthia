/**
 * Utility functions for handling restaurant photos
 */

import { Restaurant } from '../types/restaurant';

// Load photo mapping (lazy-loaded to avoid blocking initial render)
let photoMapping: Record<string, string[]> | null = null;
let mappingLoadPromise: Promise<Record<string, string[]>> | null = null;

async function loadPhotoMapping(): Promise<Record<string, string[]>> {
  if (photoMapping !== null) {
    return photoMapping;
  }
  
  if (mappingLoadPromise) {
    return mappingLoadPromise;
  }
  
  mappingLoadPromise = fetch('/restaurant-photos/photo-mapping.json')
    .then(res => res.ok ? res.json() : {})
    .catch(() => ({}))
    .then(mapping => {
      photoMapping = mapping;
      return mapping;
    });
  
  return mappingLoadPromise;
}

/**
 * Get photo URL for a restaurant
 * Returns null if no photos available
 * Only uses local photos from Vercel CDN - no Google API fallback
 */
export async function getRestaurantPhotoUrl(restaurant: Restaurant): Promise<string | null> {
  const placeId = restaurant.google_place_id;
  
  // Try to load local photo mapping
  const mapping = await loadPhotoMapping();
  
  // Check if we have local photos for this restaurant
  if (mapping[placeId] && mapping[placeId].length > 0) {
    return mapping[placeId][0]; // Return first local photo
  }
  
  // No local photos available - return null (no Google API fallback)
  return null;
}

/**
 * Get photo URLs for a restaurant (up to 3 photos)
 * Returns array of photo URLs from local Vercel CDN only - no Google API fallback
 */
export async function getRestaurantPhotoUrls(restaurant: Restaurant): Promise<string[]> {
  const placeId = restaurant.google_place_id;
  
  // Try to load local photo mapping
  const mapping = await loadPhotoMapping();
  
  // Check if we have local photos for this restaurant
  if (mapping[placeId] && mapping[placeId].length > 0) {
    return mapping[placeId]; // Return all local photos (up to 3)
  }
  
  // No local photos available - return empty array (no Google API fallback)
  return [];
}

/**
 * Check if a restaurant has photos available in the local mapping
 * Uses the photo mapping file instead of the photos array
 */
export async function hasRestaurantPhoto(restaurant: Restaurant): Promise<boolean> {
  const placeId = restaurant.google_place_id;
  
  // Try to load local photo mapping
  const mapping = await loadPhotoMapping();
  
  // Check if we have local photos for this restaurant
  return !!(mapping[placeId] && mapping[placeId].length > 0);
}