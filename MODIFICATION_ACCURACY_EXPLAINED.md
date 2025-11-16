# How `modification_accuracy` Works

## Overview

`modification_accuracy` measures how well Claude handles **changes, additions, and removals** of fields in follow-up queries. It only scores follow-up queries (queries with context).

## Score Calculation

```
score = correctModifications / totalExpectedModifications
```

- **correctModifications**: Number of fields that were modified correctly
- **totalExpectedModifications**: Number of fields that should have been modified
- **Score range**: 0.0 to 1.0 (0% to 100%)

## What Counts as a Modification?

A field is considered "should be modified" if:

1. **Value Change**: Field exists in both previous and expected, but values differ
   - Example: `priceLevel: 2` → `priceLevel: 1`

2. **Field Addition**: Field doesn't exist in previous but exists in expected
   - Example: Previous has no `requiresMichelin`, expected has `requiresMichelin: true`

3. **Field Removal**: Field exists in previous but doesn't exist in expected
   - Example: Previous has `requiresMichelin: true`, expected has no `requiresMichelin`

## Step-by-Step Process

### Step 1: Identify All Fields
Collect all fields that exist in either `previousKeywords` or `expected`:
```javascript
allFields = Set([...Object.keys(previousKeywords), ...Object.keys(expected)])
```

### Step 2: For Each Field, Check if It Should Change
```javascript
prevExists = (previousKeywords[key] !== undefined && previousKeywords[key] !== null)
expectedExists = (expected[key] !== undefined && expected[key] !== null)

shouldChange = 
  // Value change: exists in both but values differ
  (prevExists && expectedExists && expected[key] !== previousKeywords[key]) ||
  // Addition: doesn't exist in previous but exists in expected
  (!prevExists && expectedExists) ||
  // Removal: exists in previous but doesn't exist in expected
  (prevExists && !expectedExists)
```

### Step 3: Count Expected Modifications
If `shouldChange === true`, increment `totalExpectedModifications`

### Step 4: Check if Modification Was Correct
```javascript
isCorrect = (output[key] === expected[key])
```

If correct, increment `correctModifications` and add to `modificationDetails.correct`
If incorrect, add to `modificationDetails.incorrect`

### Step 5: Check for Unexpected Modifications
Fields that changed but shouldn't have are tracked in `modificationDetails.unexpected`

## Example 1: Price Change

**Query:** "are there cheaper ones?"
**Previous:**
```json
{
  "cuisineType": "italian",
  "neighborhood": ["west village"],
  "occasionType": "date_night",
  "vibeKeywords": ["romantic"],
  "priceLevel": 2,
  "city": "nyc"
}
```

**Expected:**
```json
{
  "cuisineType": "italian",
  "neighborhood": ["west village"],
  "occasionType": "date_night",
  "vibeKeywords": ["romantic"],
  "priceLevel": 1,  // ← Changed from 2 to 1
  "city": "nyc"
}
```

**Analysis:**
- `priceLevel`: Should change (2 → 1) ✅
- All other fields: Should NOT change (skip)
- `totalExpectedModifications = 1`
- If Claude outputs `priceLevel: 1` → `correctModifications = 1` → **Score = 1.0 (100%)**
- If Claude outputs `priceLevel: 2` → `correctModifications = 0` → **Score = 0.0 (0%)**

## Example 2: Field Addition

**Query:** "make it Michelin-starred"
**Previous:**
```json
{
  "cuisineType": "japanese",
  "cuisineSpecialty": "sushi",
  "neighborhood": ["ginza"],
  "city": "tokyo"
}
```

**Expected:**
```json
{
  "cuisineType": "japanese",
  "cuisineSpecialty": "sushi",
  "neighborhood": ["ginza"],
  "requiresMichelin": true,  // ← Added field
  "city": "tokyo"
}
```

