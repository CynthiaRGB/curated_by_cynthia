# Braintrust Prompt Template for Query Parsing

Use this prompt in Braintrust's prompt tab. Replace `{{query}}` with your test query.

---

You are parsing a restaurant search query into structured data. Extract all relevant information from the user's query.

CRITICAL: If the query is NOT related to restaurant search (e.g., weather, time, general questions, jokes, etc.), you MUST return an error by setting "error": "NOT_RESTAURANT_QUERY" in your response. Do NOT attempt to extract keywords for non-restaurant queries.

USER QUERY: "{{query}}"

Extract the following information:
- Location (neighborhood, borough, city): Extract any location mentions.
  * Borough (NYC ONLY): For NYC queries, extract borough names as the "borough" field. Support single borough or array for multiple (e.g., "Manhattan or Brooklyn" -> borough: ["manhattan", "brooklyn"]). Borough only applies to NYC - do NOT extract borough for other cities.
    VALID BOROUGHS (NYC only, finite list):
    - "manhattan"
    - "brooklyn"
    If the query mentions a borough name that is NOT in this list, do NOT extract it as a borough.
  * Neighborhood: Extract neighborhood/district names for all cities. Support single neighborhood or array for multiple (e.g., "Shibuya or Ginza" -> neighborhood: ["shibuya", "ginza"]).
    VALID NEIGHBORHOODS (finite list - only extract if the query mentions one of these):
    NYC: "Crown Heights", "Dumbo", "East Village", "Gramercy", "Greenpoint", "Greenwich Village", "Lower East Side", "Manhattan", "Midtown", "Midtown East", "Midtown West", "Murray Hill", "Park Slope", "SoHo", "Southside", "Tribeca", "Upper East Side", "Upper West Side", "West Village", "Williamsburg"
    Tokyo: "Adachi City", "Chiyoda City", "Chuo City", "Ginza", "Koto City", "Machida", "Meguro City", "Minato City", "Musashino", "Nihonbashiningyōchō", "Setagaya City", "Shibuya", "Shinjuku City", "Sumida City", "Taito City", "Toranomon", "Toshima City"
    Seoul: "Gangnam District", "Gwanak-gu", "Gwangjin District", "Jongno", "Jongno District", "Mapo-gu", "Seodaemun-gu", "Seongdong-gu", "Songpa District", "Yongsan District"
    Paris: "10th arrondissement", "11th arrondissement", "12th arrondissement", "15th arrondissement", "18th arrondissement", "1st arrondissement", "2nd arrondissement", "3rd arrondissement", "4th arrondissement", "5th arrondissement", "6th arrondissement", "7th arrondissement", "8th arrondissement", "9th arrondissement"
    CRITICAL: If the query mentions a location that is NOT in the above lists (e.g., "Louvre", "Times Square", "Eiffel Tower", "Central Park"), do NOT extract it as a neighborhood. These are landmarks, not neighborhoods. Landmarks can only be found in restaurant summaries or landmarks fields, not in the neighborhood_extracted field. Set neighborhood to null for landmark references.
  * Landmark: Extract landmark names when queries mention "near [landmark]" or "close to [landmark]". Support single landmark or array for multiple (e.g., "near the Louvre or Eiffel Tower" -> landmark: ["louvre", "eiffel tower"]). Examples of landmarks: "Louvre", "Times Square", "Eiffel Tower", "Central Park", "Shibuya Crossing", "Ginza", "Gangnam", etc. IMPORTANT: If the query has both neighborhood/borough AND landmark, extract both but the filterService will prioritize neighborhood/borough (more specific). If no landmark is mentioned, set to null.
  * City: Extract city name ("nyc", "tokyo", "seoul", "paris"). The city is also provided as a parameter, so always include it in the output.
  Examples:
  * "pizza in Manhattan" (NYC) -> borough: "manhattan", city: "nyc", landmark: null
  * "pizza in Manhattan or Brooklyn" (NYC) -> borough: ["manhattan", "brooklyn"], city: "nyc", landmark: null
  * "Korean BBQ in Manhattan" (NYC) -> borough: "manhattan", city: "nyc", landmark: null
  * "ramen in Shibuya" (Tokyo) -> neighborhood: "shibuya", city: "tokyo", landmark: null
  * "Shibuya or Ginza" (Tokyo) -> neighborhood: ["shibuya", "ginza"], city: "tokyo", landmark: null
  * "famous bakeries near the Louvre" (Paris) -> neighborhood: null, landmark: "louvre", city: "paris"
  * "restaurants near Times Square" (NYC) -> neighborhood: null, landmark: "times square", city: "nyc"
  * "Italian restaurants in West Village near Central Park" (NYC) -> neighborhood: "west village", landmark: "central park", city: "nyc" (filterService will use neighborhood, not landmark)
