# Address Fields Usage Analysis

## Address Fields in Data

### Field Occurrences:
1. **`google_data.formattedAddress`**: 5 occurrences (only 5 restaurants have it!)
2. **`google_data.shortFormattedAddress`**: 279 occurrences (all restaurants)
3. **`google_data.postalAddress`**: 279 occurrences (all restaurants)
4. **`google_data.addressComponents`**: 0 occurrences (already removed)
5. **`google_data.adrFormatAddress`**: 0 occurrences (already removed)
6. **`original_place.properties.location.address`**: 277 occurrences (almost all restaurants)

---

## Fields USED in Code

### 1. `google_data.formattedAddress` ✅ **KEEP**
- **Used in UI**: `ResultCard.tsx` line 90 - displays address in result cards
- **Used in filterService**: `filterService.ts` line 409 - used for landmark matching
- **Problem**: Only 5 restaurants have this field! The UI would show `undefined` for 274 restaurants.
- **Recommendation**: Either:
  - Use `shortFormattedAddress` as fallback in UI: `restaurant.google_data.formattedAddress || restaurant.google_data.shortFormattedAddress`
  - Or keep both fields

### 2. `original_place.properties.location.address` ✅ **KEEP**
- **Used in filterService**: 
  - Line 68: City filtering (fallback when `restaurant.city` is missing)
  - Line 408: Landmark matching (combined with other text fields)
- **Used in enrichment script**: `add-restaurant-consolidated.cjs` line 416 - sets this field from `formattedAddress` or `adrFormatAddress`
- **Status**: Critical for filtering logic

---

## Fields NOT USED in Code (Safe to Delete)

### 3. `google_data.shortFormattedAddress` ❌ **SAFE TO DELETE**
- **Occurrences**: 279 (all restaurants)
- **Used in**: Nowhere in the codebase
- **Size**: ~15,066 bytes (14.7 KB)
- **Note**: Could be used as fallback for `formattedAddress` in UI, but currently not used

### 4. `google_data.postalAddress` ❌ **SAFE TO DELETE**
- **Occurrences**: 279 (all restaurants)
- **Used in**: Nowhere in the codebase
- **Size**: ~10,881 bytes (10.6 KB)
- **Structure**: Contains `regionCode`, `postalCode`, `administrativeArea`, `locality`, `addressLines`

### 5. `google_data.addressComponents` ❌ **ALREADY REMOVED**
- **Occurrences**: 0
- **Used in**: Only in `add-restaurant-consolidated.cjs` during enrichment (line 395-401) to extract country code
- **Status**: Not in final data file, only used during data processing

### 6. `google_data.adrFormatAddress` ❌ **ALREADY REMOVED**
- **Occurrences**: 0
- **Used in**: Only in `add-restaurant-consolidated.cjs` during enrichment (line 390) as fallback for `formattedAddress`
- **Status**: Not in final data file, only used during data processing

---

## Summary

### Fields to KEEP:
1. ✅ `google_data.formattedAddress` - Used in UI and filtering (but only 5 restaurants have it - potential bug!)
2. ✅ `original_place.properties.location.address` - Critical for city/landmark filtering

### Fields SAFE TO DELETE:
1. ❌ `google_data.shortFormattedAddress` - Not used anywhere (~14.7 KB)
2. ❌ `google_data.postalAddress` - Not used anywhere (~10.6 KB)
3. ❌ `google_data.addressComponents` - Already removed
4. ❌ `google_data.adrFormatAddress` - Already removed

### Total Safe to Delete:
- **~25,947 bytes (~25.3 KB)** from `shortFormattedAddress` + `postalAddress`

---

## ⚠️ Important Note

**UI Bug**: `ResultCard.tsx` uses `restaurant.google_data.formattedAddress`, but only 5 restaurants have this field. The UI would show `undefined` for 274 restaurants. Consider:
- Using `shortFormattedAddress` as fallback: `restaurant.google_data.formattedAddress || restaurant.google_data.shortFormattedAddress`
- Or keeping `shortFormattedAddress` until all restaurants have `formattedAddress`

