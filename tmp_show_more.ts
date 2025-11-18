import { preFilterRestaurants } from './api/services/filterService';
import { getHardcodedKeywordsForPrompt } from './api/services/parseQuery';
import { getMoreRestaurants } from './api/services/routingService';

async function test() {
  const query = 'Traditional French fare in Paris';
  const keywords = getHardcodedKeywordsForPrompt(query, 'paris');
  if (!keywords) {
    console.error('No keywords');
    return;
  }
  const results = await preFilterRestaurants(query, { ...keywords, city: 'paris' });
  console.log('Total results:', results.length);
  const firstTen = results.slice(0, 10);
  console.log('First 10 names:', firstTen.map(r => r.google_data.displayName.text));
  const prevRestaurants = results.filter(r => firstTen.some(fr => fr.google_place_id === r.google_place_id));
  const more = getMoreRestaurants(results, prevRestaurants);
  console.log('Next results count:', more.length);
  console.log('Next names:', more.slice(0, 10).map(r => r.google_data.displayName.text));
}

test();