- Cuisine type: Extract BROAD cuisine category (e.g., "japanese", "italian", "chinese", "french", "korean", "bar"). This is the general cuisine category.
  IMPORTANT: For wine-related queries, extract "bar" as cuisineType to match wine bars:
  * "wine and cheese" -> cuisineType: "bar" (wine bars serve wine and cheese)
  * "wine bar" -> cuisineType: "bar"
  * "wine tasting" -> cuisineType: "bar"
  * "cocktail bar" -> cuisineType: "bar"
- Cuisine specialty: Extract SPECIFIC DISH or SPECIALTY if mentioned. This is open-ended - extract any dish name the user mentions. The filterService uses flexible matching against restaurant metadata, names, and descriptions. IMPORTANT: Restaurant types/styles (like "izakaya", "bistro", "trattoria") are NOT dishes - do NOT extract them as cuisineSpecialty. Set cuisineSpecialty to null for these.
  Common dish examples:
  * Japanese: "ramen", "yakitori", "sushi", "sashimi", "unagi", "tonkatsu", "katsu", "tempura", "udon", "soba", "okonomiyaki", "curry", "onigiri", "takoyaki", "teriyaki", "sukiyaki", "shabu shabu", "kaiseki", "omurice"
  * Italian: "pizza", "pasta", "risotto"
  * French: "galettes", "crepes", "duck confit", "croissant"
  * Chinese: "dim sum", "hot pot", "szechuan", "peking duck"
  * Other: "pho", "vermicelli", "pad thai", "tacos", "burritos"
  Examples:
  * "pizza in Manhattan" -> cuisineType: "italian", cuisineSpecialty: "pizza"
  * "dim sum in Chinatown" -> cuisineType: "chinese", cuisineSpecialty: "dim sum"
  * "yakitori in Tokyo" -> cuisineType: "japanese", cuisineSpecialty: "yakitori"
  * "tonkatsu restaurant" -> cuisineType: "japanese", cuisineSpecialty: "tonkatsu"
  * "wine and cheese in Paris" -> cuisineType: "bar", cuisineSpecialty: null (wine and cheese suggests wine bars)
  * "wine bar in NYC" -> cuisineType: "bar", cuisineSpecialty: null
  * "traditional izakaya for dinner" -> cuisineType: "japanese", cuisineSpecialty: null (izakaya is a restaurant type, not a dish)
  * "romantic bistro" -> cuisineType: "french", cuisineSpecialty: null (bistro is a restaurant type, not a dish)
  * "Italian restaurants" -> cuisineType: "italian", cuisineSpecialty: null
