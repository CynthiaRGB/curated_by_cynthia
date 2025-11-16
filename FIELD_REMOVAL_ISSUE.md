# Field Removal Issue: "actually, not Michelin"

## Problem

**Test Case:** "actually, not Michelin"
- **Previous:** `requiresMichelin: true`
- **Expected:** `requiresMichelin` removed (not in expected object = `undefined`)
- **Claude's Output:** `requiresMichelin: false` ❌
- **Result:** `modification_accuracy` = 0%

## Root Cause

### Issue 1: Prompt Doesn't Instruct Field Removal

The prompt has conflicting instructions:

1. **Rule 10:** "Default all optional boolean fields to false if not mentioned"
2. **Rule 12:** "For follow-up queries, merge new information with previous keywords (don't lose previous criteria unless explicitly changed)"

But there's **NO explicit instruction** about what to do when a user says:
- "not Michelin"
- "actually, not Michelin"
- "remove the Michelin requirement"

Claude interprets this as "set to false" rather than "remove the field entirely".

### Issue 2: Code Defaults to False

In `parseQuery.ts`, the code has:
```typescript
requiresMichelin: parsedKeywords.requiresMichelin || false,
```

This means even if Claude returns `undefined`, it gets converted to `false`. So the field is always present.

### Issue 3: Scorer Expects Undefined

The `modification_accuracy` scorer checks:
```typescript
isCorrect = JSON.stringify(normalizedOutput) === JSON.stringify(normalizedExpected)
```

- `normalizedExpected = undefined` (field removed)
- `normalizedOutput = false` (field set to false)
- `false !== undefined` → **INCORRECT** → Score = 0%

## The Fix

We need to:

1. **Update the prompt** to explicitly handle field removal:
   - When user says "not X" or "remove X", set the field to `undefined` (omit from JSON)
   - Distinguish between "not mentioned" (default to false) vs "explicitly removed" (set to undefined)

2. **Update the code** to preserve `undefined` for boolean fields in follow-ups:
   - Check if Claude explicitly set it to `null` or omitted it
   - Don't default to `false` if the field was explicitly removed

3. **Update the response format** to allow `null` or omission for boolean fields when removed

