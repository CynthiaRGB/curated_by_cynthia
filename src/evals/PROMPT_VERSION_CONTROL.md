# Prompt Version Control with Braintrust

This guide explains how to use Braintrust to track and test different versions of your Claude prompt.

## 🎯 Overview

Braintrust automatically tracks:
- **Every eval run** as a separate experiment
- **All scores** for each test case
- **Metadata** you provide (prompt version, git commit, etc.)
- **Comparison views** between different runs

## 📝 Step 1: Add Prompt Version Metadata

Add version tracking to your eval configuration:

```typescript
// In test_query_parser.ts
Eval("Query Parser - NEW Architecture", {
  projectName: "curated-by-cynthia",
  
  // Add metadata to track prompt version
  metadata: {
    promptVersion: "v2.1", // Increment when you change the prompt
    promptChanges: "Added all occasion types, expanded cuisine specialty examples",
    gitCommit: process.env.GIT_COMMIT || "unknown", // Optional: track git commit
    date: new Date().toISOString(),
  },
  
  data: () => goldenQueries as any,
  task: async (input: any) => {
    // ... your task
  },
  scores: [
    // ... your scorers
  ],
});
```

## 🔄 Step 2: Track Prompt Changes

### Option A: Manual Version Numbering

```typescript
// Update this when you change the prompt
metadata: {
  promptVersion: "v2.2",
  promptChanges: "Added flexible matching note for cuisine specialty",
}
```

### Option B: Extract from Git (Recommended)

```typescript
import { execSync } from 'child_process';

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const message = execSync('git log -1 --pretty=%B').toString().trim();
    return { commit, branch, message };
  } catch {
    return { commit: 'unknown', branch: 'unknown', message: 'unknown' };
  }
}

const gitInfo = getGitInfo();

Eval("Query Parser - NEW Architecture", {
  metadata: {
    promptVersion: `v2.1-${gitInfo.commit}`,
    gitCommit: gitInfo.commit,
    gitBranch: gitInfo.branch,
    gitMessage: gitInfo.message,
    promptFile: "api/services/parseQuery.ts",
    promptFunction: "buildQueryParsingPrompt",
  },
  // ...
});
```

## 📊 Step 3: Run Evaluations and Compare

### Run an Eval

```bash
npx braintrust eval src/evals/test_query_parser.ts
```

Braintrust will:
1. Create a new experiment
2. Track all scores
3. Store metadata
4. Give you a URL to view results

### Compare Different Versions

1. **In Braintrust Dashboard:**
   - Go to your project: https://www.braintrustdata.com/app/curated-by-cynthia
   - Click on "Experiments"
   - Select multiple experiments
   - Click "Compare" to see side-by-side comparison

2. **Compare Specific Metrics:**
   - View average scores across all test cases
   - See which test cases improved/regressed
   - Identify patterns in failures

## 🧪 Step 4: A/B Testing Prompts

### Test Two Prompt Versions Side-by-Side

```typescript
// test_query_parser_v2.1.ts
Eval("Query Parser - v2.1", {
  metadata: { promptVersion: "v2.1" },
  // ... use prompt v2.1
});

// test_query_parser_v2.2.ts  
Eval("Query Parser - v2.2", {
  metadata: { promptVersion: "v2.2" },
  // ... use prompt v2.2
});
```

Run both:
```bash
npx braintrust eval src/evals/test_query_parser_v2.1.ts
npx braintrust eval src/evals/test_query_parser_v2.2.ts
```

Then compare in dashboard!

## 📈 Step 5: Track Prompt Evolution

### Create a Prompt Version Log

```typescript
// prompt-versions.ts
export const PROMPT_VERSIONS = {
  "v2.0": {
    date: "2025-01-15",
    changes: "Initial version with basic extraction",
    improvements: "Added special features extraction",
  },
  "v2.1": {
    date: "2025-01-16",
    changes: "Added all occasion types, expanded cuisine examples",
    improvements: "Better handling of hidden gems queries",
  },
  "v2.2": {
    date: "2025-01-17",
    changes: "Added flexible matching notes",
    improvements: "Clarified open-ended field handling",
  },
};
```