**Analysis:**
- `requiresMichelin`: Should be added (doesn't exist in previous, exists in expected) ✅
- All other fields: Should NOT change (skip)
- `totalExpectedModifications = 1`
- If Claude outputs `requiresMichelin: true` → **Score = 1.0 (100%)**
- If Claude doesn't add it → **Score = 0.0 (0%)**

## Example 3: Field Removal

**Query:** "actually, not Michelin"
**Previous:**
```json
{
  "cuisineType": "japanese",
  "cuisineSpecialty": "sushi",
  "neighborhood": ["ginza"],
  "requiresMichelin": true,
  "city": "tokyo"
}
```

**Expected:**
```json
{
  "cuisineType": "japanese",
  "cuisineSpecialty": "sushi",
  "neighborhood": ["ginza"],
  // requiresMichelin removed
  "city": "tokyo"
}
```

**Analysis:**
- `requiresMichelin`: Should be removed (exists in previous, doesn't exist in expected) ✅
- All other fields: Should NOT change (skip)
- `totalExpectedModifications = 1`
- If Claude removes it (output doesn't have `requiresMichelin`) → **Score = 1.0 (100%)**
- If Claude keeps it → **Score = 0.0 (0%)**

## Example 4: Multiple Modifications

**Query:** "make it cheaper and in Manhattan"
**Previous:**
```json
{
  "cuisineType": "italian",
  "borough": "brooklyn",
  "priceLevel": 3,
  "vibeKeywords": ["romantic"],
  "city": "nyc"
}
```

**Expected:**
```json
{
  "cuisineType": "italian",
  "borough": "manhattan",  // ← Changed
  "priceLevel": 1,         // ← Changed
  "vibeKeywords": ["romantic"],
  "city": "nyc"
}
```

**Analysis:**
- `borough`: Should change ("brooklyn" → "manhattan") ✅
- `priceLevel`: Should change (3 → 1) ✅
- All other fields: Should NOT change (skip)
- `totalExpectedModifications = 2`
- If Claude changes both correctly → `correctModifications = 2` → **Score = 1.0 (100%)**
- If Claude only changes one → `correctModifications = 1` → **Score = 0.5 (50%)**
- If Claude changes neither → `correctModifications = 0` → **Score = 0.0 (0%)**

## Example 5: Vibe Modification

**Query:** "make it more casual"
**Previous:**
```json
{
  "cuisineType": "italian",
  "vibeKeywords": ["romantic"],
  "city": "nyc"
}
```

**Expected:**
```json
{
  "cuisineType": "italian",
  "vibeKeywords": ["casual"],  // ← Changed from ["romantic"]
  "city": "nyc"
}
```

**Analysis:**
- `vibeKeywords`: Should change (["romantic"] → ["casual"]) ✅
- All other fields: Should NOT change (skip)
- `totalExpectedModifications = 1`
- If Claude outputs `vibeKeywords: ["casual"]` → **Score = 1.0 (100%)**
- If Claude outputs `vibeKeywords: ["romantic", "casual"]` → **Score = 0.0 (0%)** (incorrect - should replace, not add)

## Key Differences from `context_preservation`

| Metric | What It Measures | Focus |
|--------|------------------|-------|
| `context_preservation` | Fields that should **NOT change** | Preservation of unchanged fields |
| `modification_accuracy` | Fields that **SHOULD change** | Correctness of modifications |

## Metadata Returned

The scorer returns detailed metadata:
```javascript
{
  correctModifications: 2,
  totalExpectedModifications: 2,
  modifications: {
    correct: [
      { field: "priceLevel", previous: 2, expected: 1, output: 1, type: "change" },
      { field: "borough", previous: "brooklyn", expected: "manhattan", output: "manhattan", type: "change" }
    ],
    incorrect: [],
    missing: [],
    unexpected: []
  }
}
```

## Edge Cases

1. **No modifications expected**: Score = 1.0 (perfect)
2. **Field normalization**: Uses `normalizeField()` for price levels and neighborhoods
3. **Unexpected modifications**: Fields that changed but shouldn't have are tracked separately (don't affect score, but logged)

## Current Performance

From the last eval run: **88.89%** (8/9 modifications correct)

This suggests Claude is handling most modifications well, but may struggle with:
- Multiple simultaneous modifications
- Field removals (setting to false vs. removing entirely)
- Vibe keyword replacements (adding vs. replacing)

