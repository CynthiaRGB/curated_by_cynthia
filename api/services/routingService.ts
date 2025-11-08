// Simplified routing service for restaurant queries
// Now only decides if query is irrelevant (everything else goes to parseAndFilter)

import { Restaurant } from '../../../src/types/restaurant';

export type RouteDecision = 'parseAndFilter' | 'irrelevant';

export interface RoutingContext {
  previousQuery?: string;
  previousResults?: Restaurant[]; // Already shown restaurants (for "show me more")
  previousRoute?: RouteDecision;
}

export interface RouteResult {
  route: RouteDecision;
  reason: string;
  isFollowUp?: boolean;
  isIrrelevant?: boolean;
}

// Patterns that indicate follow-up queries
const FOLLOW_UP_PATTERNS = [
  /show me more/i,
  /more options/i,
  /more restaurants/i,
  /more places/i,
  /more results/i,
  /what else/i,
  /any other/i,
  /any more/i,
  /filter by/i,
  /sort by/i,
  /order by/i,
  /show.*cheaper/i,
  /show.*expensive/i,
  /show.*higher.*rating/i,
  /show.*lower.*rating/i,
  /show.*better.*rating/i,
];

// Patterns that indicate user wants to start a NEW search (not a follow-up)
// These override the context check
const NEW_QUERY_PATTERNS = [
  // Change of mind / correction
  /^actually/i,
  /^instead/i,
  /^never mind/i,
  /^forget that/i,
  /^forget about/i,
  /^change my mind/i,
  /^changed my mind/i,
  /^on second thought/i,
  /^scratch that/i,
  /^cancel that/i,
  
  // Direct requests (starting fresh)
  /^i want/i,
  /^i'd like/i,
  /^i would like/i,
  /^i need/i,
  /^i'm looking for/i,
  /^i'm craving/i,
  /^looking for/i,
  /^search for/i,
  /^find me/i,
  /^show me(?!\s+more)/i, // "show me" but NOT "show me more" (follow-up pattern checked first)
  /^can you find/i,
  /^can i get/i,
  /^do you have/i,
  /^want to try/i,
  /^let's try/i,
  /^let's/i,
  /^give me/i,
  /^recommend/i,
  /^suggest/i,
  /^surprise me/i,
  
  // New/different intent
  /^now i want/i,
  /^now i'd like/i,
  /^now i'm looking/i,
  /^new search/i,
  /^start over/i,
  /^restart/i,
  /^something different/i,
  /^something new/i,
  
  // Suggestion/question patterns (new search)
  /^how about/i,
  /^what about/i,
  /^do you know/i,
  /^are there/i,
  /^where can i/i,
  /^what if/i,
  /^what if i/i,
  /^maybe/i,
  /^maybe i want/i,
  /^maybe we/i,
  
  // Wait/hesitation (often precedes new query)
  /^wait/i,
  /^wait,? i/i,
  /^hold on/i,
  /^um,? i/i,
  /^hmm,? i/i,
];

// Patterns that indicate irrelevant queries (non-restaurant related)
const IRRELEVANT_PATTERNS = [
  /^(hi|hello|hey)$/i,
  /how are you/i,
  /what's the weather/i,
  /what is the weather/i,
  /tell me a joke/i,
  /what time is it/i,
  /what day is it/i,
  /what's your name/i,
  /who are you/i,
];

// Keywords that indicate restaurant search intent
const RESTAURANT_KEYWORDS = [
  'restaurant', 'cafe', 'bar', 'dining', 'food', 'eat', 'lunch', 'dinner',
  'breakfast', 'brunch', 'cuisine', 'italian', 'japanese', 'french', 'korean',
  'chinese', 'mexican', 'thai', 'indian', 'pizza', 'burger', 'sushi', 'ramen',
  'coffee', 'bagel', 'bakery', 'dessert', 'spot', 'place', 'location'
];

/**
 * Check if query is a follow-up question
 */
function isFollowUpQuery(query: string, context?: RoutingContext): boolean {
  // IMPORTANT: Check follow-up patterns FIRST (more specific)
  // e.g., "show me more" should be follow-up, not caught by "show me" new query pattern
  if (FOLLOW_UP_PATTERNS.some(pattern => pattern.test(query))) {
    return true;
  }
  
  // If query starts with patterns that indicate a new search, treat as new query
  if (NEW_QUERY_PATTERNS.some(pattern => pattern.test(query))) {
    return false;
  }
  
  // If there's context AND query doesn't indicate a new search, treat as follow-up
  if (context?.previousQuery) {
    return true; // Has previous context
  }
  
  return false;
}

/**
 * Check if query is completely irrelevant to restaurant search
 */
function isIrrelevantQuery(query: string): boolean {
  const trimmed = query.trim();
  
  // Check against irrelevant patterns
  if (IRRELEVANT_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }
  
  // Check if it contains restaurant keywords (if it does, it's relevant)
  const hasRestaurantKeywords = RESTAURANT_KEYWORDS.some(keyword => 
    trimmed.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // If no restaurant keywords and doesn't match patterns, might be irrelevant
  // But be conservative - only mark as irrelevant if it clearly matches a pattern
  return false;
}


/**
 * Main routing decision function (simplified)
 * Now only decides if query is irrelevant - everything else goes to parseAndFilter
 */
export function decideRoute(query: string, context?: RoutingContext): RouteResult {
  const trimmedQuery = query.trim();
  
  // Step 1: Check if query is irrelevant
  if (isIrrelevantQuery(trimmedQuery)) {
    return {
      route: 'irrelevant',
      reason: 'Query is not related to restaurant search',
      isIrrelevant: true,
    };
  }
  
  // Step 2: Check if this is a follow-up query (for logging/debugging)
  const isFollowUp = isFollowUpQuery(trimmedQuery, context);
  
  // Step 3: Everything else goes to parseAndFilter
  // (parseQuery.ts will handle Claude parsing, filterService will handle filtering)
  return {
    route: 'parseAndFilter',
    reason: 'Query will be parsed and filtered',
    isFollowUp: isFollowUp || undefined,
  };
}

/**
 * Check if query is a "show me more" request
 */
export function isShowMeMoreQuery(query: string): boolean {
  return /show me more|more options|more restaurants|more places|more results|what else|any other|any more/i.test(query);
}

/**
 * Get restaurants that match criteria but weren't shown yet
 */
export function getMoreRestaurants(
  allMatchingRestaurants: Restaurant[],
  alreadyShown: Restaurant[]
): Restaurant[] {
  const shownIds = new Set(alreadyShown.map(r => r.google_place_id));
  return allMatchingRestaurants.filter(r => !shownIds.has(r.google_place_id));
}

