# Using Braintrust UI for Rapid Prompt Testing

This guide shows you how to test and iterate on your Claude prompt directly in Braintrust's UI without writing code.

## 🎯 Quick Setup

### Step 1: Extract Your Prompt Template

The prompt in `api/services/parseQuery.ts` has a dynamic part (`USER QUERY: "${query}"`). For Braintrust UI, you'll use a template with variables.

### Step 2: Create a Dataset in Braintrust UI

1. Go to https://www.braintrustdata.com
2. Navigate to your project (or create one: "curated-by-cynthia")
3. Click **"Datasets"** in the left sidebar
4. Click **"New Dataset"**
5. Name it: `"Query Parsing Test Cases"`
6. Add your test cases as rows:

| query | city | expected_output |
|-------|------|-----------------|
| street food in Seoul | Seoul | `{"cuisineType": "korean", "priceLevel": "budget", "vibeKeywords": ["casual"], "cuisineSpecialty": null, "city": "seoul"}` |
| pizza in Manhattan | NYC | `{"cuisineType": "italian", "cuisineSpecialty": "pizza", "city": "nyc"}` |
| omakase in Tokyo | Tokyo | `{"cuisineType": "japanese", "cuisineSpecialty": "sushi", "priceLevel": "luxury", "city": "tokyo"}` |

**Tip**: You can also upload a CSV or JSON file with your test cases.

### Step 3: Create a Prompt in Braintrust UI

1. Go to **"Prompts"** in the left sidebar
2. Click **"New Prompt"**
3. Name it: `"Restaurant Query Parser"`
4. Select model: **Claude Sonnet 4** (or your preferred model)
5. Paste the prompt template (see below)
6. Use `{{query}}` and `{{city}}` as variables

### Step 4: Create an Eval in Braintrust UI

1. Go to **"Evals"** in the left sidebar
2. Click **"New Eval"**
3. Configure:
   - **Name**: "Query Parser - UI Testing"
   - **Dataset**: Select your dataset from Step 2
   - **Prompt**: Select your prompt from Step 3
   - **Scorer**: You can add custom scorers or use built-in ones

### Step 5: Run and Iterate

1. Click **"Run"** to test your prompt
2. View results in the UI
3. Edit the prompt directly in the UI
4. Re-run to see improvements
5. Compare different prompt versions side-by-side

## 📋 Prompt Template for Braintrust UI

Here's your prompt formatted for Braintrust UI (with `{{query}}` and `{{city}}` variables):

