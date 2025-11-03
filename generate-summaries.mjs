#!/usr/bin/env node

/**
 * Generate generativeSummary for restaurants missing summaries
 * Uses Claude API to create one-sentence punchy summaries based on reviews, tags, and metadata
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAIN_DATA_FILE = join(__dirname, 'api/data/latest_277.ts');
const ADDITIONAL_DATA_FILE = join(__dirname, 'api/data/additional_restaurants_google_api.ts');
const RESTAURANTS_WITHOUT_SUMMARIES = join(__dirname, 'restaurants_without_summaries.json');
const CHECKPOINT_FILE = join(__dirname, 'summary_generation_checkpoint.json');
const REQUESTS_PER_MINUTE = 10;
const DELAY_MS = (60 / REQUESTS_PER_MINUTE) * 1000; // 6 seconds between requests

// Initialize Anthropic client
if (!ANTHROPIC_API_KEY) {
  console.error('❌ ERROR: ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// Pricing tracking
const COST_PER_INPUT_TOKEN = 3 / 1000000;
const COST_PER_OUTPUT_TOKEN = 15 / 1000000;
let totalCost = 0;
let processedCount = 0;
let failedCount = 0;

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load checkpoint if exists
 */
function loadCheckpoint() {
  try {
    const data = readFileSync(CHECKPOINT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { processedPlaceIds: [], startIndex: 0 };
  }
}

/**
 * Save checkpoint
 */
function saveCheckpoint(checkpoint) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

/**
 * Extract restaurant data for Claude analysis
 */
function extractRestaurantDataForSummary(restaurant) {
  const gd = restaurant.google_data || {};
  
  // Extract review texts (limit to top 6 reviews)
  let reviewTexts = '';
  if (gd.reviews && gd.reviews.length > 0) {
    const topReviews = gd.reviews
      .filter(r => r.text && r.text.text)
      .slice(0, 6)
      .map(r => `  - ${r.text.text}`)
      .join('\n');
    reviewTexts = topReviews || 'No reviews available';
  } else {
    reviewTexts = 'No reviews available';
  }
  
  // Extract review summary
  const reviewSummary = gd.reviewSummary?.text?.text || '';
  
  // Extract tags
  const tags = {
    vibe: restaurant.vibe_tags || [],
    occasion: restaurant.occasion_tags || [],
    crowd: restaurant.crowd_tags || [],
    service: restaurant.service_tags || [],
    noise: restaurant.noise_level || '',
    food_quality: restaurant.food_quality_tags || [],
    value: restaurant.value_tag || '',
    special_features: restaurant.special_features || [],
    booking: restaurant.booking_tags || [],
    negative: restaurant.negative_tags || [],
    accolades: restaurant.accolades_tags || []
  };
  
  return {
    name: gd.displayName?.text || restaurant.original_place?.properties?.location?.name || 'Unknown',
    placeId: restaurant.google_place_id,
    primaryType: gd.primaryType || gd.types?.[0] || 'restaurant',
    rating: gd.rating || null,
    reviewCount: gd.userRatingCount || 0,
    priceDisplay: restaurant.price_display || 
                   (gd.priceRange ? `$${gd.priceRange.startPrice?.units || '?'}-$${gd.priceRange.endPrice?.units || '?'}` : 'N/A'),
    address: gd.shortFormattedAddress || gd.formattedAddress || restaurant.original_place?.properties?.location?.address || '',
    neighborhood: restaurant.neighborhood_extracted || '',
    city: restaurant.city || '',
    reviewSummary,
    reviewTexts,
    tags,
    specificType: restaurant.specific_type || '',
    cynthiasPick: restaurant.cynthias_pick || false
  };
}

/**
 * Create prompt for Claude to generate summary
 */
function createSummaryPrompt(restaurantData) {
  // Build tags summary
  const tagsSummary = [];
  if (restaurantData.tags.vibe.length > 0) {
    tagsSummary.push(`Vibe: ${restaurantData.tags.vibe.join(', ')}`);
  }
  if (restaurantData.tags.food_quality.length > 0) {
    tagsSummary.push(`Food: ${restaurantData.tags.food_quality.join(', ')}`);
  }
  if (restaurantData.tags.special_features.length > 0) {
    tagsSummary.push(`Features: ${restaurantData.tags.special_features.join(', ')}`);
  }
  if (restaurantData.tags.value) {
    tagsSummary.push(`Value: ${restaurantData.tags.value}`);
  }
  
  return `Generate a one-sentence, punchy summary for this restaurant. Be specific, engaging, and capture what makes it special.

Restaurant: ${restaurantData.name}
Type: ${restaurantData.primaryType}${restaurantData.specificType ? ` (${restaurantData.specificType})` : ''}
Location: ${restaurantData.address}${restaurantData.neighborhood ? ` (${restaurantData.neighborhood})` : ''}
Rating: ${restaurantData.rating ? `${restaurantData.rating}★` : 'N/A'}${restaurantData.reviewCount ? ` (${restaurantData.reviewCount} reviews)` : ''}
Price: ${restaurantData.priceDisplay}
${restaurantData.cynthiasPick ? '✨ Cynthia\'s Pick' : ''}

${tagsSummary.length > 0 ? `TAGS:\n${tagsSummary.join('\n')}\n` : ''}
${restaurantData.reviewSummary ? `REVIEW SUMMARY:\n${restaurantData.reviewSummary}\n` : ''}
REVIEWS:
${restaurantData.reviewTexts}

---
Write ONE engaging sentence that captures the essence of this restaurant. Be specific about what makes it special - mention unique dishes, atmosphere, chef, concept, or standout features. Write in a style that's punchy and makes someone want to visit.

Examples:
- "Portugal-inspired bakery featuring traditional custard tarts, along with coffee and matcha."
- "Intimate omakase counter serving exceptional sushi in a minimalist setting."
- "Trendy Korean fusion spot known for its creative cocktails and Instagram-worthy dishes."

Return ONLY the summary sentence, no quotes, no markdown, just the text.`;
}

/**
 * Call Claude API to generate summary
 */
async function generateSummary(restaurant, retries = 3) {
  const restaurantData = extractRestaurantDataForSummary(restaurant);
  const prompt = createSummaryPrompt(restaurantData);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [
          { role: 'user', content: prompt }
        ]
      });
      
      // Track costs
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      const cost = (inputTokens * COST_PER_INPUT_TOKEN) + (outputTokens * COST_PER_OUTPUT_TOKEN);
      totalCost += cost;
      
      // Extract summary text
      let summaryText = message.content[0].text.trim();
      
      // Clean up if there are quotes or markdown
      summaryText = summaryText.replace(/^["']|["']$/g, '').trim();
      summaryText = summaryText.replace(/^`+|`+$/g, '').trim();
      
      return {
        success: true,
        summary: {
          overview: {
            text: summaryText,
            languageCode: "en-US"
          },
          disclosureText: {
            text: "Summarized with Claude",
            languageCode: "en-US"
          }
        },
        cost,
        tokens: { input: inputTokens, output: outputTokens }
      };
    } catch (error) {
      const isRetryable = error.message?.includes('529') || 
                         error.message?.includes('overloaded') ||
                         error.message?.includes('rate_limit') ||
                         error.status === 529 ||
                         error.status === 429;
      
      if (isRetryable && attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`   ⚠️  API error (attempt ${attempt}/${retries}), retrying in ${backoffMs/1000}s...`);
        await sleep(backoffMs);
        continue;
      }
      
      console.error(`Error generating summary for ${restaurantData.name}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Parse TypeScript file and extract restaurantData array
 */
function extractRestaurantData(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/export const restaurantData = (\[[\s\S]*\]);/);
  if (!match) {
    throw new Error(`Could not parse restaurant data from ${filePath}`);
  }
  const arrayContent = match[1];
  const restaurants = eval(arrayContent);
  return restaurants;
}

/**
 * Update restaurant data in file
 */
function updateRestaurantInFile(filePath, placeId, generativeSummary) {
  const content = readFileSync(filePath, 'utf-8');
  
  // Escape placeId for regex
  const escapedPlaceId = placeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Find the restaurant by placeId - look for the google_data object start
  // Pattern: "google_place_id": "PLACE_ID" ... "google_data": { ... }
  // We need to match until we find the closing of google_data, which is followed by place_classification
  // Use a more precise pattern that avoids matching inside nested structures
  const restaurantPattern = new RegExp(
    `("google_place_id":\\s*"${escapedPlaceId}"[\\s\\S]*?"google_data":\\s*\\{)([\\s\\S]*?)(\\n\\s*\\}\\s*,\\s*\\n\\s*"place_classification"|\\n\\s*\\}\\s*,\\s*\\n\\s*\\])`,
    'm'
  );
  
  const match = content.match(restaurantPattern);
  if (!match) {
    console.warn(`   ⚠️  Could not find restaurant with placeId ${placeId} in file`);
    return false;
  }
  
  const googleDataStart = match[1]; // Includes "google_place_id" and up to "google_data": {
  const googleDataContent = match[2]; // The content of google_data object
  const afterGoogleData = match[3]; // The closing brace and what comes after
  
  // Check if generativeSummary already exists
  if (googleDataContent.includes('"generativeSummary"')) {
    console.log(`   ℹ️  generativeSummary already exists for ${placeId}, skipping update`);
    return false;
  }
  
  // Format the generativeSummary object with proper indentation (6 spaces for google_data content)
  // Include the key name "generativeSummary"
  const summaryString = '"generativeSummary": ' + JSON.stringify(generativeSummary, null, 2)
    .split('\n')
    .map((line, i) => i === 0 ? '      ' + line : '      ' + line)
    .join('\n');
  
  // Find insertion point - prioritize googleMapsLinks, then other common fields
  // Insert after accessibilityOptions/paymentOptions and before googleMapsLinks (like existing restaurants)
  const markers = [
    '"googleMapsLinks"',
    '"reviewSummary"',
    '"priceRange"',
    '"timeZone"',
    '"postalAddress"'
  ];
  
  let insertionPoint = -1;
  let markerFound = null;
  
  // Find the first matching marker
  for (const marker of markers) {
    const markerIndex = googleDataContent.indexOf(marker);
    if (markerIndex !== -1) {
      insertionPoint = markerIndex;
      markerFound = marker;
      break;
    }
  }
  
  let newGoogleDataContent;
  if (insertionPoint !== -1) {
    // Insert before the found marker
    const beforeMarker = googleDataContent.slice(0, insertionPoint).trim();
    const markerAndAfter = googleDataContent.slice(insertionPoint);
    
    // Ensure there's a comma after the last field before insertion
    const trimmedBefore = beforeMarker.replace(/,\s*$/, '');
    // Add proper indentation for the marker line
    const indentedMarker = markerAndAfter.split('\n')[0];
    const restAfterMarker = markerAndAfter.slice(indentedMarker.length);
    newGoogleDataContent = trimmedBefore + ',\n' + summaryString + ',\n      ' + indentedMarker + restAfterMarker;
  } else {
    // Insert at the end, before closing brace
    const trimmed = googleDataContent.trim().replace(/,\s*$/, '');
    // Check if there's content (not empty object)
    if (trimmed.length > 0) {
      newGoogleDataContent = trimmed + ',\n' + summaryString;
    } else {
      newGoogleDataContent = summaryString;
    }
  }
  
  const newContent = content.replace(restaurantPattern, `${googleDataStart}${newGoogleDataContent}${afterGoogleData}`);
  
  writeFileSync(filePath, newContent, 'utf-8');
  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting summary generation for restaurants without summaries...\n');
  
  // Load restaurants without summaries
  const restaurantsWithoutSummaries = JSON.parse(readFileSync(RESTAURANTS_WITHOUT_SUMMARIES, 'utf-8'));
  console.log(`📋 Found ${restaurantsWithoutSummaries.length} restaurants without summaries\n`);
  
  // Load checkpoint
  const checkpoint = loadCheckpoint();
  const processedPlaceIds = new Set(checkpoint.processedPlaceIds || []);
  const startIndex = checkpoint.startIndex || 0;
  
  console.log(`📍 Resuming from index ${startIndex} (${processedPlaceIds.size} already processed)\n`);
  
  // Load full restaurant data
  console.log('📂 Loading restaurant data files...');
  const mainRestaurants = extractRestaurantData(MAIN_DATA_FILE);
  const additionalRestaurants = extractRestaurantData(ADDITIONAL_DATA_FILE);
  const allRestaurants = [...mainRestaurants, ...additionalRestaurants];
  
  // Create lookup map by placeId
  const restaurantMap = new Map();
  allRestaurants.forEach(r => {
    restaurantMap.set(r.google_place_id, r);
  });
  
  console.log(`✅ Loaded ${mainRestaurants.length} + ${additionalRestaurants.length} restaurants\n`);
  
  // Process each restaurant
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (let i = startIndex; i < restaurantsWithoutSummaries.length; i++) {
    const restaurantInfo = restaurantsWithoutSummaries[i];
    const restaurant = restaurantMap.get(restaurantInfo.placeId);
    
    if (!restaurant) {
      console.log(`\n${i + 1}/${restaurantsWithoutSummaries.length}. ❌ Restaurant not found: ${restaurantInfo.name} (${restaurantInfo.placeId})`);
      results.failed.push({ ...restaurantInfo, reason: 'Not found in data' });
      continue;
    }
    
    // Skip if already processed
    if (processedPlaceIds.has(restaurantInfo.placeId)) {
      console.log(`\n${i + 1}/${restaurantsWithoutSummaries.length}. ⏭️  Skipping (already processed): ${restaurantInfo.name}`);
      results.skipped.push(restaurantInfo);
      continue;
    }
    
    console.log(`\n${i + 1}/${restaurantsWithoutSummaries.length}. Processing: ${restaurantInfo.name}`);
    console.log(`   Place ID: ${restaurantInfo.placeId}`);
    
    // Generate summary
    const result = await generateSummary(restaurant);
    
    if (result.success) {
      console.log(`   ✅ Generated: "${result.summary.overview.text}"`);
      console.log(`   💰 Cost: $${result.cost.toFixed(6)} (${result.tokens.input}+${result.tokens.output} tokens)`);
      
      // Update restaurant in file
      const fileToUpdate = restaurantInfo.source === 'main' ? MAIN_DATA_FILE : ADDITIONAL_DATA_FILE;
      const updated = updateRestaurantInFile(fileToUpdate, restaurantInfo.placeId, result.summary);
      
      if (updated) {
        console.log(`   ✅ Updated ${fileToUpdate}`);
        processedPlaceIds.add(restaurantInfo.placeId);
        results.success.push({ ...restaurantInfo, summary: result.summary.overview.text });
        processedCount++;
      } else {
        results.failed.push({ ...restaurantInfo, reason: 'Failed to update file' });
        failedCount++;
      }
      
      // Save checkpoint every 10 restaurants
      if (processedCount % 10 === 0) {
        saveCheckpoint({
          processedPlaceIds: Array.from(processedPlaceIds),
          startIndex: i + 1
        });
        console.log(`   💾 Checkpoint saved`);
      }
      
      // Rate limiting
      if (i < restaurantsWithoutSummaries.length - 1) {
        await sleep(DELAY_MS);
      }
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      results.failed.push({ ...restaurantInfo, reason: result.error });
      failedCount++;
    }
  }
  
  // Save final checkpoint
  saveCheckpoint({
    processedPlaceIds: Array.from(processedPlaceIds),
    startIndex: restaurantsWithoutSummaries.length
  });
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully processed: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);
  console.log(`💾 Final checkpoint saved`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed restaurants:');
    results.failed.forEach(f => {
      console.log(`   - ${f.name} (${f.placeId}): ${f.reason}`);
    });
  }
  
  console.log('\n✅ Done!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

