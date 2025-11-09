import dotenv from 'dotenv';
dotenv.config();

console.log('='.repeat(50));
console.log('API Key Diagnostic');
console.log('='.repeat(50));

console.log('\n1. Environment variables:');
console.log('   ANTHROPIC_API_KEY set?', !!process.env.ANTHROPIC_API_KEY);
console.log('   API Key length:', process.env.ANTHROPIC_API_KEY?.length);
console.log('   First 20 chars:', process.env.ANTHROPIC_API_KEY?.substring(0, 20));

console.log('\n2. Testing parseQueryWithClaude import:');
import('./api/services/parseQuery').then(async (module) => {
  const { parseQueryWithClaude } = module;
  
  console.log('   Function imported?', typeof parseQueryWithClaude === 'function');
  
  console.log('\n3. Testing actual API call:');
  try {
    const result = await parseQueryWithClaude("Italian in Brooklyn", "NYC");
    console.log('   ✅ SUCCESS! Result:', JSON.stringify(result, null, 2));
    console.log('   priceLevel type:', typeof result.priceLevel);
    console.log('   neighborhood type:', typeof result.neighborhood);
  } catch (error) {
    console.error('   ❌ FAILED:', error.message);
  }
});