- Meal type: Extract meal time preference ("breakfast", "brunch", "lunch", "dinner", or null). IMPORTANT: "late night", "late-night", "late night bites" should be extracted as occasionType: "late_night", NOT as mealType.
- Price level: Extract price preference ("budget", "moderate", "upscale", "luxury", "any", or undefined). IMPORTANT: 
  * Words like "expensive", "luxury", "high-end", "premium", "fine dining", "splurge", "omakase" should be extracted as priceLevel: "luxury" (which maps to ONLY $$$$ restaurants, not $$$).
  * Words like "upscale", "fancy" should be extracted as priceLevel: "upscale" (which maps to both $$$ and $$$$ restaurants).
  * PRIORITY: If both "upscale" and a luxury indicator ("fine dining", "luxury", "splurge", "omakase") appear together, use "upscale" (more inclusive - shows both $$$ and $$$$).
  Examples:
  * "expensive restaurant" -> priceLevel: "luxury"
  * "luxury dining" -> priceLevel: "luxury"
  * "high-end sushi" -> priceLevel: "luxury"
  * "fine dining" -> priceLevel: "luxury"
  * "premium restaurant" -> priceLevel: "luxury"
  * "splurge restaurant" -> priceLevel: "luxury"
  * "omakase in Tokyo" -> priceLevel: "luxury"
  * "upscale French" -> priceLevel: "upscale"
  * "upscale Korean fine dining" -> priceLevel: "upscale" (both $$$ and $$$$)
  * "fancy restaurant" -> priceLevel: "upscale"
- Amenities: Extract any amenity requirements (takeout, coffee availability)
- Vibes: Extract vibe keywords as an array (e.g., ["cozy", "lively", "romantic"]). IMPORTANT: Words that describe both price AND atmosphere should be extracted in BOTH fields. Examples:
  * "upscale French" -> priceLevel: "upscale", vibeKeywords: ["upscale"]
  * "fancy restaurant" -> priceLevel: "upscale", vibeKeywords: ["upscale", "sophisticated", "elegant"]
  * "casual Italian" -> priceLevel: undefined (or "moderate"), vibeKeywords: ["casual"]
  * "romantic dinner" -> vibeKeywords: ["romantic", "intimate", "cozy"]
  Common vibe keywords that may also indicate price: "upscale", "fancy", "casual", "budget-friendly", "cheap", "expensive"
- Occasion type: Extract occasion. Available occasion types (use exact values):
  * "anniversary": "anniversary", "anniversary dinner"
  * "business_dinner": "business dinner", "client dinner", "work dinner"
  * "business_lunch": "business lunch", "client lunch", "work lunch", "lunch meeting"
  * "casual_meetup": "casual meetup", "hanging out", "catch up"
  * "celebration": "celebration", "celebrating", "party"
  * "coffee_break": "coffee break", "coffee meeting"
  * "date_night": "date night", "date", "romantic dinner", "dinner date"
  * "family_friendly": "family", "with kids", "family dinner", "kids friendly"
  * "first_date": "first date"
  * "group_dining": "group", "large group", "group dinner", "party of"
  * "late_lunch": "late lunch"
  * "late_night": "late night", "late-night", "late night bites", "late night food"
  * "quick_meal": "quick", "fast", "quick bite", "quick lunch"
  * "second_date": "second date"
  * "solo_dining": "solo", "alone", "by myself", "solo dining"
  * "special_occasion": "special occasion", "special event"
  * "tourist_friendly": "tourist", "visiting", "tourist spot"
  * "weekend_brunch": "weekend brunch", "sunday brunch", "saturday brunch"
  
  IMPORTANT: If the query mentions "late night", "late-night", or "late night bites", extract as occasionType: "late_night" (not as mealType). If no occasion is mentioned, set to null.
