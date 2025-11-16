# Claude Prompt for Parsing Vibe-Related Tags

## Main Vibe Extraction Instruction

```
- Vibes: Extract vibe keywords as an array (e.g., ["cozy", "lively", "romantic"]). 
  IMPORTANT: Words that describe both price AND atmosphere should be extracted in BOTH fields. 
  
  Examples:
  * "upscale French" -> priceLevel: "upscale", vibeKeywords: ["upscale"]
  * "fancy restaurant" -> priceLevel: "upscale", vibeKeywords: ["upscale", "sophisticated", "elegant"]
  * "casual Italian" -> priceLevel: undefined (or "moderate"), vibeKeywords: ["casual"]
  * "romantic dinner" -> vibeKeywords: ["romantic", "intimate", "cozy"]
  
  Common vibe keywords that may also indicate price: "upscale", "fancy", "casual", "budget-friendly", "cheap", "expensive"
```

## Vague Queries Handling (Vibe-Related)

```
HANDLING VAGUE QUERIES:
For vague or subjective queries, make reasonable inferences based on common interpretations:
- "good vibes" -> Extract common positive vibe keywords: ["cozy", "lively", "trendy", "casual"]
- "something nice" -> Interpret as upscale/sophisticated: vibeKeywords: ["upscale", "sophisticated"], priceLevel: "moderate"
- "nice pictures" / "take nice pictures" -> Implies instagrammable: requiresInstagrammable: true, vibeKeywords: ["aesthetic", "photogenic"]
```

## Important Rules (Relevant to Vibes)

```
IMPORTANT RULES:
1. Be precise - only extract information explicitly mentioned or strongly implied
2. For vague queries, make reasonable inferences based on common interpretations (see "HANDLING VAGUE QUERIES" above)
3. For cuisine descriptors like "traditional", "authentic", "modern", etc., include them as part of the cuisine context but don't extract as separate fields
...
10. Default all optional boolean fields to false if not mentioned
11. Default arrays to empty arrays if not mentioned
```

## Response Format (Vibe Keywords Field)

```
{
  ...
  "vibeKeywords": string[],
  ...
}
```

## Key Points for Vibe Parsing

1. **Dual Extraction**: Words like "upscale", "fancy", "casual" should be extracted in BOTH `priceLevel` AND `vibeKeywords` when they appear in the query.

2. **Array Format**: `vibeKeywords` is always an array, even if it contains a single keyword.

3. **Default Value**: If no vibe keywords are mentioned, return an empty array `[]`.

4. **Vague Queries**: For subjective queries like "good vibes" or "something nice", Claude should infer reasonable vibe keywords.

5. **Multiple Keywords**: Can extract multiple vibe keywords (e.g., `["romantic", "intimate", "cozy"]`).

6. **Matching Against Data**: The extracted vibe keywords will be matched against `restaurant.vibe_tags` array in the data file using exact string matching (case-insensitive).

## Example Queries and Expected Output

### Query: "upscale French for business lunch in Midtown"
```json
{
  "cuisineType": "french",
  "priceLevel": "upscale",
  "vibeKeywords": ["upscale"],
  "occasionType": "business_lunch",
  "neighborhood": ["midtown"],
  "mealType": "lunch",
  "city": "nyc"
}
```

### Query: "romantic Italian in West Village"
```json
{
  "cuisineType": "italian",
  "vibeKeywords": ["romantic", "intimate", "cozy"],
  "neighborhood": ["west village"],
  "city": "nyc"
}
```

### Query: "good vibes"
```json
{
  "vibeKeywords": ["cozy", "lively", "trendy", "casual"],
  "city": "nyc"
}
```

### Query: "casual Italian"
```json
{
  "cuisineType": "italian",
  "priceLevel": "moderate",  // or undefined
  "vibeKeywords": ["casual"],
  "city": "nyc"
}
```

