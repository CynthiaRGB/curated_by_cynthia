// eval/test_query_parser.ts
import { Eval } from "braintrust";
import { parseQueryWithClaude } from "../../api/services/parseQuery";
import goldenQueries from "./golden_queries_clean.json";

// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normalize price level formats for comparison
 * Converts numeric (1,2,3,4) to string ("budget", "moderate", "upscale") format
 * This normalizes expected values to match output format
 */
function normalizePriceLevel(value: any): any {
  if (typeof value === 'number') {
    // Convert numeric to string (expected format -> output format)
    const priceMap: { [key: number]: string } = {
      1: 'budget',
      2: 'moderate',
      3: 'upscale',
      4: 'upscale' // 4 is also upscale (very expensive)
    };
    return priceMap[value] || value;
  }
  // If it's already a string or undefined, return as-is
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
  
  // Run tests sequentially to avoid rate limits
  maxConcurrency: 1,
  
  // Load test data from golden dataset
  data: () => goldenQueries,
  
  // Task: Parse each query with Claude
  task: async (input) => {
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
    // SCORER 1: Field Accuracy
    // ========================================
    function scoreFieldAccuracy({ input, output, expected }) {
      // Handle errors
      if (output.error) {
        return {
          name: "field_accuracy",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      let correctFields = 0;
      let totalFields = 0;
      
      // Check each expected field
      for (const key in expected) {
        totalFields++;
        
        // Normalize both values before comparison
        const outputVal = normalizeField(key, output[key]);
        const expectedVal = normalizeField(key, expected[key]);
        
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
    function scoreContextPreservation({ input, output, expected }) {
      // Only score follow-up queries
      if (!input.context) {
        return null; // Skip this scorer for non-follow-ups
      }
      
      // Handle errors
      if (output.error) {
        return {
          name: "context_preservation",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      const previousKeywords = input.context.previousKeywords;
      let preservedFields = 0;
      let unchangedFields = 0;
      
      // Determine which fields should remain unchanged
      for (const key in previousKeywords) {
        // Normalize values before comparison
        const normalizedExpected = normalizeField(key, expected[key]);
        const normalizedPrev = normalizeField(key, previousKeywords[key]);
        
        // Skip fields that are expected to change
        if (normalizedExpected !== undefined && 
            JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedPrev)) {
          // This field is supposed to change, skip it
          continue;
        }
        
        unchangedFields++;
        
        // Check if field was preserved (normalize output too)
        const normalizedOutput = normalizeField(key, output[key]);
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
    // SCORER 3: No Hallucination
    // ========================================
    function scoreNoHallucination({ input, output, expected }) {
      // Handle errors
      if (output.error) {
        return {
          name: "no_hallucination",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      let hallucinations = 0;
      const hallucinatedFields: string[] = [];
      
      // Check if output has fields that aren't in expected
      for (const key in output) {
        const outputValue = output[key];
        
        // Skip null, undefined, or empty values
        if (outputValue === null || 
            outputValue === undefined ||
            (Array.isArray(outputValue) && outputValue.length === 0) ||
            outputValue === "") {
          continue;
        }
        
        // If this field doesn't exist in expected, it's a hallucination
        if (expected[key] === undefined) {
          hallucinations++;
          hallucinatedFields.push(key);
        }
      }
      
      return {
        name: "no_hallucination",
        score: hallucinations === 0 ? 1 : 0,
        metadata: {
          hallucinations,
          hallucinatedFields
        }
      };
    },
    
    // ========================================
    // SCORER 4: Cuisine Specialty Extraction
    // ========================================
    function scoreSpecialtyExtracted({ input, output, expected }) {
      // Only score for specific dish queries
      if (input.metadata?.category !== "specific_dish") {
        return null; // Skip for other categories
      }
      
      // Handle errors
      if (output.error) {
        return {
          name: "specialty_extracted",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      // Check if cuisineSpecialty was extracted
      return {
        name: "specialty_extracted",
        score: output.cuisineSpecialty ? 1 : 0,
        metadata: {
          extracted: !!output.cuisineSpecialty,
          value: output.cuisineSpecialty
        }
      };
    },
    
    // ========================================
    // SCORER 5: Price Level Accuracy
    // ========================================
    function scorePriceLevelAccuracy({ input, output, expected }) {
      // Only score for queries involving price
      if (!expected.priceLevel && 
          !input.metadata?.category?.includes("price") &&
          !input.metadata?.category?.includes("follow_up_price")) {
        return null; // Skip if no price involved
      }
      
      // Handle errors
      if (output.error) {
        return {
          name: "price_level_accuracy",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      // Normalize both values before comparison
      const outputPrice = normalizePriceLevel(output.priceLevel);
      const expectedPrice = normalizePriceLevel(expected.priceLevel);
      
      // Check if price level matches
      const matches = outputPrice === expectedPrice;
      return {
        name: "price_level_accuracy",
        score: matches ? 1 : 0,
        metadata: {
          expected: expectedPrice,
          actual: outputPrice
        }
      };
    },
    
    // ========================================
    // SCORER 6: Instagrammable Detection
    // ========================================
    function scoreInstagrammableDetection({ input, output, expected }) {
      // Only score if expected requires instagrammable
      if (!expected.requiresInstagrammable) {
        return null;
      }
      
      // Handle errors
      if (output.error) {
        return {
          name: "instagrammable_detection",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      // Check if instagrammable was detected
      return {
        name: "instagrammable_detection",
        score: output.requiresInstagrammable === true ? 1 : 0,
        metadata: {
          detected: output.requiresInstagrammable === true
        }
      };
    }
  ]
});