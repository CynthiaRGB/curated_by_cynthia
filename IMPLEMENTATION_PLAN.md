# Implementation Plan: Claude Query Parser Architecture

## Overview
Refactor query handling to use Claude API for parsing queries, with context-aware follow-up support and caching. Keep deterministic parsing for predefined city prompt items (performance optimization).

## File Structure

```
api/
├── recommend.ts                    [MODIFY] Main endpoint - always use Claude parsing
├── services/
│   ├── parseQuery.ts              [CREATE] Claude query parser with caching
│   ├── routingService.ts          [MODIFY] Simplify to only detect irrelevant queries
│   ├── filterService.ts           [NO CHANGE] Keep as-is
│   └── claudeCache.ts             [NO CHANGE] Keep for future use
src/
├── types/
│   └── restaurant.ts              [MODIFY] Add QueryContext type
└── claudeService.ts               [NO CHANGE] Keep parseQueryWithClaude for reference
```

## Implementation Details

### 1. `api/services/parseQuery.ts` (NEW)
**Purpose**: Parse ALL queries with Claude API, handle follow-ups with context, cache results

**Key Functions**:
- `parseQueryWithClaude(query, city?, context?)` - Main parsing function
- `generateCacheKey(query, city?, context?)` - Generate cache key (includes context hash for follow-ups)
- `getCachedKeywords(key)` - Get from cache
- `setCachedKeywords(key, keywords)` - Store in cache
- `isFollowUpQuery(query)` - Detect follow-up patterns
- `buildQueryParsingPrompt(query, context?)` - Build prompt with context support

**Features**:
- In-memory cache with 24-hour TTL
- LRU eviction (max 200 entries)
- Context-aware parsing for follow-ups
- Fallback to empty keywords on error
- Support for city-specific parsing

**Cache Structure**:
```typescript
Map<string, { keywords: ExtractedKeywords, timestamp: number }>
```

**Cache Key Generation**:
- Format: `{normalizedQuery}_{city}_ctx_{contextHash}`
- Context hash ensures follow-up queries have different cache keys
- Example: 
  - "Italian restaurants" → `italian restaurants_nyc`
  - "show me more" (after Italian) → `show me more_nyc_ctx_a1b2c3d4`

### 2. `api/recommend.ts` (MODIFY)
**Changes**:
- **Accept `city` parameter** from request body (selected city pill)
- **Validate city** - must be one of: 'New York City', 'Tokyo', 'Paris', 'Seoul'
- **Handle unsupported cities** in query - if query mentions unsupported city, return error message
- **Handle conflicting cities** - if query mentions different city than selected, use selected city (ignore query city)
- Use Claude parsing for most queries (with caching)
- **KEEP `isCityPromptItem` check** - use deterministic `extractKeywords()` for predefined prompts (performance optimization)
- **KEEP Claude ranking for nuanced queries** - queries that can't be expressed as filters alone
- Use `parseQueryWithClaude()` from parseQuery.ts for non-prompt queries
- Pass context and city to parser for follow-ups
- Conditional ranking: Only rank if query needs semantic understanding

**New Flow**:
1. **Validate city parameter** - must be one of 4 supported cities
2. **Check for unsupported cities in query** - if query mentions unsupported city (e.g., "London", "Berlin"), return error: "We only support restaurants in New York City, Tokyo, Paris, and Seoul. Please select one of these cities."
3. **Normalize city** - use selectedCity parameter (ignore city mentioned in query if different)
4. Call `decideRoute()` - returns `'parseAndFilter'` or `'irrelevant'`
5. If irrelevant: Return empty results with message
6. Check if city prompt item:
   - If yes: Use deterministic `extractKeywords()` (fast, no Claude API call)
   - If no: Parse query with Claude (with context and city if available)
