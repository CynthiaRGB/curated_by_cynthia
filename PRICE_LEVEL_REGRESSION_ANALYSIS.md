# Price Level Accuracy Regression Analysis

## Issue Found

**Test Case:** "what about in Manhattan?"
- **Category:** `follow_up_location`
- **Previous:** `priceLevel: 2`
- **Expected:** `priceLevel: 2` (should be preserved)
- **Claude Output:** `priceLevel: null` ❌
- **Result:** `price_level_accuracy` = 0% for this test case

## Root Cause

The query "what about in Manhattan?" is a follow-up that only changes the location (borough: "brooklyn" → "manhattan"). All other fields, including `priceLevel`, should be preserved from the previous query.

However, Claude is setting `priceLevel: null` instead of preserving `priceLevel: 2`.

### Why This Happens

Looking at the prompt logic:
1. The query "what about in Manhattan?" doesn't match any specific patterns (cheaper, more expensive, more, not X)
2. It falls into the generic `else` clause:
   ```
   "Merge any new criteria from the current query with the previous keywords. 
   If the current query mentions something new (like a different price level, cuisine, or location), 
   update that field. Otherwise, keep the previous values."
   ```

The prompt says "keep the previous values" but Claude is interpreting this as "only keep values that are explicitly mentioned or strongly implied". Since "what about in Manhattan?" doesn't mention price, Claude is setting it to null.

## The Problem

Claude's default behavior for follow-up queries seems to be:
- If a field is not mentioned in the new query → set to null/undefined
- Instead of: If a field is not mentioned in the new query → preserve from previous

## Solution

The prompt needs to be more explicit about preserving fields that aren't mentioned. We should update the generic follow-up instruction to explicitly state:

```
For follow-up queries, you should:
1. Update fields that are explicitly mentioned or changed in the new query
2. PRESERVE all other fields from the previous keywords (don't set them to null/undefined)
3. Only remove fields if the user explicitly says "not X" or "remove X"
```

## Impact

- **Score:** 90.91% (10/11 test cases passed)
- **Failed Test Case:** "what about in Manhattan?"
- **Issue Type:** Context preservation for priceLevel in follow-up queries

## Fix Needed

Update the prompt's generic follow-up instruction to explicitly preserve all fields that aren't mentioned in the new query.

