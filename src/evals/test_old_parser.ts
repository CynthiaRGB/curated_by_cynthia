// eval/test_old_parser.ts
// Evaluation script for OLD Architecture (Deterministic Extraction)

import { Eval } from "braintrust";
import { extractKeywords } from "../api/services/filterService";
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
    {
      name: "field_accuracy",
      scorer: (output, expected) => {
        // Handle errors
        if (output.error) {
          return 0;
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
        
        return totalFields > 0 ? correctFields / totalFields : 1;
      }
    },
    
    // ========================================
    // SCORER 2: Context Preservation
    // ========================================
    {
      name: "context_preservation",
      scorer: (output, expected, input) => {
        // OLD architecture CANNOT handle follow-ups
        if (!input.context) {
          return null; // Skip for non-follow-ups
        }
        
        // For follow-up queries, OLD architecture will always fail
        // because it doesn't have access to previous context
        return 0;
      }
    },
    
    // ========================================
    // SCORER 3: No Hallucination
    // ========================================
    {
      name: "no_hallucination",
      scorer: (output, expected) => {
        // Handle errors
        if (output.error) {
          return 0;
        }
        
        let hallucinations = 0;
        
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
          }
        }
        
        return hallucinations === 0 ? 1 : 0;
      }
    },
    
    // ========================================
    // SCORER 4: Cuisine Specialty Extraction
    // ========================================
    {
      name: "specialty_extracted",
      scorer: (output, expected, input) => {
        // Only score for specific dish queries
        if (input.metadata?.category !== "specific_dish") {
          return null;
        }
        
        // Handle errors
        if (output.error) {
          return 0;
        }
        
        // OLD architecture doesn't extract cuisineSpecialty separately
        // It might extract it as cuisineType, but not as a specialty field
        return output.cuisineSpecialty ? 1 : 0;
      }
    },
    
    // ========================================
    // SCORER 5: Price Level Accuracy
    // ========================================
    {
      name: "price_level_accuracy",
      scorer: (output, expected, input) => {
        // Only score for queries involving price
        if (!expected.priceLevel && 
            !input.metadata?.category?.includes("price")) {
          return null;
        }
        
        // Handle errors
        if (output.error) {
          return 0;
        }
        
        // Check if price level matches
        return output.priceLevel === expected.priceLevel ? 1 : 0;
      }
    },
    
    // ========================================
    // SCORER 6: Instagrammable Detection
    // ========================================
    {
      name: "instagrammable_detection",
      scorer: (output, expected, input) => {
        // Only score if expected requires instagrammable
        if (!expected.requiresInstagrammable) {
          return null;
        }
        
        // Handle errors
        if (output.error) {
          return 0;
        }
        
        // OLD architecture uses simple keyword matching
        // Check if it detected instagrammable
        return output.requiresInstagrammable === true ? 1 : 0;
      }
    }
  ]
});