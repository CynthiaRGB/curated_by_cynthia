# Eval Status & Filtering Service + Claude API Integration Overview

## 📊 Eval Status

### Evaluation Framework
- **Tool**: Braintrust evaluation (`filterService-eval.ts`)
- **Project**: `curated-by-cynthia`
- **Eval Name**: `filterService-quality`
- **Version**: 2.0
- **Test Count**: 11 test cases across 11 categories
- **Trial Count**: 1 (deterministic filtering)

### Test Categories

1. **Basic Functionality** (1 test)
   - Verifies queries return results

2. **Location Filtering** (3 tests)
   - Borough matching (Brooklyn, Manhattan)
   - Neighborhood matching (e.g., "West Village")
   - City matching (NYC, Tokyo, Seoul, Paris)

3. **Cuisine Filtering** (3 tests)
   - Exact cuisine match (e.g., "Italian")
   - Umbrella cuisine match (e.g., "Asian" → Japanese, Chinese, Korean, etc.)
   - Specific dish match (e.g., "ramen")

4. **Coffee Focus** (1 test)
   - Strict metadata-only matching (80%+ threshold)
   - Requires `coffee_shop` or `cafe` in primaryType or types array

5. **Dessert Focus** (1 test)
   - Strict metadata-only matching (80%+ threshold)
   - Requires dessert-related types (bakery, dessert_shop, etc.)

6. **Brunch Focus** (1 test)
   - Multi-criteria matching (70%+ threshold)
   - Checks metadata, tags, hours, and mentions

7. **Vibe Filtering** (2 tests)
   - Romantic, cozy vibes
   - Uses `vibe_tags` from enriched metadata

8. **Occasion Filtering** (2 tests)
   - First date, business lunch
   - Uses `occasion_tags` from enriched metadata

9. **Multi-Criteria (2 keywords)** (2 tests)
   - Location + cuisine combinations

10. **Multi-Criteria (3 keywords)** (3 tests)
    - Location + cuisine + vibe/occasion combinations

11. **Price Filtering** (1 test)
    - Budget/cheap restaurant matching

### Scoring System

Each test has specific scorers that validate:
- **Has Results**: Returns results (binary)
- **Location Match**: ALL results match location (100% required)
- **Cuisine Match**: 70%+ results match cuisine
- **Coffee Focus**: 80%+ results are coffee shops
- **Dessert Focus**: 80%+ results are dessert places
- **Brunch Focus**: 70%+ results are brunch-focused
- **Vibe Match**: 70%+ results match vibe
- **Occasion Match**: 70%+ results match occasion
- **Price Match**: 70%+ results match price level

### Key Evaluation Principles

1. **Accuracy over count**: All results must be correct
2. **Strict matching for special types**: Coffee, dessert, bar use metadata-only matching
3. **Location precedence**: Neighborhood > Borough > City
4. **Normalization**: Handles accents, plurals, variations (e.g., "crepes" = "crepe" = "crêpe")

---

## 🔄 How Filtering Service Works with Claude API

### Architecture Overview

```
User Query
    ↓
[Routing Service] → Decides: filterService | claude | default
    ↓
[Query Parsing] → Optional Claude parsing OR deterministic extraction
    ↓
[Pre-Filtering] → filterService (ALWAYS runs first)
    ↓
[Claude Ranking] → Optional Claude ranking (if route = 'claude')
    ↓
Results
```

### Step-by-Step Flow

#### 1. **Routing Decision** (`routingService.ts`)

The routing service analyzes the query and decides the execution path:

**Routes:**
- `'filterService'`: Use filterService only (deterministic, fast, free)
- `'claude'`: Use Claude API for nuanced queries (slower, costs money)
- `'default'`: Irrelevant query (return empty results)

**Routing Logic:**
```typescript
// Always pre-filter first, then decide if Claude needed
1. Check if irrelevant → 'default'
2. Check if follow-up query → 'filterService' (use previous query context)
3. Check if nuanced patterns → 'claude' (e.g., "hidden gems", "locals love")
4. Check if filterService can handle → 'filterService' (default)
5. Otherwise → 'claude'
```