```
You are parsing a restaurant search query into structured data. Extract all relevant information from the user's query.

CRITICAL: If the query is NOT related to restaurant search (e.g., weather, time, general questions, jokes, etc.), you MUST return an error by setting "error": "NOT_RESTAURANT_QUERY" in your response. Do NOT attempt to extract keywords for non-restaurant queries.

USER QUERY: "{{query}}"
CITY: "{{city}}"

Extract the following information:
- Location (neighborhood, borough, city): Extract any location mentions.
  * Borough (NYC ONLY): For NYC queries, extract borough names ("manhattan", "brooklyn") as the "borough" field. Support single borough or array for multiple (e.g., "Manhattan or Brooklyn" -> borough: ["manhattan", "brooklyn"]). Borough only applies to NYC - do NOT extract borough for other cities.
  * Neighborhood: Extract neighborhood/district names for all cities. Support single neighborhood or array for multiple (e.g., "Shibuya or Ginza" -> neighborhood: ["shibuya", "ginza"]). Examples: "West Village", "Shibuya", "Ginza", "Gangnam", "7th arrondissement".
  * City: Extract city name ("nyc", "tokyo", "seoul", "paris"). The city is also provided as a parameter, so always include it in the output.
  Examples:
  * "pizza in Manhattan" (NYC) -> borough: "manhattan", city: "nyc"
  * "pizza in Manhattan or Brooklyn" (NYC) -> borough: ["manhattan", "brooklyn"], city: "nyc"
  * "Korean BBQ in Manhattan" (NYC) -> borough: "manhattan", city: "nyc"
  * "ramen in Shibuya" (Tokyo) -> neighborhood: "shibuya", city: "tokyo"
  * "Shibuya or Ginza" (Tokyo) -> neighborhood: ["shibuya", "ginza"], city: "tokyo"

- Cuisine type: Extract BROAD cuisine category (e.g., "japanese", "italian", "chinese", "french", "korean"). This is the general cuisine category.

- Cuisine specialty: Extract SPECIFIC DISH or SPECIALTY if mentioned. This is open-ended - extract any dish name the user mentions. The filterService uses flexible matching against restaurant metadata, names, and descriptions. 

IMPORTANT: Some phrases describe DINING STYLE, not specific dishes. For these, extract to priceLevel/vibeKeywords instead of cuisineSpecialty:
  * "street food" / "street food stalls" -> priceLevel: "budget", vibeKeywords: ["casual"], cuisineSpecialty: null
  * "fast food" -> priceLevel: "budget", vibeKeywords: ["casual"], cuisineSpecialty: null
  * "food truck" -> priceLevel: "budget", vibeKeywords: ["casual"], cuisineSpecialty: null
  * "fine dining" -> priceLevel: "luxury", vibeKeywords: ["upscale", "sophisticated"], cuisineSpecialty: null
  * "casual dining" -> priceLevel: "moderate", vibeKeywords: ["casual"], cuisineSpecialty: null

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
  * "street food in Seoul" -> cuisineType: "korean", priceLevel: "budget", vibeKeywords: ["casual"], cuisineSpecialty: null
  * "Italian restaurants" -> cuisineType: "italian", cuisineSpecialty: null

- Meal type: Extract meal time preference ("breakfast", "brunch", "lunch", "dinner", or null). IMPORTANT: "late night", "late-night", "late night bites" should be extracted as occasionType: "late_night", NOT as mealType.

- Price level: Extract price preference ("budget", "moderate", "upscale", "luxury", "any", or undefined). IMPORTANT: 
  * Words like "expensive", "luxury", "high-end", "premium", "fine dining" should be extracted as priceLevel: "luxury" (which maps to ONLY $$$$ restaurants, not $$$).
  * Words like "upscale", "fancy" should be extracted as priceLevel: "upscale" (which maps to both $$$ and $$$$ restaurants).
  Examples:
  * "expensive restaurant" -> priceLevel: "luxury"
  * "luxury dining" -> priceLevel: "luxury"
  * "high-end sushi" -> priceLevel: "luxury"
  * "fine dining" -> priceLevel: "luxury"
  * "premium restaurant" -> priceLevel: "luxury"
  * "upscale French" -> priceLevel: "upscale"
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
  * "iconic_venue": "iconic", "famous", "legendary", "must-visit", "landmark restaurant"
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
- If a query mentions "instagram", "photogenic", or "nice pictures", include BOTH specialFeatures: ["instagrammable"] AND requiresInstagrammable: true (for backward compatibility)
- "hidden gems", "locals love", "local favorite", "off the beaten path" should extract specialFeatures: ["hidden_gem"]
- Be smart about synonyms: "cash only" = "cash_only", "chef's restaurant" = "chef_driven", "patio" = "outdoor_seating", etc.

IMPORTANT RULES:
1. Be precise - only extract information explicitly mentioned or strongly implied
2. For vague queries, make reasonable inferences based on common interpretations (see "HANDLING VAGUE QUERIES" above)
3. For cuisine descriptors like "traditional", "authentic", "modern", etc., include them as part of the cuisine context but don't extract as separate fields
4. Never extract "cynthia's favorites" or related phrases as neighborhoods
5. City names: Extract as city field ("nyc", "tokyo", "seoul", "paris", or undefined). NOTE: The city is also provided as a parameter, so always include it in the output.
6. Borough (NYC ONLY): Extract borough names ("manhattan", "brooklyn") for NYC queries. Can be single string or array of strings. Do NOT extract borough for other cities.
7. Neighborhoods: Extract neighborhood/district names for all cities. Can be single string or array of strings. For NYC, use neighborhood for areas like "West Village", "SoHo", "Chinatown", etc. (not boroughs).
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
```

## 🔄 Workflow: Rapid Iteration

1. **Edit prompt in UI** → Make changes directly in Braintrust
2. **Run eval** → Click "Run" to test
3. **View results** → See which test cases pass/fail
4. **Compare versions** → Use "Compare" to see before/after
5. **Copy back to code** → Once satisfied, copy the final prompt to `parseQuery.ts`

## 💡 Pro Tips

- **Use variables**: `{{query}}` and `{{city}}` will be replaced with dataset values
- **Add test cases quickly**: Just add rows to your dataset in the UI
- **Version control**: Braintrust automatically tracks prompt versions
- **A/B testing**: Create multiple prompt versions and compare them side-by-side
- **Export results**: Download results as CSV/JSON for analysis

## 📊 Example Dataset Format

You can create a CSV file and upload it:

```csv
query,city,expected_output
street food in Seoul,Seoul,"{""cuisineType"": ""korean"", ""priceLevel"": ""budget"", ""vibeKeywords"": [""casual""], ""cuisineSpecialty"": null, ""city"": ""seoul""}"
pizza in Manhattan,NYC,"{""cuisineType"": ""italian"", ""cuisineSpecialty"": ""pizza"", ""city"": ""nyc""}"
omakase in Tokyo,Tokyo,"{""cuisineType"": ""japanese"", ""cuisineSpecialty"": ""sushi"", ""priceLevel"": ""luxury"", ""city"": ""tokyo""}"
```

Then upload this CSV to create your dataset!

