/**
 * Utility functions for handling restaurant photos
 */

import { Restaurant } from '../types/restaurant';

/**
 * Get photo URL for a restaurant
 * Returns null if no photos available
 */
export function getRestaurantPhotoUrl(restaurant: Restaurant): string | null {
  // Check if this restaurant has photos from enrichment
  const firstPhoto = restaurant.google_data?.photos?.[0];
  
  if (firstPhoto?.name) {
    // Use the Google Places Photo API URL
    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY || '';
    return `https://places.googleapis.com/v1/${firstPhoto.name}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}`;
  }
  
  // No photos available
  return null;
}

/**
 * Get photo attribution text (required by Google)
 */
export function getPhotoAttribution(restaurant: Restaurant): string | null {
  const firstPhoto = restaurant.google_data?.photos?.[0];
  
  if (firstPhoto?.authorAttributions?.[0]) {
    const author = firstPhoto.authorAttributions[0];
    return author.displayName || 'Google User';
  }
  
  return null;
}