**Nuanced patterns that require Claude:**
- "hidden gems", "locals love", "celebrities", "underrated"
- Complex multi-criteria: "perfect for X but also Y"
- Queries requiring semantic understanding beyond metadata tags

#### 2. **Query Parsing** (Optional Claude Step)

**Two parsing methods:**

**A. Claude Parsing** (`parseQueryWithClaude`)
- Used for non-city-prompt-item queries
- Parses natural language into structured `ExtractedKeywords`
- Handles complex queries with nuanced intent
- Falls back to deterministic extraction on error

**B. Deterministic Extraction** (`extractKeywords`)
- Used for city-prompt-item queries (predefined prompts)
- Fast, rule-based keyword extraction
- Always used as fallback

**Extracted Keywords Structure:**
```typescript
{
  neighborhood?: string | string[],
  borough?: "brooklyn" | "manhattan",
  city?: "nyc" | "tokyo" | "seoul" | "paris",
  cuisineType?: string,
  mealType?: "breakfast" | "brunch" | "lunch" | "dinner" | "late-night",
  priceLevel?: "budget" | "moderate" | "upscale",
  vibeKeywords: string[],
  occasionType?: string,
  noisePreference?: "quiet" | "any",
  requiresInstagrammable: boolean,
  requiresMichelin: boolean,
  requiresCynthiasPick: boolean,
  requiresCoffeeFocus: boolean,
  requiresDessertFocus: boolean
}
```

#### 3. **Pre-Filtering** (`preFilterRestaurants`)

**Always runs first** - filters restaurants using extracted keywords:

**Filtering Functions:**
- `matchesLocation()`: Neighborhood, borough, city matching
- `matchesCuisine()`: Cuisine type matching (with special handling for coffee/dessert/bar)
- `matchesMealType()`: Breakfast, brunch, lunch, dinner
- `matchesPrice()`: Budget, moderate, upscale
- `matchesAmenities()`: Takeout, coffee availability
- `matchesVibe()`: Uses `vibe_tags` from enriched metadata
- `matchesOccasion()`: Uses `occasion_tags` from enriched metadata
- `matchesNoiseLevel()`: Uses `noise_level` from enriched metadata
- `matchesInstagrammable()`: Uses `special_features`
- `matchesMichelin()`: Uses `accolades_tags`
- `matchesCynthiasPick()`: Uses `cynthias_pick` boolean

**Special Matching Rules:**
- **Coffee/Cafe**: Strict metadata-only (no name matching)
- **Dessert**: Strict metadata-only (no name matching)
- **Bar**: Strict metadata-only (no name matching)
- **Asian cuisine**: Matches any Asian cuisine type (Japanese, Chinese, Korean, etc.)
- **Location precedence**: Neighborhood > Borough > City

**Sorting:**
- Tiered ranking system (Tier 1 > Tier 2 > Tier 3)
- Within tier: Quality score (rating × log10(reviewCount + 1))
- Cynthia's pick boost: 1.2x multiplier

#### 4. **Claude Ranking** (Optional Step)

**Only runs if:**
- Route decision = `'claude'`
- NOT a "show me more" query (those always use filterService only)
- Cache miss (cached responses reused)

**Claude Ranking Process:**
1. **Cache Check**: Check if response exists for query + restaurant IDs
2. **API Call** (if cache miss):
   - Sends top 20 pre-filtered restaurants to Claude
   - Claude analyzes and returns top 3-5 recommendations
   - Includes personalized reasoning for each recommendation
3. **Cache Store**: Store response for 24 hours (TTL)
4. **Enrichment**: Map Claude recommendations back to full Restaurant objects