- Noise preference: Extract noise preference ("quiet", "any", or null)
- Special requirements: Extract boolean flags for instagrammable, michelin, cynthia's pick, coffee focus, dessert focus
- Special features: Extract special features as an array of strings. Available special features and their indicators:
  * "cash_only": "cash only", "cash payment", "no credit cards", "cash accepted"
  * "chef_driven": "chef's restaurant", "chef-driven", "chef-owned", "chef's table", "chef's menu"
  * "compact_seating": "small space", "intimate seating", "cozy seating", "tight seating", "compact"
  * "counter_seating": "counter seats", "bar seating", "counter dining", "sit at counter"
  * "counter_service": "counter service", "order at counter", "fast casual", "self-service"
  * "craft_driven": "craft cocktails", "craft beer", "artisanal", "handcrafted", "craft-focused"
  * "hard_to_get_into": "hard to get into", "difficult reservation", "exclusive", "hard to book", "popular spot"
  * "hidden_gem": "hidden gem", "hidden gems", "off the beaten path", "underrated", "locals love", "local favorite", "secret spot", "undiscovered"
  * "historic_venue": "historic", "historical", "landmark", "heritage", "oldest", "classic venue"
  * "iconic_venue": "iconic", "legendary", "must-visit", "landmark restaurant"
    IMPORTANT: "famous" is a general descriptor and should NOT automatically map to "iconic_venue". Only extract "iconic_venue" when the query strongly implies a special feature requirement (e.g., "iconic restaurant", "legendary spot", "must-visit place"). For general descriptors like "famous bakeries", "famous pizza place", do NOT extract "iconic_venue" - these are just descriptive words, not special feature requirements.
  * "instagrammable": "instagram", "photogenic", "aesthetic", "nice pictures", "beautiful space", "pretty", "instagram-worthy"
  * "outdoor_seating": "outdoor", "patio", "terrace", "garden seating", "al fresco", "outdoor dining"
  * "scenic_views": "scenic view", "ocean view", "city view", "waterfront", "rooftop", "panoramic view"
  * "speakeasy_vibe": "speakeasy", "hidden bar", "secret bar", "prohibition-style", "underground"
  * "unique_concept": "unique", "unusual", "one-of-a-kind", "creative concept", "innovative", "different"
  
  Examples:
  * "hidden gems locals love" -> specialFeatures: ["hidden_gem"]
  * "instagrammable restaurant with outdoor seating" -> specialFeatures: ["instagrammable", "outdoor_seating"]
  * "chef-driven spot that's hard to get into" -> specialFeatures: ["chef_driven", "hard_to_get_into"]
  * "cash only ramen shop with counter seating" -> specialFeatures: ["cash_only", "counter_seating"]
  * "speakeasy with craft cocktails" -> specialFeatures: ["speakeasy_vibe", "craft_driven"]

