# No Hallucination Scorer Analysis

## Current Problem

The `no_hallucination` scorer is flagging valid, reasonable extractions as "hallucinations" when Claude returns more comprehensive results than the minimal expected output.

### Example: "anniversary dinner"

**Expected (minimal):**
```json
{
  "occasionType": "anniversary",
  "mealType": "dinner",
  "city": "nyc"
}
```

**Claude Output (comprehensive):**
```json
{
  "occasionType": "date_night",  // Wrong value, but handled by field_accuracy
  "mealType": "dinner",
  "city": "nyc",
  "vibeKeywords": ["romantic", "intimate", "upscale", "sophisticated"],  // Reasonable inference
  "priceLevel": "upscale"  // Reasonable inference
}
```

**Current Logic:**
- Flags `vibeKeywords` and `priceLevel` as hallucinations because they're not in expected
- But these are **valid schema fields** with **reasonable values**
- Not hallucinations - just more comprehensive than minimal expected

## What Should "Hallucination" Actually Mean?

A **real hallucination** would be:
- ✗ Field that does NOT exist in `ExtractedKeywords` schema (e.g., `"weather": "sunny"`)
- ✗ Completely irrelevant field (e.g., `"randomField": "value"`)

**NOT a hallucination:**
- ✓ Any field that exists in `ExtractedKeywords` schema
- ✓ Reasonable inferences (e.g., anniversary → romantic, upscale)
- ✓ More comprehensive extractions than minimal expected

## Current Logic Issues

1. **Too strict**: Flags any field not in expected, even if it's a valid schema field
2. **Redundant**: `field_accuracy` already measures correctness of expected fields
3. **Misleading**: Calls reasonable extractions "hallucinations"

## Proposed Solutions

### Option 1: Remove `no_hallucination` Scorer (RECOMMENDED)

**Pros:**
- `field_accuracy` already measures correctness
- No need for separate hallucination metric
- Simplifies evaluation
- Avoids false positives from comprehensive extractions

**Cons:**
- Lose ability to detect truly irrelevant fields (but this is rare)

### Option 2: Fix to Only Flag Non-Schema Fields

Change the logic to:
- Only flag fields that **don't exist in ExtractedKeywords interface**
- Allow ALL schema fields, even if not in expected
- This would catch real hallucinations (e.g., `"weather": "sunny"`)

**Implementation:**
```typescript
// Only flag fields that don't exist in ExtractedKeywords schema
const allSchemaFields = new Set([...all ExtractedKeywords fields]);
if (!allSchemaFields.has(key) && exp?.[key] === undefined) {
  // This is a real hallucination - field doesn't exist in schema
  hallucinations++;
}
```

## Recommendation

**Remove the `no_hallucination` scorer** because:
1. It's redundant with `field_accuracy`
2. It's causing false positives
3. Real hallucinations (non-schema fields) are extremely rare
4. The metric is misleading and not useful

If we want to keep it, change it to only flag fields that don't exist in the ExtractedKeywords schema at all.

