// Rapid Prompt Testing Eval - Quick iteration on Claude prompt changes
// This eval ONLY tests the parsing step (no filtering) for fast feedback

import dotenv from "dotenv";
import { resolve as resolvePath } from "path";
dotenv.config({ path: resolvePath(process.cwd(), ".env") });

import { Eval } from "braintrust";
import { parseQueryWithClaude } from "../../api/services/parseQuery";
import { execSync } from "child_process";

// Helper to get git info for tracking
function getGitInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    return { commit, branch };
  } catch {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

// ============================================================================
// TEST CASES - Add/remove cases here for rapid testing
// ============================================================================

const promptTestCases = [
  // Test semantic concepts (like "street food")
  {
    input: {
      query: "street food in Seoul",
      city: "Seoul"
    },
    expected: {
      cuisineType: "korean",
      priceLevel: "budget",
      vibeKeywords: ["casual"],
      cuisineSpecialty: null, // Should NOT extract "street food" as specialty
      city: "seoul"
    },
    metadata: {
      category: "semantic_concept",
      description: "Street food should map to budget + casual, not specialty"
    }
  },
  {
    input: {
      query: "fast food in NYC",
      city: "NYC"
    },
    expected: {
      priceLevel: "budget",
      vibeKeywords: ["casual"],
      cuisineSpecialty: null,
      city: "nyc"
    },
    metadata: {
      category: "semantic_concept",
      description: "Fast food = budget + casual"
    }
  },
  {
    input: {
      query: "fine dining in Paris",
      city: "Paris"
    },
    expected: {
      priceLevel: "luxury",
      vibeKeywords: ["upscale", "sophisticated"],
      cuisineSpecialty: null,
      city: "paris"
    },
    metadata: {
      category: "semantic_concept",
      description: "Fine dining = luxury + upscale"
    }
  },
  // Test actual dishes (should extract as specialty)
  {
    input: {
      query: "pizza in Manhattan",
      city: "NYC"
    },
    expected: {
      cuisineType: "italian",
      cuisineSpecialty: "pizza",
      city: "nyc"
    },
    metadata: {
      category: "actual_dish",
      description: "Pizza is an actual dish, should be extracted as specialty"
    }
  },
  {
    input: {
      query: "omakase in Tokyo",
      city: "Tokyo"
    },
    expected: {
      cuisineType: "japanese",
      cuisineSpecialty: "sushi", // Or "omakase" - depends on your preference
      priceLevel: "luxury",
      city: "tokyo"
    },
    metadata: {
      category: "actual_dish",
      description: "Omakase = high-end sushi"
    }
  },
  // Add more test cases here as you iterate
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizePriceLevel(value: any): any {
  if (typeof value === 'number') {
    const priceMap: { [key: number]: string } = {
      1: 'budget',
      2: 'moderate',
      3: 'upscale',
      4: 'luxury'
    };
    return priceMap[value] || value;
  }
  return value;
}

function normalizeField(key: string, value: any): any {
  if (key === 'priceLevel') {
    return normalizePriceLevel(value);
  }
  return value;
}

// ============================================================================
// TASK FUNCTION
// ============================================================================

async function promptTestTask(input: any) {
  try {
    // Parse query with Claude
    const parsed = await parseQueryWithClaude(input.query, input.city);
    
    return {
      parsedKeywords: parsed,
      // Include input for debugging
      inputQuery: input.query,
      inputCity: input.city
    };
  } catch (error: any) {
    return {
      error: error.message,
      parsedKeywords: null,
      inputQuery: input.query,
      inputCity: input.city
    };
  }
}

// ============================================================================
// SCORERS
// ============================================================================

function scoreFieldMatch({ input, output, expected }: any) {
  if (output.error) return 0;
  
  const parsed = output.parsedKeywords || {};
  const expectedFields = Object.keys(expected);
  let matches = 0;
  let total = 0;
  
  for (const field of expectedFields) {
    if (field === 'metadata') continue; // Skip metadata
    
    total++;
    const expectedValue = normalizeField(field, expected[field]);
    const actualValue = normalizeField(field, parsed[field]);
    
    // Handle arrays
    if (Array.isArray(expectedValue) && Array.isArray(actualValue)) {
      const expectedSet = new Set(expectedValue.map((v: any) => String(v).toLowerCase()));
      const actualSet = new Set(actualValue.map((v: any) => String(v).toLowerCase()));
      const intersection = new Set([...expectedSet].filter(x => actualSet.has(x)));
      if (intersection.size === expectedSet.size && intersection.size === actualSet.size) {
        matches++;
      }
    } else if (Array.isArray(expectedValue)) {
      // Expected is array, actual is not
      if (expectedValue.length === 1 && String(actualValue).toLowerCase() === String(expectedValue[0]).toLowerCase()) {
        matches++;
      }
    } else if (Array.isArray(actualValue)) {
      // Actual is array, expected is not
      if (actualValue.length === 1 && String(expectedValue).toLowerCase() === String(actualValue[0]).toLowerCase()) {
        matches++;
      }
    } else {
      // Both are primitives
      if (String(expectedValue).toLowerCase() === String(actualValue).toLowerCase()) {
        matches++;
      } else if (expectedValue === null && (actualValue === null || actualValue === undefined)) {
        matches++;
      } else if (expectedValue === undefined && (actualValue === null || actualValue === undefined)) {
        matches++;
      }
    }
  }
  
  return total > 0 ? matches / total : 1;
}

function scoreSemanticConcept({ input, output, expected }: any) {
  // Special scorer for semantic concepts (street food, fast food, etc.)
  if (input.metadata?.category !== 'semantic_concept') return null;
  if (output.error) return 0;
  
  const parsed = output.parsedKeywords || {};
  
  // Check that specialty is null (not extracted as a dish)
  const specialtyCorrect = (expected.cuisineSpecialty === null && 
                            (parsed.cuisineSpecialty === null || parsed.cuisineSpecialty === undefined));
  
  // Check price level
  const priceCorrect = !expected.priceLevel || 
                       normalizePriceLevel(parsed.priceLevel) === normalizePriceLevel(expected.priceLevel);
  
  // Check vibe keywords
  const expectedVibes = expected.vibeKeywords || [];
  const actualVibes = parsed.vibeKeywords || [];
  const vibeSet = new Set(actualVibes.map((v: string) => v.toLowerCase()));
  const vibeMatch = expectedVibes.every((v: string) => vibeSet.has(v.toLowerCase()));
  
  return (specialtyCorrect ? 0.4 : 0) + (priceCorrect ? 0.3 : 0) + (vibeMatch ? 0.3 : 0);
}

function scoreActualDish({ input, output, expected }: any) {
  // Special scorer for actual dishes (pizza, ramen, etc.)
  if (input.metadata?.category !== 'actual_dish') return null;
  if (output.error) return 0;
  
  const parsed = output.parsedKeywords || {};
  
  // Check that specialty IS extracted
  const specialtyExtracted = parsed.cuisineSpecialty !== null && parsed.cuisineSpecialty !== undefined;
  
  // Check cuisine type
  const cuisineCorrect = !expected.cuisineType || 
                         String(parsed.cuisineType).toLowerCase() === String(expected.cuisineType).toLowerCase();
  
  return (specialtyExtracted ? 0.6 : 0) + (cuisineCorrect ? 0.4 : 0);
}

// ============================================================================
// EVAL CONFIGURATION
// ============================================================================

const gitInfo = getGitInfo();

Eval("Prompt Testing - Rapid Iteration", {
  data: () => promptTestCases as any,
  task: promptTestTask,
  scores: [
    {
      name: "field_accuracy",
      scorer: scoreFieldMatch
    },
    {
      name: "semantic_concept",
      scorer: scoreSemanticConcept
    },
    {
      name: "actual_dish",
      scorer: scoreActualDish
    }
  ],
  metadata: {
    purpose: "Rapid prompt iteration testing",
    gitCommit: gitInfo.commit,
    gitBranch: gitInfo.branch,
    testCount: promptTestCases.length,
    note: "Add/remove test cases in promptTestCases array for quick testing"
  },
  maxConcurrency: 1, // Rate limit Claude API calls
});

