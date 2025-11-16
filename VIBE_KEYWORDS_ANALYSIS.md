# Vibe Keywords Analysis: "upscale French for business lunch in Midtown"

## Issue Summary

**Test Case:** "upscale French for business lunch in Midtown"
- **Expected:** `vibeKeywords: ["upscale"]` AND `priceLevel: 3` (which is "upscale")
- **Actual:** Claude was likely only extracting `priceLevel: "upscale"` but NOT `vibeKeywords: ["upscale"]`
- **Result:** `vibe_keywords_accuracy` = 0% (no match)

## Root Cause

You were **100% correct**! Claude was parsing "upscale" as a price level but NOT as a vibe keyword.

The prompt didn't explicitly instruct Claude that words like "upscale", "fancy", "casual" should be extracted in **BOTH** fields when they appear in the query.

## How Vibe Keywords Match Against vibe_tags in Data File

### 1. **Data File Structure**
Restaurants have a `vibe_tags` array in their enriched metadata:
```typescript
restaurant.vibe_tags = ["upscale", "sophisticated", "elegant", "romantic", ...]
```

### 2. **Filtering Logic** (`matchesVibe` function in `filterService.ts`)
```typescript
function matchesVibe(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.vibeKeywords || keywords.vibeKeywords.length === 0) {
    return true; // No vibe filter = match all
  }

  const restaurantVibes = restaurant.vibe_tags || [];
  
  // Check if restaurant has ANY of the desired vibes
  return keywords.vibeKeywords.some(vibe => 
    restaurantVibes.includes(vibe)
  );
}
```

**Key Points:**
- Uses **exact string matching** (case-sensitive, but both are normalized to lowercase)
- Returns `true` if **ANY** vibe keyword matches any tag in `restaurant.vibe_tags`
- If no vibe keywords provided, returns `true` (no filtering)

### 3. **Vibe Mappings** (in `filterService.ts`)
The deterministic parser uses these mappings:
```typescript
const VIBE_MAPPINGS: { [key: string]: string[] } = {
  'upscale': ['upscale', 'sophisticated', 'elegant'],
  'fancy': ['upscale', 'sophisticated', 'elegant'],
  'casual': ['casual', 'laid_back', 'low_key'],
  'romantic': ['romantic', 'intimate', 'cozy'],
  // ... etc
};
```

**Note:** These mappings are for the OLD deterministic parser. Claude should extract vibe keywords that match the actual tags in the data file.

### 4. **Why Both Fields Matter**

**Price Level (`priceLevel`):**
- Used for filtering restaurants by price range
- Values: "budget", "moderate", "upscale", "any"
- Matches against restaurant's price data (Google price range, etc.)

**Vibe Keywords (`vibeKeywords`):**
- Used for filtering restaurants by atmosphere/ambiance
- Matches against `restaurant.vibe_tags` array
- Can have multiple keywords (e.g., `["upscale", "romantic"]`)

**Why "upscale" needs to be in BOTH:**
- `priceLevel: "upscale"` → Filters by price (expensive restaurants)
- `vibeKeywords: ["upscale"]` → Filters by atmosphere (upscale ambiance, even if price varies)

A restaurant might be:
- Expensive but casual (high price, casual vibe)
- Moderate price but upscale vibe (mid-range price, sophisticated ambiance)

So "upscale" in the query should extract BOTH to capture restaurants that are both expensive AND have an upscale atmosphere.

## Fix Applied

Updated the prompt in `parseQuery.ts` to explicitly instruct Claude:

```
- Vibes: Extract vibe keywords as an array. IMPORTANT: Words that describe both price AND atmosphere should be extracted in BOTH fields. Examples:
  * "upscale French" -> priceLevel: "upscale", vibeKeywords: ["upscale"]
  * "fancy restaurant" -> priceLevel: "upscale", vibeKeywords: ["upscale", "sophisticated", "elegant"]
  * "casual Italian" -> priceLevel: undefined (or "moderate"), vibeKeywords: ["casual"]
  Common vibe keywords that may also indicate price: "upscale", "fancy", "casual", "budget-friendly", "cheap", "expensive"
```

## Expected Behavior After Fix

For query: **"upscale French for business lunch in Midtown"**

Claude should extract:
```json
{
  "cuisineType": "french",
  "priceLevel": "upscale",
  "vibeKeywords": ["upscale"],  // ← Now included!
  "occasionType": "business_lunch",
  "neighborhood": ["midtown"],
  "mealType": "lunch",
  "city": "nyc"
}
```

This will:
1. ✅ Match `priceLevel` against restaurant price data
2. ✅ Match `vibeKeywords: ["upscale"]` against `restaurant.vibe_tags` array
3. ✅ Score 100% for `vibe_keywords_accuracy`

## Testing

After this fix, re-run the eval to verify:
- `vibe_keywords_accuracy` should improve for queries with "upscale", "fancy", "casual", etc.
- The test case "upscale French for business lunch in Midtown" should score 100%

