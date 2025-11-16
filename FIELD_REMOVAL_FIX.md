# Field Removal Fix: "actually, not Michelin"

## Problem Summary

**Test Case:** "actually, not Michelin"
- **Previous:** `requiresMichelin: true`
- **Expected:** `requiresMichelin` removed (undefined)
- **Claude's Output:** `requiresMichelin: false` ❌
- **Result:** `modification_accuracy` = 0%

## Root Cause

1. **Prompt didn't instruct field removal**: No explicit instruction to set fields to `null`/`undefined` when user says "not X"
2. **Code defaulted to false**: Even if Claude returned `null`, code converted it to `false`
3. **Scorer expected undefined**: Scorer checks `output === expected`, but `false !== undefined`

## Fix Applied

### 1. Updated Prompt to Detect Field Removal

Added detection for "not X" patterns:
```typescript
} else if (lowerQuery.includes('not') && (lowerQuery.includes('michelin') || ...)) {
  prompt += `\n\nThe user wants to REMOVE the Michelin requirement. Set requiresMichelin to null (or omit it from the response) to remove this filter.`;
}
```

### 2. Added Explicit Rule About Field Removal

Added Rule 13:
```
13. FIELD REMOVAL: If the user explicitly says "not X" or "remove X" (e.g., "not Michelin", "actually, not Michelin", "remove the Michelin requirement"), set that boolean field to null (or omit it from the response) to REMOVE the filter entirely. Do NOT set it to false - false means the filter is active but set to false, while null/undefined means the filter is removed.
```

### 3. Updated Response Format

Changed boolean fields to allow `null`:
```json
{
  "requiresMichelin": boolean | null,
  ...
}
```

### 4. Updated Code to Handle Null

Changed from:
```typescript
requiresMichelin: parsedKeywords.requiresMichelin || false,
```

To:
```typescript
requiresMichelin: parsedKeywords.requiresMichelin === null ? undefined : (parsedKeywords.requiresMichelin ?? false),
```

**Logic:**
- If Claude returns `null` → Set to `undefined` (field removed)
- If Claude returns `true` → Set to `true`
- If Claude returns `false` → Set to `false`
- If Claude omits field → Default to `false` (for initial queries)

## Expected Behavior After Fix

For query: **"actually, not Michelin"**

**Claude should return:**
```json
{
  "requiresMichelin": null,  // or omit the field
  ...
}
```

**Code will convert to:**
```json
{
  "requiresMichelin": undefined,  // field removed
  ...
}
```

**Scorer will check:**
- `normalizedOutput = undefined`
- `normalizedExpected = undefined`
- `undefined === undefined` → **CORRECT** → Score = 100% ✅

## Testing

After this fix, re-run the eval to verify:
- `modification_accuracy` should improve for field removal queries
- The test case "actually, not Michelin" should score 100%

