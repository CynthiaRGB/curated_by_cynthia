// eval/test_query_parser.ts
import { Eval } from "braintrust";
import { parseQueryWithClaude } from "../../api/services/parseQuery";
import goldenQueries from "./golden_queries_clean.json";

// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normalize price level formats for comparison
 * Converts between numeric (1,2,3,4) and string ("budget", "moderate", "upscale") formats
 * Handles both directions: number -> string and string -> number
 */
function normalizePriceLevel(value: any): any {
  if (typeof value === 'number') {
    // Convert numeric to string (expected format -> output format)
    const priceMap: { [key: number]: string } = {
      1: 'budget',
      2: 'moderate',
      3: 'upscale',
      4: 'luxury' // 4 is very expensive, map to luxury ($$$$ only)
    };
    return priceMap[value] || value;
  }
  
  if (typeof value === 'string') {
    // Convert string to number (output format -> expected format)
    const stringToNumberMap: { [key: string]: number } = {
      'budget': 1,
      'moderate': 2,
      'upscale': 3,
      'luxury': 4,
      'any': undefined
    };
    // If mapping exists, convert to number, then back to string for comparison
    // This ensures both sides are normalized to the same format
    const numValue = stringToNumberMap[value.toLowerCase()];
    if (numValue !== undefined) {
      // Convert back to string using the number->string map for consistent comparison
      const priceMap: { [key: number]: string } = {
        1: 'budget',
        2: 'moderate',
        3: 'upscale',
        4: 'luxury'
      };
      return priceMap[numValue] || value;
    }
  }
  
  // If it's undefined or other type, return as-is
  return value;
}

/**
 * Normalize neighborhood formats for comparison
 * Converts between string and array formats
 */
function normalizeNeighborhood(value: any): any {
  if (Array.isArray(value)) {
    // If it's an array, return as-is
    return value;
  } else if (typeof value === 'string' && value) {
    // If it's a string, convert to array
    return [value];
  } else if (value === null || value === undefined) {
    // If it's null/undefined, return as-is
    return value;
  }
  return value;
}

/**
 * Normalize a value based on its field name
 */
function normalizeField(key: string, value: any): any {
  if (key === 'priceLevel') {
    return normalizePriceLevel(value);
  } else if (key === 'neighborhood') {
    return normalizeNeighborhood(value);
  }
  return value;
}

/**
 * Evaluation: NEW Architecture (Claude Parsing)
 * Tests the parseQueryWithClaude function against golden dataset
 */