7. Pre-filter with filterService
8. Handle "show me more" (exclude previous results)
9. **Conditional Claude ranking**:
   - If `needsClaudeRanking(query)` AND filtered.length > 5: Use Claude ranking
   - Otherwise: Return filtered results (slice to maxResults, except Cynthia's favorites)
10. Return context for next query

**Claude Ranking Function**:
```typescript
function needsClaudeRanking(query: string): boolean {
  const nuancedPatterns = [
    /hidden gem/i, /locals love/i, /celebrity/i,
    /underrated/i, /best kept secret/i, /off the beaten path/i
  ];
  return nuancedPatterns.some(p => p.test(query));
}
```

**City Validation Functions**:
```typescript
const SUPPORTED_CITIES = ['New York City', 'Tokyo', 'Paris', 'Seoul'];
const SUPPORTED_CITY_ALIASES = {
  'nyc': 'New York City',
  'new york': 'New York City',
  'new york city': 'New York City',
  'tokyo': 'Tokyo',
  'paris': 'Paris',
  'seoul': 'Seoul'
};

function validateCity(city: string): boolean {
  return SUPPORTED_CITIES.includes(city) || 
         Object.keys(SUPPORTED_CITY_ALIASES).includes(city.toLowerCase());
}

function detectUnsupportedCityInQuery(query: string): string | null {
  // Common unsupported cities to detect
  const unsupportedCities = [
    'london', 'berlin', 'rome', 'madrid', 'barcelona', 'amsterdam',
    'dublin', 'vienna', 'prague', 'lisbon', 'athens', 'stockholm',
    'copenhagen', 'oslo', 'helsinki', 'warsaw', 'budapest', 'bucharest',
    'moscow', 'istanbul', 'dubai', 'singapore', 'hong kong', 'bangkok',
    'sydney', 'melbourne', 'toronto', 'vancouver', 'montreal', 'miami',
    'los angeles', 'san francisco', 'chicago', 'boston', 'seattle',
    'austin', 'denver', 'portland', 'philadelphia', 'washington'
  ];
  
  const lowerQuery = query.toLowerCase();
  for (const city of unsupportedCities) {
    if (lowerQuery.includes(city)) {
      return city;
    }
  }
  return null;
}
```

**Response Changes**:
- Keep `usedClaude` field (true if Claude was used for parsing OR ranking)
- Add `parsedKeywords` to debug info
- Add `usedClaudeRanking` field (true if Claude ranking was used)
- Return `context` for client to pass back (for follow-up queries)

### 3. `api/services/routingService.ts` (MODIFY)
**Keep these functions**:
- `isFollowUpQuery()` - Detect follow-up queries
- `isShowMeMoreQuery()` - Detect "show me more" pattern
- `getMoreRestaurants()` - Exclude previously shown restaurants

**Simplify `decideRoute()`**:
- Return `'parseAndFilter'` for valid restaurant queries
- Return `'irrelevant'` for non-restaurant queries
- Remove complex routing logic (no more 'claude' vs 'filterService' distinction)
- Remove `needsClaudeForNuance()` - moved to `needsClaudeRanking()` in recommend.ts

**New RouteDecision type**:
```typescript
export type RouteDecision = 'parseAndFilter' | 'irrelevant';
```

### 4. `src/types/restaurant.ts` (MODIFY)
**Add**:
```typescript
export interface QueryContext {
  previousQuery: string;
  previousKeywords: ExtractedKeywords;
  previousResultIds: string[]; // google_place_id array
  city?: string;
}
```

## Implementation Steps

### Phase 1: Create parseQuery.ts
1. Create file with cache structure
2. Implement `parseQueryWithClaude()` function
3. Implement caching functions
4. Implement follow-up detection and merging
5. Add error handling with fallback

### Phase 2: Modify recommend.ts
1. **Accept `city` parameter** from request body
2. **Add city validation** - validate city is one of 4 supported cities
3. **Add unsupported city detection** - check if query mentions unsupported city, return error message
4. **Normalize city** - use selectedCity parameter (not city from query parsing)
5. Import parseQuery.ts
6. Keep `isCityPromptItem` check (use deterministic extraction for prompts)
7. Call `parseQueryWithClaude()` for non-prompt queries (with context and city if available)
8. **Catch parsing errors** - if both Claude and fallback fail, return: `"I don't quite get your question, try something else"`
9. Add `needsClaudeRanking()` function to detect nuanced queries
10. **Keep Claude ranking** - conditionally use `rankRestaurantsWithClaude()` for nuanced queries
11. Update response structure
12. Return context for follow-ups

### Phase 3: Simplify routingService.ts
1. Keep helper functions: `isFollowUpQuery()`, `isShowMeMoreQuery()`, `getMoreRestaurants()`
2. Simplify `decideRoute()` to return `'parseAndFilter'` or `'irrelevant'` only
3. Remove `needsClaudeForNuance()` - nuanced pattern detection moved to `needsClaudeRanking()` in recommend.ts
4. Update `RouteDecision` type to `'parseAndFilter' | 'irrelevant'`

### Phase 4: Update types
1. Add QueryContext type to restaurant.ts

### Phase 5: Update Frontend
1. Modify ChatInterface.tsx to:
   - Store queryContext in useState
   - Send context with each query
   - Update context after each response
   - **Send selectedCity separately** (not just appended to query)
   
2. Update API call in frontend:
   ```typescript
   fetch('/api/recommend', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       query: userInput,  // User's query (may or may not mention city)
       city: selectedCity,  // ← Selected city pill (NYC, Tokyo, Paris, Seoul)
       context: queryContext  // ← Send previous context
     })
   })
   ```
   
3. Handle context in response:
   - Extract context from API response
   - Store in state for next query
   - Clear context when starting new search
   
4. Handle city validation errors:
   - Display error message if API returns unsupported city error
   - Prompt user to select a supported city

## Testing Queries

1. **"romantic Italian in West Village"**
   - Should parse: cuisine=italian, vibe=romantic, neighborhood=west village

2. **"affordable sushi for date night"**
   - Should parse: cuisine=sushi, priceLevel=budget, occasion=date_night

3. **"are there cheaper ones?"** (follow-up)
   - Should merge: keep previous keywords, update priceLevel=budget

4. **"show me more"** (follow-up)
   - Should use previous keywords, exclude previous result IDs

5. **"hidden gems celebrities love"** (nuanced query)
   - Should parse with Claude, filter, then use Claude ranking
   - Should return top 3-5 personalized recommendations

6. **"Italian restaurants in London"** (unsupported city, selected: NYC)
   - Should detect unsupported city
   - Should return error: "We only support restaurants in New York City, Tokyo, Paris, and Seoul. Please select one of these cities."

7. **"Italian restaurants in Tokyo"** (conflicting city, selected: NYC)
   - Should use selected city (NYC)
   - Should ignore "Tokyo" in query
   - Should search for Italian restaurants in NYC

## Error Handling

**Claude API Failures** (with graceful fallback):
1. **Missing API key** → Fallback to `extractKeywords()` (deterministic extraction)
2. **API call failure** (network, timeout, 500 error) → Fallback to `extractKeywords()`
3. **Invalid JSON response** → Fallback to `extractKeywords()`
4. **Fallback also fails** → Throw error: "I don't quite get your question, try something else"

**Error Handling in recommend.ts**:
- Catch error from `parseQueryWithClaude()`
- Return hardcoded response: `"I don't quite get your question, try something else"`
- Return empty recommendations array

**Benefits of fallback**:
- User still gets results even if Claude API is down
- Deterministic extraction handles most common queries well
- Clear error message when both parsing methods fail

**City Validation**:
- **Unsupported city in query** (e.g., "Italian restaurants in London"):
  - Detect unsupported city names in query
  - Return error: "We only support restaurants in New York City, Tokyo, Paris, and Seoul. Please select one of these cities."
  - Return empty recommendations array
- **Conflicting cities** (query mentions different city than selected):
  - Example: Selected "NYC" but query says "Italian restaurants in Tokyo"
  - **Use selected city** (ignore city in query)
  - Normalize to selectedCity parameter
  - Continue with search in selected city

**Other Error Cases**:
- Cache miss → Call Claude API
- Invalid context → Treat as new query (no context)
- Network timeout → Fallback to `extractKeywords()`

## Performance Considerations

- Cache hit: ~1ms (in-memory lookup)
- Cache miss: ~500-1000ms (Claude API call)
- Cache size: Max 200 entries (LRU eviction)
- TTL: 24 hours per entry

## Migration Notes

- **Keep `rankRestaurantsWithClaude()` in claudeService.ts** - used for nuanced query ranking
- Keep existing `parseQueryWithClaude()` in claudeService.ts for reference (replaced by parseQuery.ts)
- **Keep `isCityPromptItem()` and `extractKeywords()` in filterService.ts** - used for predefined prompts (performance optimization)
- No breaking changes to ExtractedKeywords type
- No changes to filterService.ts logic

## Performance Optimization

**City Prompt Items** (deterministic parsing):
- Predefined prompts like "Cynthia's favorites", "coffee shops", "brunch restaurants"
- Use fast `extractKeywords()` - no Claude API call
- Consistent, predictable results
- ~1-5ms parsing time

**Special Case: "Cynthia's favorites"**:
- Detected by `isCynthiasFavoritesQuery()` function
- Sets `requiresCynthiasPick: true` in keywords
- filterService filters restaurants where `cynthias_pick === true`
- **Returns ALL matching results** (no maxResults limit applied)
- Works in all cities (NYC, Tokyo, Seoul, Paris)
- Example: "Cynthia's favorites in Tokyo" → Returns all Cynthia's picks in Tokyo

**All Other Queries** (Claude parsing):
- Use Claude API with caching
- Context-aware for follow-ups
- ~500-1000ms on cache miss, ~1ms on cache hit

**Nuanced Queries** (Claude ranking):
- Queries like "hidden gems", "locals love", "underrated spots"
- Can't be expressed as filters alone - need semantic understanding
- Use Claude ranking after filtering (top 20 restaurants → top 3-5 recommendations)
- ~1000-2000ms ranking time (cached separately via claudeCache.ts)

**Note on Caching**:
- **Query parsing cache**: In-memory cache in `parseQuery.ts` (24-hour TTL, 200 entries)
- **Ranking cache**: Existing cache in `claudeCache.ts` (24-hour TTL, 100 entries)
- Two separate caches for different purposes