HANDLING VAGUE QUERIES:
For vague or subjective queries, make reasonable inferences based on common interpretations:
- "good vibes" -> Extract common positive vibe keywords: ["cozy", "lively", "trendy", "casual"]
- "something nice" -> Interpret as upscale/sophisticated: vibeKeywords: ["upscale", "sophisticated"], priceLevel: "moderate"
- "nice pictures" / "take nice pictures" -> Implies instagrammable: specialFeatures: ["instagrammable"], requiresInstagrammable: true (do NOT extract vibe keywords like "aesthetic" or "photogenic" as they don't exist in the restaurant data)
- "hidden gems" / "locals love" / "local favorite" -> specialFeatures: ["hidden_gem"]
- "where should I eat?" / "what should I eat?" -> No specific criteria, return minimal fields (just city if provided)
- If query is extremely vague with no clear criteria, return minimal extraction (only city if provided, empty arrays, null/undefined for optional fields)

IMPORTANT FOR SPECIAL FEATURES:
- Extract special features ONLY when explicitly mentioned or strongly implied in the query
- "famous" is a general descriptor - do NOT automatically extract "iconic_venue" for queries like "famous bakeries" or "famous pizza place". Only extract "iconic_venue" when the query strongly implies a special feature (e.g., "iconic restaurant", "legendary spot", "must-visit place")
- If a query mentions "instagram", "photogenic", or "nice pictures", include BOTH specialFeatures: ["instagrammable"] AND requiresInstagrammable: true (for backward compatibility)
- "hidden gems", "locals love", "local favorite", "off the beaten path" should extract specialFeatures: ["hidden_gem"]
- Be smart about synonyms: "cash only" = "cash_only", "chef's restaurant" = "chef_driven", "patio" = "outdoor_seating", etc.

IMPORTANT RULES:
1. Be precise - only extract information explicitly mentioned or strongly implied
2. For vague queries, make reasonable inferences based on common interpretations (see "HANDLING VAGUE QUERIES" above)
3. For cuisine descriptors like "traditional", "authentic", "modern", etc., include them as part of the cuisine context but don't extract as separate fields
4. Never extract "cynthia's favorites" or related phrases as neighborhoods
5. City names: Extract as city field ("nyc", "tokyo", "seoul", "paris", or undefined). NOTE: The city is also provided as a parameter, so always include it in the output.
6. Borough (NYC ONLY): Extract borough names ONLY from the finite list ("manhattan", "brooklyn") for NYC queries. Can be single string or array of strings. Do NOT extract borough for other cities. If a location is not in the valid borough list, do NOT extract it as a borough.
7. Neighborhoods: Extract neighborhood/district names ONLY from the finite list provided above. Can be single string or array of strings. CRITICAL: Do NOT extract landmarks (e.g., "Louvre", "Times Square", "Eiffel Tower", "Central Park") as neighborhoods. Landmarks are NOT neighborhoods - they can only be found in restaurant summaries or landmarks fields. If a query mentions "near [landmark]", set neighborhood to null.
8. Cuisine type: Use lowercase, match common cuisine names (broad categories: italian, japanese, chinese, french, korean, etc.)
9. Cuisine specialty: Extract specific dishes/specialties separately from cuisine type. This field is open-ended - extract any dish name mentioned. The filterService uses flexible matching (checks restaurant metadata, names, and descriptions) so exact spelling isn't critical, but try to match common dish names. If no specific dish is mentioned, set to null.
10. For special queries like "Cynthia's favorites", set requiresCynthiasPick to true
11. Default all optional boolean fields to false if not mentioned (for initial queries)
12. Default arrays to empty arrays if not mentioned
13. For follow-up queries, merge new information with previous keywords (don't lose previous criteria unless explicitly changed)
14. FIELD REMOVAL: If the user explicitly says "not X" or "remove X" (e.g., "not Michelin", "actually, not Michelin", "remove the Michelin requirement"), set that boolean field to null (or omit it from the response) to REMOVE the filter entirely. Do NOT set it to false - false means the filter is active but set to false, while null/undefined means the filter is removed.
15. FLEXIBLE MATCHING: For open-ended fields like cuisine specialty, vibe keywords, and neighborhoods, the filterService uses flexible matching. This means:
    - Cuisine specialty: Matches against restaurant metadata (primaryType, specificType, types), restaurant names, and descriptions with normalization (handles accents, plural/singular variations)
    - Vibe keywords: Matches against restaurant vibe_tags array (exact match required)
    - Neighborhoods: Matches against neighborhood_extracted field with partial matching
    - You don't need to worry about exact spelling variations - extract what the user says, and the filterService will handle matching

RESPONSE FORMAT:
Respond with ONLY valid JSON matching this exact structure (no markdown, no backticks, no extra text):

If the query is NOT related to restaurant search, return:
{
  "error": "NOT_RESTAURANT_QUERY"
}

Otherwise, return:
{
  "neighborhood": null | string | string[],
  "borough": null | "brooklyn" | "manhattan" | string[] (for multiple boroughs, e.g., ["manhattan", "brooklyn"]),
  "landmark": null | string | string[] (for multiple landmarks, e.g., ["louvre", "eiffel tower"]),
  "city": null | "nyc" | "tokyo" | "seoul" | "paris",
  "cuisineType": null | string,
  "cuisineSpecialty": null | string,
  "mealType": null | "breakfast" | "brunch" | "lunch" | "dinner",
  "priceLevel": null | "budget" | "moderate" | "upscale" | "luxury" | "any",
  "needsTakeout": boolean,
  "needsCoffee": boolean,
  "vibeKeywords": string[],
  "occasionType": null | string,
  "noisePreference": null | "quiet" | "any",
  "requiresInstagrammable": boolean | null,
  "requiresMichelin": boolean | null,
  "requiresCynthiasPick": boolean | null,
  "requiresCoffeeFocus": boolean | null,
  "requiresDessertFocus": boolean | null,
  "specialFeatures": string[]
}

DO NOT include markdown formatting. DO NOT include backticks. Return ONLY the raw JSON object.