### Use in Eval

```typescript
import { PROMPT_VERSIONS } from './prompt-versions';

const currentVersion = "v2.2";
const versionInfo = PROMPT_VERSIONS[currentVersion];

Eval("Query Parser", {
  metadata: {
    promptVersion: currentVersion,
    ...versionInfo,
  },
  // ...
});
```

## 🎯 Best Practices

### 1. **Version Before Major Changes**

```bash
# Before changing prompt
git commit -m "Baseline: prompt v2.1"
npx braintrust eval src/evals/test_query_parser.ts

# Make prompt changes
# ... edit parseQuery.ts ...

# After changes
git commit -m "Prompt v2.2: added occasion types"
npx braintrust eval src/evals/test_query_parser.ts

# Compare in dashboard!
```

### 2. **Track What Changed**

Always document what changed in metadata:

```typescript
metadata: {
  promptVersion: "v2.2",
  changes: [
    "Added all 18 occasion types with indicators",
    "Expanded cuisine specialty examples (19 Japanese dishes)",
    "Added flexible matching explanation",
  ],
  expectedImprovements: [
    "Better occasion type extraction",
    "More accurate cuisine specialty matching",
  ],
}
```

### 3. **Run Before/After Every Prompt Change**

```bash
# Workflow:
1. Run eval with current prompt → baseline
2. Make prompt changes
3. Run eval again → compare
4. If improved → commit
5. If regressed → investigate and fix
```

### 4. **Use Experiment Names**

Name your experiments descriptively:

```typescript
Eval("Query Parser - v2.2 - Added Occasion Types", {
  // This name appears in dashboard
});
```

## 📊 Analyzing Results

### Key Metrics to Track

1. **Overall Accuracy**
   - `field_accuracy` average
   - Should increase with better prompts

2. **Category-Specific Scores**
   - `neighborhood_accuracy`
   - `cuisine_accuracy`
   - `occasion_type_accuracy`
   - `special_features_accuracy` (if you add this scorer)

3. **Regression Detection**
   - Did any test cases get worse?
   - Which categories regressed?

### Dashboard Features

- **Experiment Comparison**: Side-by-side view
- **Score Trends**: See how scores changed over time
- **Failure Analysis**: Which test cases are failing
- **Metadata Filtering**: Filter by prompt version

## 🔍 Example: Tracking a Prompt Change

### Before (v2.1)

```typescript
Eval("Query Parser - v2.1", {
  metadata: { promptVersion: "v2.1" },
  // ...
});
```

Results:
- `field_accuracy`: 0.85
- `occasion_type_accuracy`: 0.70 (some failures)

### After (v2.2) - Added Occasion Types

```typescript
Eval("Query Parser - v2.2", {
  metadata: { 
    promptVersion: "v2.2",
    changes: "Added all 18 occasion types with query indicators"
  },
  // ...
});
```

Results:
- `field_accuracy`: 0.88 (+0.03)
- `occasion_type_accuracy`: 0.95 (+0.25) ✅

**Conclusion**: v2.2 is better! The occasion types addition improved accuracy.

## 🚀 Quick Start Checklist

- [ ] Add `promptVersion` to eval metadata
- [ ] Run baseline eval before making changes
- [ ] Make prompt changes
- [ ] Update version number
- [ ] Run eval again
- [ ] Compare in Braintrust dashboard
- [ ] Document improvements/regressions
- [ ] Commit if improved

## 📚 Resources

- [Braintrust Docs](https://www.braintrustdata.com/docs)
- [Experiment Comparison Guide](https://www.braintrustdata.com/docs/guides/comparing-experiments)
- [Metadata Best Practices](https://www.braintrustdata.com/docs/guides/metadata)

