// enrich-additional-restaurants.js
// Enriches additional_restaurants_google_api.ts with sentiment and thematic tags using Claude API

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(__dirname, 'api', 'data', 'additional_restaurants_google_api.ts');
const OUTPUT_FILE = path.join(__dirname, 'api', 'data', 'additional_restaurants_google_api.ts');
const CHECKPOINT_FILE = path.join(__dirname, 'api', 'data', 'enrichment_checkpoint_additional.json');
const CHECKPOINT_INTERVAL = 2; // Save every 2 restaurants (only 2 total)
const REQUESTS_PER_MINUTE = 5; // Reduced rate: 5 requests/minute (12 seconds between requests)
const DELAY_MS = (60 / REQUESTS_PER_MINUTE) * 1000; // 12 seconds between requests

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Pricing (Claude Sonnet 4)
const COST_PER_INPUT_TOKEN = 3 / 1000000; // $3 per million tokens
const COST_PER_OUTPUT_TOKEN = 15 / 1000000; // $15 per million tokens

let totalCost = 0;
let processedCount = 0;

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Smart review sampling - use best 6 reviews for high-volume restaurants
 */
function sampleReviews(reviews, maxCount = 6) {
  if (!reviews || reviews.length === 0) return [];
  if (reviews.length <= maxCount) return reviews;
  
  // Sort by rating (prefer 4-5 star reviews for sentiment)
  const sorted = [...reviews].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return sorted.slice(0, maxCount);
}

/**
 * Extract relevant text from restaurant data for analysis
 */
function extractTextForAnalysis(restaurant) {
  const reviews = sampleReviews(restaurant.google_data?.reviews || [], 6);
  
  const reviewTexts = reviews.map((review, idx) => 
    `Review ${idx + 1} (${review.rating}★): ${review.text?.text || ''}`
  ).join('\n\n');

  const editorialSummary = restaurant.google_data?.editorialSummary?.text || '';
  const generativeSummary = restaurant.google_data?.generativeSummary?.overview?.text || '';
  const reviewSummary = restaurant.google_data?.reviewSummary?.text?.text || '';

  return {
    name: restaurant.google_data?.displayName?.text || 'Unknown',
    primaryType: restaurant.google_data?.primaryType || '',
    types: restaurant.google_data?.types || [],
    rating: restaurant.google_data?.rating || 0,
    reviewCount: restaurant.google_data?.userRatingCount || 0,
    priceDisplay: restaurant.price_display || '',
    reviewTexts,
    editorialSummary,
    generativeSummary,
    reviewSummary
  };
}

/**
 * Create the enrichment prompt for Claude
 */
