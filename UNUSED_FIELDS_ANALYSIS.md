# Unused Metadata Fields Analysis

This document lists all metadata fields in the Restaurant interface that are **NOT** used in:
- `api/services/filterService.ts` (filtering logic)
- UI components (`src/components/`)
- Photo utilities (`src/utils/photoUtils.ts`)

## Fields Used in Filtering/UI

### Used in filterService.ts:
- `city`
- `original_place.properties.location.address`
- `google_data.rating`
- `google_data.userRatingCount`
- `cynthias_pick`
- `google_data.primaryType`
- `specific_type`
- `google_data.types`
- `google_data.displayName.text`
- `google_data.generativeSummary.overview.text`
- `google_data.reviewSummary.text.text`
- `google_data.editorialSummary.text`
- `neighborhood_extracted`
- `borough`
- `google_data.formattedAddress`
- `google_data.landmarks`
- `price_display`
- `google_data.takeout`
- `google_data.servesCoffee`
- `google_data.servesBrunch`
- `google_data.servesBreakfast`
- `google_data.servesLunch`
- `google_data.servesDinner`
- `vibe_tags`
- `occasion_tags`
- `noise_level`
- `special_features`
- `accolades_tags`
- `google_data.currentSecondaryOpeningHours` (used for brunch matching)

### Used in UI:
- `google_data.displayName.text`
- `google_data.types[0]`
- `google_data.rating`
- `google_data.formattedAddress`
- `cynthias_pick`
- `google_data.primaryType`
- `neighborhood_extracted`
- `price_display`
- `google_data.editorialSummary.text`
- `google_data.generativeSummary.overview.text`
- `google_place_id` (for photo mapping)

---

## UNUSED FIELDS (Safe to Remove)

### From `original_place`:
1. **`original_place.geometry`** (entire object)
   - `geometry.coordinates` - [number, number] lat/lng
   - `geometry.type` - string

2. **`original_place.properties.google_maps_url`** - string

3. **`original_place.properties.location.country_code`** - string

### From `google_data`:
4. **`google_data.priceRange`** (entire object)
   - `priceRange.startPrice.units` - string
   - `priceRange.endPrice.units` - string
   - Note: `price_display` is used instead

5. **`google_data.regularOpeningHours`** (entire object)
   - `regularOpeningHours.periods` - array
   - `regularOpeningHours.weekdayDescriptions` - string[]
   - Note: Only `currentSecondaryOpeningHours` is used for brunch matching

6. **`google_data.shortFormattedAddress`** - string
   - Note: `formattedAddress` is used instead

7. **`google_data.addressComponents`** - array
   - Array of address component objects

8. **`google_data.delivery`** - boolean
   - Note: Only `takeout` is used

9. **`google_data.dineIn`** - boolean

10. **`google_data.servesBeer`** - boolean

11. **`google_data.servesWine`** - boolean

12. **`google_data.servesCocktails`** - boolean

13. **`google_data.servesDessert`** - boolean

14. **`google_data.servesVegetarianFood`** - boolean

15. **`google_data.reviews`** (entire array)
   - Array of review objects with `rating` and `text.text`
   - Note: Only `reviewSummary` is used

16. **`google_data.photos`** (entire array)
   - Array of photo metadata objects
   - Note: Photos are accessed via `photo-mapping.json` file instead

17. **`google_data.priceLevel`** - string
   - Note: This appears in `ResultCard.tsx` but should probably use `price_display` instead
   - Currently shows `PRICE_LEVEL_INEXPENSIVE`, `PRICE_LEVEL_MODERATE`, etc.
   - But `price_display` is the actual field used everywhere else

### From top-level Restaurant fields:
18. **`place_classification`** - string

19. **`crowd_tags`** - string[]

20. **`service_tags`** - string[]

21. **`food_quality_tags`** - string[]

22. **`value_tag`** - string

23. **`booking_tags`** - string[]

24. **`negative_tags`** - string[]

---

## Summary

**Total unused fields: 24**

These fields can be safely removed to reduce the data file size. The largest space savings will likely come from:
- `google_data.reviews` (array of review objects)
- `google_data.photos` (array of photo metadata - though photos are stored separately)
- `google_data.regularOpeningHours` (complex nested structure)
- `original_place.geometry` (coordinates)
- `google_data.addressComponents` (array of address components)

---

## Note on `google_data.priceLevel`

The `ResultCard.tsx` component currently uses `restaurant.google_data.priceLevel`, but this field may not exist in all restaurants. The component should probably use `restaurant.price_display` instead for consistency. This is a bug that should be fixed separately.