Eval("Query Parser - NEW Architecture (Rate Limited)", {
  projectName: "curated-by-cynthia",
  
  // Prompt version tracking - update this when you change the prompt
  metadata: {
    promptVersion: "v2.2",
    promptChanges: "Added all occasion types, expanded cuisine specialty examples, added flexible matching notes",
    promptFile: "api/services/parseQuery.ts",
    promptFunction: "buildQueryParsingPrompt",
    testCount: goldenQueries.length,
  },
  
  // Run tests sequentially to avoid rate limits
  maxConcurrency: 1,
  
  // Load test data from golden dataset
  data: () => goldenQueries as any,
  
  // Task: Parse each query with Claude
  task: async (input: any) => {
    try {
      // Add 2-second delay to stay under 50 RPM rate limit
      await delay(2000);
      
      const result = await parseQueryWithClaude(
        input.query,
        input.city,
        input.context
      );
      
      return result;
    } catch (error: any) {
      console.error(`❌ Error parsing query: ${input.query}`, error.message);
      return {
        error: error.message,
        statusCode: error.status
      };
    }
  },
  
  // Scoring functions
  scores: [
    // ========================================
    // LOCATION SCORERS (2 separate scorers)
    // ========================================
    function scoreNeighborhoodAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.neighborhood === undefined) {
        return null; // Skip if error or field not in expected
      }
      
      const outputVal = normalizeNeighborhood(out.neighborhood);
      const expectedVal = normalizeNeighborhood(exp.neighborhood);
      const isMatch = JSON.stringify(outputVal) === JSON.stringify(expectedVal);
      
      return {
        name: "neighborhood_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: outputVal,
          expected: expectedVal
        }
      };
    },
    
    function scoreBoroughAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.borough === undefined) {
        return null;
      }
      
      const isMatch = (out.borough || null) === (exp.borough || null);
      return {
        name: "borough_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: out.borough || null,
          expected: exp.borough || null
        }
      };
    },
    
    // ========================================
    // CUISINE SCORER (1 combined scorer)
    // ========================================
    function scoreCuisineAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error) {
        return {
          name: "cuisine_accuracy",
          score: 0,
          metadata: { error: out.error }
        };
      }
      
      // Skip if neither cuisine field is in expected
      if (exp?.cuisineType === undefined && exp?.cuisineSpecialty === undefined) {
        return null;
      }
      
      let correctFields = 0;
      let totalFields = 0;
      
      // Check cuisineType
      if (exp?.cuisineType !== undefined) {
        totalFields++;
        const outputType = (out?.cuisineType || null)?.toLowerCase();
        const expectedType = (exp?.cuisineType || null)?.toLowerCase();
        if (outputType === expectedType) {
          correctFields++;
        }
      }
      
      // Check cuisineSpecialty
      if (exp?.cuisineSpecialty !== undefined) {
        totalFields++;
        const outputSpecialty = (out?.cuisineSpecialty || null)?.toLowerCase();
        const expectedSpecialty = (exp?.cuisineSpecialty || null)?.toLowerCase();
        if (outputSpecialty === expectedSpecialty) {
          correctFields++;
        }
      }
      
      const score = totalFields > 0 ? correctFields / totalFields : 1;
      return {
        name: "cuisine_accuracy",
        score,
        metadata: {
          correctFields,
          totalFields,
          outputType: out?.cuisineType,
          expectedType: exp?.cuisineType,
          outputSpecialty: out?.cuisineSpecialty,
          expectedSpecialty: exp?.cuisineSpecialty
        }
      };
    },
    
    // ========================================
    // MEAL/TIME SCORER
    // ========================================
    function scoreMealTypeAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.mealType === undefined) {
        return null;
      }
      
      const isMatch = (out?.mealType || null) === (exp?.mealType || null);
      return {
        name: "meal_type_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: out?.mealType || null,
          expected: exp?.mealType || null
        }
      };
    },
    
    // ========================================
    // PRICE SCORER
    // ========================================
    function scorePriceLevelAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.priceLevel === undefined) {
        return null;
      }
      
      const outputVal = normalizePriceLevel(out?.priceLevel);
      const expectedVal = normalizePriceLevel(exp?.priceLevel);
      const isMatch = outputVal === expectedVal;
      
      return {
        name: "price_level_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: outputVal,
          expected: expectedVal,
          rawOutput: out?.priceLevel,
          rawExpected: exp?.priceLevel
        }
      };
    },
    
    // ========================================
    // VIBE SCORER (Partial credit: 100% if at least one matches)
    // ========================================
    function scoreVibeKeywordsAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.vibeKeywords === undefined) {
        return null;
      }
      
      const outputVibes = (out?.vibeKeywords || []).map((v: string) => v.toLowerCase());
      const expectedVibes = (exp?.vibeKeywords || []).map((v: string) => v.toLowerCase());
      
      // Check if at least one keyword matches
      const matchingKeywords = outputVibes.filter(v => expectedVibes.includes(v));
      const hasMatch = matchingKeywords.length > 0;
      
      return {
        name: "vibe_keywords_accuracy",
        score: hasMatch ? 1 : 0,
        metadata: {
          output: outputVibes,
          expected: expectedVibes,
          matchingKeywords: matchingKeywords,
          missingKeywords: expectedVibes.filter(v => !outputVibes.includes(v)),
          extraKeywords: outputVibes.filter(v => !expectedVibes.includes(v))
        }
      };
    },
    
    // ========================================
    // OCCASION SCORER
    // ========================================
    function scoreOccasionTypeAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.occasionType === undefined) {
        return null;
      }
      
      const outputOccasion = (out?.occasionType || null);
      const expectedOccasion = (exp?.occasionType || null);
      
      // Direct match
      if (outputOccasion === expectedOccasion) {
        return {
          name: "occasion_type_accuracy",
          score: 1,
          metadata: {
            output: outputOccasion,
            expected: expectedOccasion,
            matchType: "exact"
          }
        };
      }
      
      // Check for interchangeable occasion types
      // These are semantically equivalent and should both be accepted
      const interchangeableOccasions: { [key: string]: string[] } = {
        // Anniversary dinner is a type of date night - both are valid
        'anniversary': ['date_night', 'special_occasion'],
        'date_night': ['anniversary', 'special_occasion'],
        // Special occasion can be anniversary, date night, or celebration
        'special_occasion': ['anniversary', 'date_night', 'celebration'],
        // Celebration and special occasion are similar
        'celebration': ['special_occasion'],
        // Business occasions are distinct (lunch vs dinner), but business_lunch and business_dinner
        // are both valid for "business" queries - though we keep them separate as they're meal-specific
      };
      
      // Check if output is in the interchangeable set for expected
      const expectedInterchangeable = interchangeableOccasions[expectedOccasion] || [];
      const outputInterchangeable = interchangeableOccasions[outputOccasion] || [];
      
      // Check if they're interchangeable (bidirectional)
      const isInterchangeable = 
        expectedInterchangeable.includes(outputOccasion) ||
        outputInterchangeable.includes(expectedOccasion) ||
        (expectedInterchangeable.length > 0 && outputInterchangeable.length > 0 &&
         expectedInterchangeable.some(e => outputInterchangeable.includes(e)));
      
      if (isInterchangeable) {
        return {
          name: "occasion_type_accuracy",
          score: 1,
          metadata: {
            output: outputOccasion,
            expected: expectedOccasion,
            matchType: "interchangeable"
          }
        };
      }
      
      // No match
      return {
        name: "occasion_type_accuracy",
        score: 0,
        metadata: {
          output: outputOccasion,
          expected: expectedOccasion,
          matchType: "no_match"
        }
      };
    },
    
    // ========================================
    // SPECIAL REQUIREMENTS SCORERS (4 separate scorers)
    // ========================================
    function scoreRequiresInstagrammableAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.requiresInstagrammable === undefined) {
        return null;
      }
      
      const isMatch = (out?.requiresInstagrammable || false) === (exp?.requiresInstagrammable || false);
      return {
        name: "requires_instagrammable_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: out?.requiresInstagrammable || false,
          expected: exp?.requiresInstagrammable || false
        }
      };
    },
    
    function scoreRequiresMichelinAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.requiresMichelin === undefined) {
        return null;
      }
      
      const isMatch = (out?.requiresMichelin || false) === (exp?.requiresMichelin || false);
      return {
        name: "requires_michelin_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: out?.requiresMichelin || false,
          expected: exp?.requiresMichelin || false
        }
      };
    },
    
    function scoreRequiresCoffeeFocusAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.requiresCoffeeFocus === undefined) {
        return null;
      }
      
      const isMatch = (out?.requiresCoffeeFocus || false) === (exp?.requiresCoffeeFocus || false);
      return {
        name: "requires_coffee_focus_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: out?.requiresCoffeeFocus || false,
          expected: exp?.requiresCoffeeFocus || false
        }
      };
    },
    
    function scoreRequiresDessertFocusAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      if (out?.error || exp?.requiresDessertFocus === undefined) {
        return null;
      }
      
      const isMatch = (out?.requiresDessertFocus || false) === (exp?.requiresDessertFocus || false);
      return {
        name: "requires_dessert_focus_accuracy",
        score: isMatch ? 1 : 0,
        metadata: {
          output: out?.requiresDessertFocus || false,
          expected: exp?.requiresDessertFocus || false
        }
      };
    },
    
    // ========================================
    // SUMMARY SCORER: Field Accuracy (kept as summary)
    // ========================================
    function scoreFieldAccuracy({ input, output, expected }: any) {
      const out = output as any;
      const exp = expected as any;
      // Handle errors
      if (out?.error) {
        return {
          name: "field_accuracy",
          score: 0,
          metadata: { error: out.error }
        };
      }
      
      let correctFields = 0;
      let totalFields = 0;
      
      // Check each expected field
      for (const key in exp) {
        totalFields++;
        
        // Normalize both values before comparison
        const outputVal = normalizeField(key, out?.[key]);
        const expectedVal = normalizeField(key, exp?.[key]);
        
        // Compare using JSON stringify for deep equality
        if (JSON.stringify(outputVal) === JSON.stringify(expectedVal)) {
          correctFields++;
        }
      }
      
      const score = totalFields > 0 ? correctFields / totalFields : 1;
      return {
        name: "field_accuracy",
        score,
        metadata: {
          correctFields,
          totalFields
        }
      };
    },
    
    // ========================================
    // SCORER 2: Context Preservation
    // ========================================
    function scoreContextPreservation({ input, output, expected }: any) {
      const inp = input as any;
      const out = output as any;
      const exp = expected as any;
      // Only score follow-up queries
      if (!inp?.context) {
        return null; // Skip this scorer for non-follow-ups
      }
      
      // Handle errors
      if (out?.error) {
        return {
          name: "context_preservation",
          score: 0,
          metadata: { error: out.error }
        };
      }
      
      const previousKeywords = inp.context.previousKeywords;
      let preservedFields = 0;
      let unchangedFields = 0;
      
      // Determine which fields should remain unchanged
      for (const key in previousKeywords) {
        // Normalize values before comparison
        const normalizedExpected = normalizeField(key, exp?.[key]);
        const normalizedPrev = normalizeField(key, previousKeywords[key]);
        
        // Skip fields that are expected to change (different value in expected)
        if (normalizedExpected !== undefined && 
            JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedPrev)) {
          // This field is supposed to change, skip it
          continue;
        }
        
        // Skip fields that are expected to be removed (exist in previous but not in expected)
        if (normalizedExpected === undefined && normalizedPrev !== undefined) {
          // This field should be removed, skip it (not counted as unchanged)
          continue;
        }
        
        unchangedFields++;
        
        // Check if field was preserved (normalize output too)
        const normalizedOutput = normalizeField(key, out?.[key]);
        if (JSON.stringify(normalizedOutput) === JSON.stringify(normalizedPrev)) {
          preservedFields++;
        }
      }
      
      const score = unchangedFields > 0 ? preservedFields / unchangedFields : 1;
      return {
        name: "context_preservation",
        score,
        metadata: {
          preservedFields,
          unchangedFields
        }
      };
    },
    
    // ========================================
    // SCORER 2B: Modification Accuracy (for follow-ups)
    // ========================================
    function scoreModificationAccuracy({ input, output, expected }: any) {
      const inp = input as any;
      const out = output as any;
      const exp = expected as any;
      // Only score follow-up queries
      if (!inp?.context) {
        return null; // Skip this scorer for non-follow-ups
      }
      
      // Handle errors
      if (out?.error) {
        return {
          name: "modification_accuracy",
          score: 0,
          metadata: { error: out.error }
        };
      }
      
      const previousKeywords = inp.context.previousKeywords;
      let correctModifications = 0;
      let totalExpectedModifications = 0;
      const modificationDetails: any = {
        correct: [],
        incorrect: [],
        missing: [],
        unexpected: []
      };
      
      // Collect all fields that exist in either expected or previousKeywords
      const allFields = new Set([
        ...Object.keys(exp || {}),
        ...Object.keys(previousKeywords || {})
      ]);
      
      // Check each field for modifications
      for (const key of allFields) {
        // Normalize values for comparison
        const normalizedExpected = normalizeField(key, exp?.[key]);
        const normalizedPrev = normalizeField(key, previousKeywords?.[key]);
        const normalizedOutput = normalizeField(key, out?.[key]);
        
        // Check if this field should have changed (value change, addition, or removal)
        const prevExists = normalizedPrev !== undefined && normalizedPrev !== null;
        const expectedExists = normalizedExpected !== undefined && normalizedExpected !== null;
        const shouldChange = 
          // Value change: field exists in both but values differ
          (prevExists && expectedExists && JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedPrev)) ||
          // Addition: field doesn't exist in previous but exists in expected
          (!prevExists && expectedExists) ||
          // Removal: field exists in previous but doesn't exist in expected
          (prevExists && !expectedExists);
        
        // Skip fields that shouldn't change (handled by context_preservation)
        if (!shouldChange) {
          continue;
        }
        
        // This field should have changed
        totalExpectedModifications++;
        
        // Check if the modification was correct
        const isCorrect = JSON.stringify(normalizedOutput) === JSON.stringify(normalizedExpected);
        
        if (isCorrect) {
          correctModifications++;
          modificationDetails.correct.push({
            field: key,
            previous: normalizedPrev,
            expected: normalizedExpected,
            output: normalizedOutput,
            type: !prevExists ? 'addition' : !expectedExists ? 'removal' : 'change'
          });
        } else {
          // Modification was incorrect
          modificationDetails.incorrect.push({
            field: key,
            previous: normalizedPrev,
            expected: normalizedExpected,
            output: normalizedOutput,
            type: !prevExists ? 'addition' : !expectedExists ? 'removal' : 'change'
          });
        }
      }
      
      // Check for unexpected modifications (fields that changed but shouldn't have)
      for (const key in out) {
        const normalizedOutput = normalizeField(key, out?.[key]);
        const normalizedPrev = normalizeField(key, previousKeywords?.[key]);
        const normalizedExpected = normalizeField(key, exp?.[key]);
        
        // Skip if this field should have changed (already checked above)
        const shouldChange = normalizedExpected !== undefined &&
          JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedPrev);
        if (shouldChange) {
          continue;
        }
        
        // Check if this field unexpectedly changed
        const didChange = normalizedOutput !== undefined &&
          JSON.stringify(normalizedOutput) !== JSON.stringify(normalizedPrev);
        
        if (didChange) {
          modificationDetails.unexpected.push({
            field: key,
            previous: normalizedPrev,
            expected: normalizedExpected,
            output: normalizedOutput
          });
        }
      }
      
      const score = totalExpectedModifications > 0 
        ? correctModifications / totalExpectedModifications 
        : 1; // If no modifications expected, score is 1
      
      return {
        name: "modification_accuracy",
        score,
        metadata: {
          correctModifications,
          totalExpectedModifications,
          modifications: modificationDetails
        }
      };
    }
  ]
} as any);