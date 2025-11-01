// Intelligent routing service for restaurant queries
// Decides whether to use filterService only, or call Claude API for nuanced queries

import { Restaurant } from '../../../src/types/restaurant';
import { extractKeywords } from './filterService.js';

export type RouteDecision = 'filterService' | 'claude' | 'default';

export interface RoutingContext {
  previousQuery?: string;
  previousResults?: Restaurant[]; // Already shown restaurants (for "show me more")
  previousRoute?: RouteDecision;
}

export interface RouteResult {
  route: RouteDecision;
  reason: string;
  needsClaude?: boolean;
  shouldFilterOnly?: boolean;
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

// Nuanced queries that require Claude API
// These are patterns that can't be handled by metadata tags alone
const NUANCED_CLAUDE_PATTERNS = [
  /celebrit(y|ies)/i,
  /famous people/i,
  /hidden gems/i,
  /locals love/i,
  /tourists don't/i,
  /tourists dont/i,
  /off the beaten path/i,
  /underrated/i,
  /overrated/i,
  /best kept secret/i,
  /not touristy/i,
  /where.*celebrity/i,
  /place where.*go/i, // e.g., "place where celebrities go"
  /perfect.*but also/i, // Complex multi-criteria
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
 * Check if query contains nuanced patterns that require Claude
 */
function requiresClaudeForNuance(query: string): boolean {
  return NUANCED_CLAUDE_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Check if query can be handled by filterService metadata tags
 * Returns true if all requirements can be met by tags, false if Claude is needed
 */
function canFilterServiceHandle(query: string, keywords: ReturnType<typeof extractKeywords>): boolean {
  const lowerQuery = query.toLowerCase();
  
  // If it has any nuanced Claude patterns, can't handle
  if (requiresClaudeForNuance(query)) {
    return false;
  }
  
  // Check for complex multi-criteria that might need Claude
  // e.g., "perfect for business lunch but also good for casual drinks after"
  if (lowerQuery.includes('but also') || lowerQuery.includes('but also')) {
    return false; // Complex multi-criteria needs Claude
  }
  
  // Check if query mentions things that aren't in our metadata tags
  // Things filterService CAN handle:
  // - Cuisine types (keywords.cuisineType)
  // - Locations (keywords.borough, keywords.neighborhood, keywords.city)
  // - Price (keywords.priceLevel)
  // - Meal types (keywords.mealType)
  // - Vibes (keywords.vibeKeywords) - mapped to vibe_tags
  // - Occasions (keywords.occasionType) - mapped to occasion_tags
  // - Noise (keywords.noisePreference) - mapped to noise_level
  // - Instagrammable (keywords.requiresInstagrammable) - mapped to special_features
  // - Michelin (keywords.requiresMichelin) - mapped to accolades_tags
  // - Cynthia's pick (keywords.requiresCynthiasPick) - mapped to cynthias_pick
  
  // If we extracted keywords, filterService can likely handle it
  // The keyword extraction function already handles all the tag mappings
  
  return true; // Default: filterService can handle if keywords were extracted
}

/**
 * Main routing decision function
 */
export function decideRoute(query: string, context?: RoutingContext): RouteResult {
  const trimmedQuery = query.trim();
  
  // Step 1: Check if query is irrelevant
  if (isIrrelevantQuery(trimmedQuery)) {
    return {
      route: 'default',
      reason: 'Query is not related to restaurant search',
      isIrrelevant: true,
    };
  }
  
  // Step 2: Extract keywords to understand query intent
  const keywords = extractKeywords(trimmedQuery);
  
  // Step 3: Check if this is a follow-up query
  const isFollowUp = isFollowUpQuery(trimmedQuery, context);
  
  // Step 4: Handle follow-up queries
  if (isFollowUp && context?.previousQuery) {
    // "Show me more" - use filterService with same criteria, exclude previous results
    if (/show me more|more options|more restaurants|more places|more results|what else|any other|any more/i.test(trimmedQuery)) {
      return {
        route: 'filterService',
        reason: 'Follow-up query requesting more results with same criteria',
        shouldFilterOnly: true,
        isFollowUp: true,
      };
    }
    
    // Filter/sort requests - use filterService
    if (/filter by|sort by|order by|show.*cheaper|show.*expensive|show.*rating/i.test(trimmedQuery)) {
      return {
        route: 'filterService',
        reason: 'Follow-up query requesting filter/sort of previous results',
        shouldFilterOnly: true,
        isFollowUp: true,
      };
    }
    
    // If follow-up but doesn't match patterns, treat as new query
    // (fall through to normal routing)
  }
  
  // Step 5: Check if query has clear restaurant search intent
  const hasRestaurantIntent = 
    keywords.cuisineType !== undefined ||
    keywords.occasionType !== null ||
    keywords.vibeKeywords.length > 0 ||
    keywords.mealType !== null ||
    keywords.priceLevel !== undefined ||
    keywords.neighborhood !== undefined ||
    keywords.borough !== undefined ||
    keywords.city !== undefined ||
    RESTAURANT_KEYWORDS.some(keyword => trimmedQuery.toLowerCase().includes(keyword.toLowerCase()));
  
  if (!hasRestaurantIntent) {
    // No clear restaurant intent - might be irrelevant or too vague
    // If it's very short or matches irrelevant patterns, use default
    if (trimmedQuery.split(/\s+/).length <= 3 && !trimmedQuery.includes('in ')) {
      return {
        route: 'default',
        reason: 'Query lacks clear restaurant search intent',
        isIrrelevant: true,
      };
    }
  }
  
  // Step 6: Check if query requires Claude for nuanced understanding
  if (requiresClaudeForNuance(trimmedQuery)) {
    return {
      route: 'claude',
      reason: 'Query contains nuanced patterns that require Claude API',
      needsClaude: true,
    };
  }
  
  // Step 7: Check if filterService can handle the query
  if (!canFilterServiceHandle(trimmedQuery, keywords)) {
    return {
      route: 'claude',
      reason: 'Query requires nuanced understanding beyond metadata tags',
      needsClaude: true,
    };
  }
  
  // Step 8: Default to filterService (always pre-filter first, then decide if Claude needed)
  // Since we always pre-filter by city, we can always use filterService first
  return {
    route: 'filterService',
    reason: 'Query can be handled by filterService with metadata tags',
    shouldFilterOnly: true,
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

