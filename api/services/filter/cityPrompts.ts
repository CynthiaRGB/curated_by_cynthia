/**
 * City prompt patterns (aligned with CITY_PROMPTS in the Chatbox UI).
 */
export function isCityPromptItem(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  
  // List of city prompt patterns (matching CITY_PROMPTS from Chatbox component)
  const cityPromptPatterns = [
    "cynthia's favorites",
    "cynthias favorites",
    "sushi restaurants loved by locals",
    "coffee shops",
    "traditional japanese food",
    "brunch restaurants",
    "romantic dinner",
    "best thai restaurants",
    "traditional french fare",
    "galettes and crepes",
    "korean restaurant"
  ];
  
  // Check if query matches any prompt pattern (allowing for city suffix)
  return cityPromptPatterns.some(pattern => {
    const patternLower = pattern.toLowerCase();
    // Match exact pattern or pattern + " in [city]"
    return lowerQuery === patternLower || 
           lowerQuery.startsWith(patternLower + ' in ') ||
           lowerQuery.endsWith(' ' + patternLower) ||
           lowerQuery.includes(' ' + patternLower + ' ');
  });
}
