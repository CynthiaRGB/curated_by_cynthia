// Cache system for Claude API responses to reduce costs
// Uses in-memory cache with TTL (time-to-live)

import { ClaudeResponse } from '../../src/claudeService.js';

interface CacheEntry {
  response: ClaudeResponse;
  timestamp: number;
  ttl: number; // TTL in milliseconds for this specific entry
  query: string; // Store original query for debugging
}

// In-memory cache store
const cache = new Map<string, CacheEntry>();

// Default TTL: 24 hours (86,400,000 ms)
// Claude responses are deterministic for same query, so caching is safe
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Extended TTL for city prompt items: 30 days (2,592,000,000 ms)
// City prompts are highly deterministic and frequently used, so longer cache saves costs
const CITY_PROMPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Maximum cache size to prevent memory issues (100 entries)
const MAX_CACHE_SIZE = 100;

/**
 * Generate a cache key from query and context
 * Normalizes the query (lowercase, trim, remove extra spaces) for better cache hits
 */
export function generateCacheKey(query: string, filteredRestaurantIds?: string[]): string {
  // Normalize query
  const normalizedQuery = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
  
  // Include restaurant IDs if provided (important because Claude ranks specific restaurants)
  const restaurantKey = filteredRestaurantIds 
    ? `_restaurants:${filteredRestaurantIds.sort().join(',')}`
    : '';
  
  return `${normalizedQuery}${restaurantKey}`;
}

/**
 * Get cached Claude response if available and not expired
 */
export function getCachedResponse(
  query: string, 
  filteredRestaurantIds?: string[]
): ClaudeResponse | null {
  const cacheKey = generateCacheKey(query, filteredRestaurantIds);
  const entry = cache.get(cacheKey);
  
  if (!entry) {
    console.log(`[Claude Cache] Miss: ${cacheKey.substring(0, 50)}...`);
    return null;
  }
  
  // Check if expired (use entry-specific TTL)
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    const ageDays = Math.round(age / 1000 / 60 / 60 / 24 * 10) / 10;
    console.log(`[Claude Cache] Expired (age: ${ageDays} days, TTL: ${Math.round(entry.ttl / 1000 / 60 / 60 / 24)} days): ${cacheKey.substring(0, 50)}...`);
    cache.delete(cacheKey);
    return null;
  }
  
  const ageDays = Math.round(age / 1000 / 60 / 60 / 24 * 10) / 10;
  console.log(`[Claude Cache] Hit (age: ${ageDays} days, TTL: ${Math.round(entry.ttl / 1000 / 60 / 60 / 24)} days): ${cacheKey.substring(0, 50)}...`);
  return entry.response;
}

/**
 * Store Claude response in cache
 * @param query - The query string
 * @param response - The Claude response to cache
 * @param filteredRestaurantIds - Optional restaurant IDs for cache key
 * @param ttlMs - Optional TTL in milliseconds (defaults to DEFAULT_TTL_MS)
 */
export function setCachedResponse(
  query: string,
  response: ClaudeResponse,
  filteredRestaurantIds?: string[],
  ttlMs?: number
): void {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    cache.delete(oldestKey);
    console.log(`[Claude Cache] Evicted oldest entry: ${oldestKey.substring(0, 50)}...`);
  }
  
  const cacheKey = generateCacheKey(query, filteredRestaurantIds);
  const ttl = ttlMs || DEFAULT_TTL_MS;
  cache.set(cacheKey, {
    response,
    timestamp: Date.now(),
    ttl,
    query,
  });
  
  const ttlDays = Math.round(ttl / 1000 / 60 / 60 / 24 * 10) / 10;
  console.log(`[Claude Cache] Stored: ${cacheKey.substring(0, 50)}... (TTL: ${ttlDays} days, cache size: ${cache.size})`);
}

/**
 * Get TTL for city prompt items (longer cache for frequently used prompts)
 */
export function getCityPromptTTL(): number {
  return CITY_PROMPT_TTL_MS;
}

/**
 * Clear all cache entries (useful for testing or cache invalidation)
 */
export function clearCache(): void {
  cache.clear();
  console.log('[Claude Cache] Cleared all entries');
}

/**
 * Get cache statistics (for monitoring/debugging)
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  entries: Array<{ key: string; age: number; query: string }>;
} {
  const entries = Array.from(cache.entries()).map(([key, entry]) => ({
    key: key.substring(0, 50) + '...',
    age: Date.now() - entry.timestamp,
    query: entry.query.substring(0, 50),
  }));
  
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    entries,
  };
}