**Claude Prompt Strategy:**
- Prioritizes Cynthia's picks strongly
- Considers user's specific request (cuisine, vibe, occasion, etc.)
- Analyzes ratings AND review highlights
- Returns personalized reasoning for each recommendation

#### 5. **Caching System** (`claudeCache.ts`)

**Purpose**: Reduce Claude API costs by caching responses

**Cache Key**: `normalizedQuery + restaurantIds`
- Normalizes query (lowercase, trim, remove extra spaces)
- Includes restaurant IDs (important because Claude ranks specific restaurants)

**Cache Settings:**
- **TTL**: 24 hours (86,400,000 ms)
- **Max Size**: 100 entries (LRU eviction)
- **Storage**: In-memory Map

**Cache Functions:**
- `getCachedResponse()`: Check cache, return if valid
- `setCachedResponse()`: Store response with timestamp
- `generateCacheKey()`: Create normalized cache key
- `clearCache()`: Clear all entries (testing/debugging)
- `getCacheStats()`: Get cache statistics

---

## 🎯 Key Integration Points

### 1. **Always Pre-Filter First**
- FilterService ALWAYS runs before Claude
- Claude only receives pre-filtered restaurants (max 20)
- This reduces token usage and improves Claude's focus

### 2. **Dual Parsing Strategy**
- Claude parsing for complex queries
- Deterministic extraction for simple/predefined queries
- Fallback to deterministic if Claude fails

### 3. **Smart Routing**
- Most queries use filterService only (fast, free)
- Claude only for nuanced queries requiring semantic understanding
- "Show me more" queries always use filterService (preserve filters)

### 4. **Caching Strategy**
- Cache key includes query + restaurant IDs
- 24-hour TTL (Claude responses are deterministic)
- LRU eviction when cache is full

### 5. **Special Cases**

**Cynthia's Favorites:**
- Returns ALL matching restaurants (no limit)
- Works with both filterService and Claude routes

**Show Me More:**
- Uses previous query for filtering (preserves context)
- Excludes previously shown restaurants
- Always uses filterService only (never Claude)

**City Prompt Items:**
- Predefined prompts (e.g., "Cynthia's favorites", "coffee shops")
- Always use deterministic extraction (no Claude parsing)
- Fast, predictable results

---

## 📈 Performance & Cost Optimization

### Cost Reduction Strategies

1. **Pre-filtering**: Reduces Claude input from 277 restaurants to ~20
2. **Caching**: 24-hour cache reduces repeat API calls
3. **Smart routing**: Most queries use filterService only (no Claude cost)
4. **Token optimization**: Minimal restaurant data sent to Claude

### Performance Characteristics

- **FilterService only**: ~10-50ms (deterministic, in-memory)
- **Claude parsing**: ~500-1000ms (API call)
- **Claude ranking**: ~1000-2000ms (API call)
- **Cache hit**: ~1ms (in-memory lookup)

---

## 🔍 Current Status Summary

### Eval Status
✅ **11 test categories** covering all major filtering scenarios
✅ **Strict scoring** with accuracy thresholds (70-80%)
✅ **Comprehensive coverage** of location, cuisine, vibe, occasion, price
✅ **Special handling** for coffee, dessert, brunch, bar

### Claude Integration Status
✅ **Dual parsing** (Claude + deterministic)
✅ **Smart routing** (filterService-first approach)
✅ **Caching system** (24-hour TTL, 100 entry limit)
✅ **Pre-filtering** (always runs first)
✅ **Error handling** (fallback to filterService on Claude errors)

### Areas for Improvement
- [ ] Add more eval test cases for edge cases
- [ ] Monitor cache hit rates
- [ ] Track Claude API costs per query type
- [ ] Add eval for Claude ranking quality
- [ ] Consider longer cache TTL for stable queries

---

## 📝 Notes

- FilterService is the foundation - it always runs first
- Claude is an enhancement for nuanced queries, not a replacement
- Caching is critical for cost control
- Routing service is the brain that decides the execution path
- All three components work together: Routing → Filtering → Ranking

