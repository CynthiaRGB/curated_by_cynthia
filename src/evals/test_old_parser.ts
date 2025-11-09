// eval/test_old_parser.ts
// Evaluation script for OLD Architecture (Deterministic Extraction)

import { Eval } from "braintrust";
import { extractKeywords } from "../../api/services/filterService";
import goldenQueries from "./golden_queries_clean.json";

/**
 * Evaluation: OLD Architecture (Deterministic Extraction)
 * Tests the extractKeywords function (regex-based) against golden dataset
 */
Eval("Query Parser - OLD Architecture (Deterministic Extraction)", {
  projectName: "curated-by-cynthia",
  
  // Load test data from golden dataset
  data: () => goldenQueries,
  
  // Task: Parse each query with deterministic extraction
  task: async (input) => {
    try {
      // OLD architecture doesn't support context
      // It just extracts keywords from the query string
      const result = extractKeywords(input.query);
      
      // Add city from input (extractKeywords doesn't parse city)
      return {
        ...result,
        city: input.city?.toLowerCase()
      };
    } catch (error) {
      console.error(`Error extracting keywords: ${input.query}`, error);
      return {
        error: error.message,
        query: input.query
      };
    }
  },
  
  // Scoring functions (same as NEW architecture for comparison)
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
      // OLD architecture CANNOT handle follow-ups
      if (!input.context) {
        return null; // Skip for non-follow-ups
      }
      
      // For follow-up queries, OLD architecture will always fail
      // because it doesn't have access to previous context
      return {
        name: "context_preservation",
        score: 0,
        metadata: { reason: "OLD architecture cannot handle context" }
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
        return null;
      }
      
      // Handle errors
      if (output.error) {
        return {
          name: "specialty_extracted",
          score: 0,
          metadata: { error: output.error }
        };
      }
      
      // OLD architecture doesn't extract cuisineSpecialty separately
      // It might extract it as cuisineType, but not as a specialty field
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
          !input.metadata?.category?.includes("price")) {
        return null;
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
      
      // OLD architecture uses simple keyword matching
      // Check if it detected instagrammable
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
      
      // Weighted combination
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
      
      // Context preservation (weight: 0.4)
      // OLD architecture always fails on follow-ups
      if (input.context) {
        score += 0 * 0.4; // Always 0 for OLD architecture
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