function createEnrichmentPrompt(restaurantData) {
  return `You are analyzing restaurant review data to extract sentiment and thematic tags. Your goal is to identify the vibe, atmosphere, occasions, and notable features of this restaurant based on reviews and descriptions.

Restaurant: ${restaurantData.name}
Type: ${restaurantData.primaryType}
Rating: ${restaurantData.rating}★ (${restaurantData.reviewCount} reviews)
Price: ${restaurantData.priceDisplay}

EDITORIAL SUMMARY:
${restaurantData.editorialSummary || 'N/A'}

REVIEW SUMMARY:
${restaurantData.reviewSummary || 'N/A'}

REVIEWS:
${restaurantData.reviewTexts || 'No reviews available'}

---

Extract tags for the following categories. Return ONLY a valid JSON object with no markdown formatting, explanations, or extra text.

TAG CATEGORIES:

1. vibe_tags (5-8 tags): romantic, cozy, trendy, casual, upscale, lively, quiet, intimate, rustic, modern, traditional, quirky, sophisticated, hip

2. occasion_tags (3-5 tags): date_night, first_date, second_date, anniversary, business_lunch, business_dinner, family_friendly, group_dining, solo_dining, celebration, casual_meetup, late_night, weekend_brunch

3. crowd_tags (2-4 tags): young_crowd, mature_crowd, tourist_friendly, locals_spot, see_and_be_seen, low_key, diverse_crowd, industry_hangout

4. service_tags (2-3 tags): attentive_service, quick_service, knowledgeable_staff, inconsistent_service, slow_service

5. noise_level (1 tag ONLY): loud, moderate_noise, quiet_ambiance

6. food_quality_tags (2-3 tags): exceptional_food, creative_menu, comfort_food, healthy_options, craft_cocktails, wine_focused, beer_selection, instagram_worthy_food

7. value_tag (1 tag ONLY): good_value, overpriced, splurge_worthy, affordable

8. special_features (1-4 tags): outdoor_seating, hidden_gem, speakeasy_vibe, historic_venue, scenic_views, unique_concept, chef_driven, instagrammable

9. booking_tags (1-2 tags): reservations_required, walk_in_friendly, long_wait_times, hard_to_get_into

10. negative_tags (0-2 tags): overrated, tourist_trap, cramped_space, service_issues

11. accolades_tags (0-3 tags): michelin_starred, michelin_1_star, michelin_2_star, michelin_3_star, michelin_bib_gourmand, james_beard_winner, james_beard_nominated, worlds_50_best, zagat_rated, eater_featured, ny_times_reviewed

IMPORTANT INSTRUCTIONS:
- Only include tags that are clearly supported by the review text or descriptions
- For instagrammable: look for mentions of "photogenic", "aesthetic", "beautiful space", "great for photos", "Instagram", "pretty"
- For accolades: scan for any mentions of Michelin, James Beard, Zagat, World's 50 Best, Eater features, or NYT reviews
- Be conservative - don't guess or assume tags
- Return valid JSON only, no markdown code blocks or extra formatting
- Use this exact structure:

{
  "vibe_tags": ["tag1", "tag2"],
  "occasion_tags": ["tag1", "tag2"],
  "crowd_tags": ["tag1", "tag2"],
  "service_tags": ["tag1", "tag2"],
  "noise_level": "tag",
  "food_quality_tags": ["tag1", "tag2"],
  "value_tag": "tag",
  "special_features": ["tag1", "tag2"],
  "booking_tags": ["tag1"],
  "negative_tags": [],
  "accolades_tags": []
}`;
}

/**
 * Call Claude API to enrich a single restaurant with retry logic
 */
