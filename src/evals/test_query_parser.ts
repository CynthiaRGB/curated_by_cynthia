// eval/test_query_parser.ts
import { Eval } from "braintrust";
import { parseQueryWithClaude } from "../../api/services/parseQuery";
import goldenQueries from "./golden_queries_clean.json";

// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        
        const outputVal = output[key];
        const expectedVal = expected[key];
        
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
        // Skip fields that are expected to change
        if (expected[key] !== undefined && 
            JSON.stringify(expected[key]) !== JSON.stringify(previousKeywords[key])) {
          // This field is supposed to change, skip it
          continue;
        }
        
        unchangedFields++;
        
        // Check if field was preserved
        if (JSON.stringify(output[key]) === JSON.stringify(previousKeywords[key])) {
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
      
      // Check if price level matches
      const matches = output.priceLevel === expected.priceLevel;
      return {
        name: "price_level_accuracy",
        score: matches ? 1 : 0,
        metadata: {
          expected: expected.priceLevel,
          actual: output.priceLevel
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
    },
    
    // ========================================
    // SCORER 7: Overall Quality Score
    // ========================================
    function scoreOverallQuality({ input, output, expected }) {
      // Handle errors
      if (output.error) {
        return {
          name: "overall_quality",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      // Weighted combination of different aspects
      let score = 0;
      let weight = 0;
      
      // Field accuracy (weight: 0.4)
      let correctFields = 0;
      let totalFields = 0;
      for (const key in expected) {
        totalFields++;
        if (JSON.stringify(output[key]) === JSON.stringify(expected[key])) {
          correctFields++;
        }
      }
      const fieldAccuracy = totalFields > 0 ? correctFields / totalFields : 1;
      score += fieldAccuracy * 0.4;
      weight += 0.4;
      
      // No extra fields (weight: 0.2)
      let extraFields = 0;
      for (const key in output) {
        const val = output[key];
        if (val !== null && val !== undefined && 
            !(Array.isArray(val) && val.length === 0) &&
            val !== "" &&
            expected[key] === undefined) {
          extraFields++;
        }
      }
      const noExtraScore = extraFields === 0 ? 1 : 0;
      score += noExtraScore * 0.2;
      weight += 0.2;
      
      // Context preservation (weight: 0.4 for follow-ups, 0 for others)
      if (input.context) {
        const prevKeywords = input.context.previousKeywords;
        let preserved = 0;
        let total = 0;
        
        for (const key in prevKeywords) {
          if (expected[key] !== undefined && 
              JSON.stringify(expected[key]) !== JSON.stringify(prevKeywords[key])) {
            continue;
          }
          total++;
          if (JSON.stringify(output[key]) === JSON.stringify(prevKeywords[key])) {
            preserved++;
          }
        }
        
        const contextScore = total > 0 ? preserved / total : 1;
        score += contextScore * 0.4;
        weight += 0.4;
      }
      
      const finalScore = weight > 0 ? score / weight : score;
      return {
        name: "overall_quality",
        score: finalScore,
        metadata: {
          fieldAccuracy,
          noExtraScore,
          weight
        }
      };
    }
  ]
});