# Query Parser Evaluation with Braintrust

This directory contains comprehensive evaluation scripts for testing both OLD and NEW query parsing architectures.

## 📁 Files

```
eval/
├── golden_queries_clean.json       # 30 comprehensive test cases
├── test_query_parser.ts            # NEW architecture eval (Claude parsing)
├── test_old_parser.ts              # OLD architecture eval (deterministic)
└── README.md                       # This file
```

## 🚀 Quick Start

### 1. Install Braintrust

```bash
npm install -g braintrust
braintrust login
```

### 2. Run Evaluations

**Test NEW Architecture (Claude Parsing):**
```bash
npx braintrust eval eval/test_query_parser.ts
```

**Test OLD Architecture (Deterministic Extraction):**
```bash
npx braintrust eval eval/test_old_parser.ts
```

**Run Both:**
```bash
npx braintrust eval eval/test_query_parser.ts
npx braintrust eval eval/test_old_parser.ts
```

### 3. View Results

After running, Braintrust will output a URL:
```
View results: https://www.braintrustdata.com/app/curated-by-cynthia/experiments/exp_abc123
```

Click the link to see detailed results in the dashboard!

---

## 📊 What Gets Measured

### Scoring Metrics

1. **field_accuracy** (0-1)
   - Percentage of fields that match expected output
   - Example: If 3 out of 4 fields match → 0.75

2. **context_preservation** (0-1, follow-ups only)
   - How well previous query context is maintained
   - OLD architecture always scores 0 (can't handle context)
   - NEW architecture should score high (0.8-1.0)

3. **no_hallucination** (0 or 1)
   - 1 = No extra fields added that weren't expected
   - 0 = Claude added unexpected fields

4. **specialty_extracted** (0 or 1, specific dishes only)
   - Did it extract cuisineSpecialty for dishes like "unagi", "ramen"?
   - Tests queries like "unagi in Tokyo"

5. **price_level_accuracy** (0 or 1, price queries only)
   - Did it correctly map "cheap" → 1, "expensive" → 4?

6. **instagrammable_detection** (0 or 1, relevant queries only)
   - Did it detect "nice pictures" → requiresInstagrammable: true?

7. **overall_quality** (0-1)
   - Weighted combination of all metrics
   - Best indicator of overall performance

---

## 📈 Expected Results

### NEW Architecture (Claude Parsing)

```
Overall Scores:
✅ field_accuracy: 0.85-0.92
✅ context_preservation: 0.88-0.95
✅ no_hallucination: 0.82-0.90
✅ specialty_extracted: 0.90-1.0
✅ price_level_accuracy: 0.85-0.95
✅ instagrammable_detection: 0.80-1.0
✅ overall_quality: 0.86-0.93
```

### OLD Architecture (Deterministic)

```
Overall Scores:
⚠️ field_accuracy: 0.60-0.75
❌ context_preservation: 0.0 (can't handle follow-ups)
✅ no_hallucination: 0.90-0.98 (very conservative)
❌ specialty_extracted: 0.0-0.2 (doesn't extract separately)
⚠️ price_level_accuracy: 0.70-0.85
❌ instagrammable_detection: 0.20-0.40 (limited keyword matching)
⚠️ overall_quality: 0.45-0.60
```

---

## 🎯 Test Case Categories

The golden dataset covers:

1. **Simple Queries** (3 cases)
   - "Italian in Brooklyn"
   - Basic cuisine + location

2. **Specific Dishes** (5 cases)
   - "unagi in Tokyo"
   - "yakitori in Shibuya"
   - Tests cuisineSpecialty extraction

3. **Multi-Criteria** (4 cases)
   - "romantic Italian in West Village"
   - "upscale French for business lunch"
   - Multiple filters at once

4. **Vague Queries** (4 cases)
   - "good vibes"
   - "somewhere I can take nice pictures in"
   - Tests Claude's interpretation

5. **Price Queries** (3 cases)
   - "cheap eats in Brooklyn"
   - "expensive Japanese"

6. **Special Queries** (2 cases)
   - "Cynthia's favorites"
   - "Michelin star restaurants"

7. **Follow-Ups** (6 cases)
   - Price: "are there cheaper ones?"
   - Location: "what about in Manhattan?"
   - More: "show me more"
   - Cuisine: "actually, I want Japanese instead"
   - Add: "make it Michelin-starred"

8. **Edge Cases** (3 cases)
   - Typos: "itlaian food"
   - Irrelevant: "what's the weather?"
   - Negation: "romantic but not too fancy"

---

## 💰 Cost Per Run

- **OLD Architecture**: $0.00 (no API calls)
- **NEW Architecture**: $0.06 (30 Claude API calls)
- **Both Together**: $0.06 total

Running 100 times: $6.00

---

## 🔧 Customization

### Add More Test Cases

Edit `golden_queries_clean.json`:

```json
{
  "input": {
    "query": "your test query here",
    "city": "NYC"
  },
  "expected": {
    "cuisineType": "expected_value",
    "city": "nyc"
  },
  "metadata": {
    "category": "your_category",
    "difficulty": "easy|medium|hard",
    "description": "what this tests"
  }
}
```

### Filter Test Cases

Run only specific categories:

```typescript
// In test_query_parser.ts
data: () => goldenQueries.filter(q => 
  q.metadata.category === "follow_up_price"
),
```

### Adjust Scoring

Modify the scorer functions in the eval scripts to change how metrics are calculated.

---

## 🐛 Debugging Failed Tests

1. **View in Dashboard**
   - Click the Braintrust URL
   - Find failing test cases
   - See expected vs actual output

2. **Re-run Single Test**
   ```typescript
   // Filter to one test
   data: () => goldenQueries.filter(q => 
     q.input.query === "unagi in Tokyo"
   ),
   ```

3. **Check Logs**
   - Console shows errors for each failed test
   - Look for parsing errors or API failures

---

## 📝 Best Practices

1. **Run before every commit**
   ```bash
   git add .
   npx braintrust eval eval/test_query_parser.ts
   git commit -m "your message"
   ```

2. **Compare runs**
   - Dashboard shows history
   - Compare "Run #1" vs "Run #2"
   - See which changes improved scores

3. **Add failing cases to dataset**
   - Found a bug in production?
   - Add it to golden_queries_clean.json
   - Now it's a regression test!

4. **CI/CD Integration**
   ```yaml
   # .github/workflows/test.yml
   - name: Run Braintrust Eval
     run: npx braintrust eval eval/test_query_parser.ts
   ```

---

## 🎓 Learn More

- Braintrust Docs: https://www.braintrustdata.com/docs
- Our Project: https://www.braintrustdata.com/app/curated-by-cynthia

---

## 🆘 Troubleshooting

**Error: "Cannot find module 'braintrust'"**
```bash
npm install -g braintrust
```

**Error: "Cannot find module '../api/services/parseQuery'"**
```bash
# Make sure you're running from project root
cd /path/to/curated-by-cynthia
npx braintrust eval eval/test_query_parser.ts
```

**Error: "ANTHROPIC_API_KEY not found"**
```bash
# Set your API key
export ANTHROPIC_API_KEY="your-key-here"
```

**No results showing in dashboard**
```bash
# Make sure you're logged in
braintrust login
```

---

## ✅ Success Criteria

Your NEW architecture is ready to ship when:

- ✅ field_accuracy > 0.85
- ✅ context_preservation > 0.85 (for follow-ups)
- ✅ specialty_extracted > 0.85 (for dish queries)
- ✅ overall_quality > 0.85
- ✅ All "high_priority" test cases pass

Good luck! 🚀