async function enrichRestaurant(restaurant, retries = 3) {
  const restaurantData = extractTextForAnalysis(restaurant);
  const prompt = createEnrichmentPrompt(restaurantData);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      // Track costs
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      const cost = (inputTokens * COST_PER_INPUT_TOKEN) + (outputTokens * COST_PER_OUTPUT_TOKEN);
      totalCost += cost;

      // Parse response
      let responseText = message.content[0].text;
      
      // Strip markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const tags = JSON.parse(responseText);

      return {
        success: true,
        tags,
        cost,
        tokens: { input: inputTokens, output: outputTokens }
      };
    } catch (error) {
      const isRetryable = error.message.includes('529') || 
                         error.message.includes('overloaded') ||
                         error.message.includes('rate_limit') ||
                         error.status === 529 ||
                         error.status === 429;
      
      if (isRetryable && attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`   ⚠️  API error (attempt ${attempt}/${retries}), retrying in ${backoffMs/1000}s...`);
        await sleep(backoffMs);
        continue;
      }
      
      // Final attempt failed or non-retryable error
      console.error(`Error enriching ${restaurantData.name}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Extract restaurant data from TypeScript file
 */
function extractRestaurantsFromTS(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Find the restaurantData array
  const match = content.match(/export const restaurantData = \[([\s\S]*)\];/);
  if (!match) {
    throw new Error('Could not find restaurantData array in TS file');
  }
  
  const arrayContent = match[1];
  
  // Try to parse as JSON - need to wrap in array brackets
  try {
    const restaurants = JSON.parse('[' + arrayContent + ']');
    return restaurants;
  } catch (error) {
    // If JSON parsing fails, try using eval (less safe but works for TS exports)
    // Actually, let's use a safer approach - write to temp JSON and import
    console.warn('Direct JSON parsing failed, trying alternative method...');
    
    // Write temporary module file and import it
    const tempModulePath = path.join(__dirname, 'temp_restaurants.mjs');
    const moduleContent = `import { createRequire } from 'module';
const require = createRequire(import.meta.url);
${content.replace('export const', 'const')}
export { restaurantData };`;
    
    fs.writeFileSync(tempModulePath, moduleContent);
    
    // Dynamic import
    return import('file://' + tempModulePath).then(m => {
      fs.unlinkSync(tempModulePath);
      return m.restaurantData;
    });
  }
}

/**
 * Write restaurants back to TypeScript file
 */
function writeRestaurantsToTS(filePath, restaurants, originalContent) {
  // Extract the header comments
  const headerMatch = originalContent.match(/(\/\/.*\n)*/);
  const header = headerMatch ? headerMatch[0] : '';
  
  // Format restaurants as JSON with 2-space indent
  const restaurantsJSON = JSON.stringify(restaurants, null, 2);
  
  // Write back to TS file
  const output = header + `\nexport const restaurantData = ${restaurantsJSON};\n`;
  fs.writeFileSync(filePath, output, 'utf8');
}

/**
 * Load checkpoint if exists
 */
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    console.log(`\n📌 Resuming from checkpoint: ${checkpoint.processedCount} restaurants already enriched\n`);
    return checkpoint;
  }
  return null;
}

/**
 * Save checkpoint
 */
function saveCheckpoint(restaurants, processedCount, originalContent) {
  const checkpoint = {
    processedCount,
    timestamp: new Date().toISOString(),
    totalCost
  };
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  writeRestaurantsToTS(OUTPUT_FILE, restaurants, originalContent);
}

/**
 * Format time remaining
 */
function formatTimeRemaining(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Main enrichment process
 */
async function main() {
  console.log('🚀 Restaurant Enrichment Script (Additional Restaurants)');
  console.log('='.repeat(60));

  // Load original file content
  const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');

  // Load restaurants from TS file
  console.log(`\n📂 Reading: ${INPUT_FILE}`);
  let restaurants;
  try {
    const content = fs.readFileSync(INPUT_FILE, 'utf8');
    // Extract the array content between [ and ]; (excluding comments)
    const match = content.match(/export const restaurantData = (\[[\s\S]*?\]);/);
    if (match) {
      const arrayStr = match[1];
      restaurants = JSON.parse(arrayStr);
      console.log(`✓ Loaded ${restaurants.length} restaurants`);
    } else {
      throw new Error('Could not find restaurantData array');
    }
  } catch (error) {
    console.error('❌ Error reading file:', error.message);
    console.error('   Trying alternative parsing method...');
    
    // Alternative: remove comments and try parsing
    const cleaned = originalContent
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/export const restaurantData = /, '')
      .replace(/;$/, '')
      .trim();
    
    try {
      restaurants = JSON.parse(cleaned);
      console.log(`✓ Loaded ${restaurants.length} restaurants (after cleaning)`);
    } catch (e2) {
      console.error('❌ All parsing methods failed:', e2.message);
      process.exit(1);
    }
  }

  // Check for checkpoint
  const checkpoint = loadCheckpoint();
  const startIndex = checkpoint ? checkpoint.processedCount : 0;
  
  if (checkpoint) {
    totalCost = checkpoint.totalCost || 0;
    // Reload restaurants from the checkpoint file
    try {
      const checkpointContent = fs.readFileSync(OUTPUT_FILE, 'utf8');
      const checkpointMatch = checkpointContent.match(/export const restaurantData = (\[[\s\S]*\]);/);
      if (checkpointMatch) {
        restaurants = JSON.parse(checkpointMatch[1]);
      }
    } catch (e) {
      console.warn('Warning: Could not reload from checkpoint file, using original');
    }
  }

  // Create backup
  if (startIndex === 0) {
    const backupPath = INPUT_FILE.replace('.ts', '.backup.ts');
    fs.writeFileSync(backupPath, originalContent);
    console.log(`✓ Backup created: ${backupPath}`);
  }

  console.log(`\n⚙️  Settings:`);
  console.log(`   Rate limit: ${REQUESTS_PER_MINUTE} requests/minute (${DELAY_MS / 1000}s delay)`);
  console.log(`   Checkpoint: Every ${CHECKPOINT_INTERVAL} restaurants`);
  console.log(`   Starting from: Restaurant ${startIndex + 1}`);

  const totalToProcess = restaurants.length - startIndex;
  const estimatedTimeSeconds = (totalToProcess * DELAY_MS) / 1000;
  console.log(`\n⏱️  Estimated time: ${formatTimeRemaining(estimatedTimeSeconds)}`);
  console.log(`💰 Estimated cost: $${(totalToProcess * 0.016).toFixed(2)}\n`);

  console.log('='.repeat(60));
  console.log('🔄 Starting enrichment...\n');

  const startTime = Date.now();

  // Process restaurants
  for (let i = startIndex; i < restaurants.length; i++) {
    const restaurant = restaurants[i];
    const restaurantName = restaurant.google_data?.displayName?.text || `Restaurant ${i + 1}`;
    
    // Skip if already enriched (has non-empty tags)
    const hasTags = restaurant.vibe_tags && restaurant.vibe_tags.length > 0;
    if (hasTags) {
      console.log(`[${i + 1}/${restaurants.length}] Skipping ${restaurantName} (already enriched)`);
      processedCount = i + 1;
      continue;
    }
    
    console.log(`[${i + 1}/${restaurants.length}] Processing: ${restaurantName}`);

    // Enrich restaurant
    const result = await enrichRestaurant(restaurant);

    if (result.success) {
      // Update enriched tags in restaurant (preserve existing fields)
      Object.assign(restaurant, result.tags);
      
      const tagCount = Object.values(result.tags).flat().length + (result.tags.noise_level ? 1 : 0) + (result.tags.value_tag ? 1 : 0);
      console.log(`   ✓ Added ${tagCount} tags | Cost: $${result.cost.toFixed(4)} | Tokens: ${result.tokens.input}→${result.tokens.output}`);
    } else {
      console.log(`   ✗ Failed: ${result.error}`);
    }

    processedCount = i + 1;

    // Save checkpoint every N restaurants
    if ((processedCount % CHECKPOINT_INTERVAL === 0) || (processedCount === restaurants.length)) {
      saveCheckpoint(restaurants, processedCount, originalContent);
      console.log(`   💾 Checkpoint saved (${processedCount}/${restaurants.length})\n`);
    }

    // Rate limiting (skip delay on last restaurant)
    if (i < restaurants.length - 1) {
      await sleep(DELAY_MS);
    }

    // Progress indicator
    const elapsed = (Date.now() - startTime) / 1000;
    const avgTimePerRestaurant = elapsed / (processedCount - startIndex);
    const remaining = (restaurants.length - processedCount) * avgTimePerRestaurant;
    
    if (processedCount % 1 === 0) {
      console.log(`   📊 Progress: ${((processedCount / restaurants.length) * 100).toFixed(1)}% | ETA: ${formatTimeRemaining(remaining)} | Cost so far: $${totalCost.toFixed(2)}\n`);
    }
  }

  // Final save
  writeRestaurantsToTS(OUTPUT_FILE, restaurants, originalContent);
  
  // Clean up checkpoint
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }

  const totalTime = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('✨ Enrichment Complete!');
  console.log('='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Total restaurants processed: ${processedCount}`);
  console.log(`   Total time: ${formatTimeRemaining(totalTime)}`);
  console.log(`   Total cost: $${totalCost.toFixed(2)}`);
  console.log(`   Average cost per restaurant: $${(totalCost / processedCount).toFixed(4)}`);
  console.log(`\n✓ Enriched data saved to: ${OUTPUT_FILE}`);
  console.log('='.repeat(60));
}

// Run the script
main().catch(console.error);

