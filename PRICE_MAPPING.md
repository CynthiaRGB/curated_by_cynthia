# Price Mapping: Keywords → priceLevel → price_display

## 1. Query Keywords → priceLevel (Claude Extraction)

### Claude Prompt Instructions
From `parseQuery.ts`:
```
- Price level: Extract price preference ("budget", "moderate", "upscale", "any", or undefined)
```

### Keyword Mappings (Deterministic Parser)
From `filterService.ts` (for reference, Claude should follow similar logic):

| Query Keywords | priceLevel | Notes |
|----------------|------------|-------|
| "cheap", "budget", "inexpensive" | `"budget"` | Budget-friendly |
| "expensive", "fancy", "upscale", "fine dining" | `"upscale"` | High-end |
| "moderate", "mid-range" | `"moderate"` | Mid-range |
| (not mentioned) | `undefined` | No price filter |

### Vibe Keywords That Also Indicate Price
From prompt:
- "upscale" → `priceLevel: "upscale"` + `vibeKeywords: ["upscale"]`
- "fancy" → `priceLevel: "upscale"` + `vibeKeywords: ["upscale", "sophisticated", "elegant"]`
- "casual" → `priceLevel: undefined` (or "moderate") + `vibeKeywords: ["casual"]`
- "cheap", "expensive", "budget-friendly" → May indicate price

### Vague Query Inferences
- "something nice" → `priceLevel: "moderate"` (inferred)

## 2. priceLevel → price_display (Filtering Logic)

### Filtering Function
From `matchesPrice()` in `filterService.ts`:

```typescript
function matchesPrice(restaurant: Restaurant, keywords: ExtractedKeywords): boolean {
  if (!keywords.priceLevel || keywords.priceLevel === 'any') {
    return true; // No price filter
  }

  const priceDisplay = restaurant.price_display;
  
  // Handle missing price data
  if (!priceDisplay || priceDisplay === 'N/A') {
    if (keywords.priceLevel === 'budget') {
      return false; // Exclude restaurants without price data for budget queries
    }
    return true; // Include restaurants without price data for moderate/upscale
  }

  // Map priceLevel to price_display ranges
  switch (keywords.priceLevel) {
    case 'budget':
      return priceDisplay === '$' || priceDisplay === '$$';
    case 'moderate':
      return priceDisplay === '$$' || priceDisplay === '$$$';
    case 'upscale':
      return priceDisplay === '$$$' || priceDisplay === '$$$$';
    default:
      return true;
  }
}
```

### Mapping Table

| priceLevel | Matches price_display | Description |
|------------|----------------------|-------------|
| `"budget"` | `"$"` or `"$$"` | Budget-friendly restaurants (1-2 dollar signs) |
| `"moderate"` | `"$$"` or `"$$$"` | Mid-range restaurants (2-3 dollar signs) |
| `"upscale"` | `"$$$"` or `"$$$$"` | High-end restaurants (3-4 dollar signs) |
| `"any"` | All | No price filtering |
| `undefined` | All | No price filtering |

### Special Cases

| price_display | priceLevel: "budget" | priceLevel: "moderate" | priceLevel: "upscale" |
|---------------|---------------------|----------------------|---------------------|
| `"$"` | ✅ Match | ❌ No match | ❌ No match |
| `"$$"` | ✅ Match | ✅ Match | ❌ No match |
| `"$$$"` | ❌ No match | ✅ Match | ✅ Match |
| `"$$$$"` | ❌ No match | ❌ No match | ✅ Match |
| `"N/A"` or missing | ❌ Excluded | ✅ Included | ✅ Included |

**Note:** Restaurants without price data (`price_display === "N/A"` or missing) are:
- **Excluded** for `priceLevel: "budget"` (assumed not budget-friendly)
- **Included** for `priceLevel: "moderate"` or `"upscale"` (could be any price)

## 3. price_display Values in Data File

From `latest_277.ts`, the possible values are:
- `"$"` - Budget (1 dollar sign)
- `"$$"` - Moderate (2 dollar signs)
- `"$$$"` - Upscale (3 dollar signs)
- `"$$$$"` - Very upscale (4 dollar signs)
- `"N/A"` or missing - No price data available

## 4. Complete Flow Example

### Example 1: "cheap Italian"
1. **Query:** "cheap Italian"
2. **Claude extracts:** `priceLevel: "budget"`
3. **Filter matches:** Restaurants with `price_display: "$"` or `"$$"`
4. **Result:** Only budget-friendly Italian restaurants

### Example 2: "upscale French"
1. **Query:** "upscale French"
2. **Claude extracts:** 
   - `priceLevel: "upscale"`
   - `vibeKeywords: ["upscale"]`
3. **Filter matches:** Restaurants with `price_display: "$$$"` or `"$$$$"`
4. **Result:** Only high-end French restaurants

### Example 3: "expensive Japanese"
1. **Query:** "expensive Japanese"
2. **Claude extracts:** `priceLevel: "upscale"`
3. **Filter matches:** Restaurants with `price_display: "$$$"` or `"$$$$"`
4. **Result:** Only high-end Japanese restaurants

### Example 4: "Italian in Brooklyn" (no price mention)
1. **Query:** "Italian in Brooklyn"
2. **Claude extracts:** `priceLevel: undefined`
3. **Filter matches:** All restaurants (no price filtering)
4. **Result:** All Italian restaurants in Brooklyn, regardless of price

## 5. Golden Dataset Mapping

In `golden_queries_clean.json`, expected priceLevel values use **numeric format**:
- `1` = "budget"
- `2` = "moderate"
- `3` = "upscale"
- `4` = "upscale" (very expensive, also maps to upscale)

The `normalizePriceLevel()` function in the eval converts between numeric and string formats for comparison.

## 6. Edge Cases

1. **Overlapping ranges:**
   - `"$$"` matches both "budget" and "moderate"
   - `"$$$"` matches both "moderate" and "upscale"
   - This is intentional - provides flexibility in matching

2. **Missing price data:**
   - Budget queries exclude restaurants without price data
   - Moderate/upscale queries include restaurants without price data

3. **Vague queries:**
   - "something nice" → infers "moderate"
   - "romantic Italian" → no price inference (priceLevel: undefined)

