import React, { useState } from 'react';
import { useStatsigClient } from '@statsig/react-bindings';
import { Chatbox } from './Chatbox';
import { ResponseScreen } from './ResponseScreen';
import { Restaurant, City } from '../types/restaurant';
// All filtering now happens on the backend - no local imports needed

interface ChatInterfaceProps {
  className?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  className = '' 
}) => {
  const { client } = useStatsigClient();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [responseScreenKey, setResponseScreenKey] = useState(0);
  const [botResponse, setBotResponse] = useState('');
  const [, setUsedClaude] = useState(false);
  const [originalPromptText, setOriginalPromptText] = useState<string | null>(null);
  const [promptClickTimestamp, setPromptClickTimestamp] = useState<number | null>(null);

  // Helper function to detect if a query came from a prompt
  const checkIfPromptQuery = (query: string): boolean => {
    const promptPatterns = [
      "Cynthia's favorites",
      "Sushi restaurants loved by locals",
      "Coffee shops",
      "Traditional Japanese food",
      "Brunch restaurants",
      "Romantic dinner",
      "Best Thai restaurants",
      "Traditional French fare",
      "Galettes and crepes",
      "Traditional Korean food"
    ];
    
    return promptPatterns.some(pattern => 
      query.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  const handleSendMessage = async (message: string, city?: City) => {
    console.log('handleSendMessage called with:', { message, city });
    setIsLoading(true);
    
    // Create full query
    let fullQuery = '';
    if (message && city) {
      // Check if message already contains the city name to avoid duplication
      const cityLower = city.toLowerCase();
      const messageLower = message.toLowerCase();
      if (messageLower.includes(cityLower)) {
        fullQuery = message; // Message already contains city
      } else {
        fullQuery = `${message} in ${city}`;
      }
      setLastQuery(fullQuery);
    } else if (message) {
      fullQuery = message;
      setLastQuery(message);
    } else if (city) {
      fullQuery = `restaurants in ${city}`;
      setLastQuery(city);
    } else {
      setLastQuery('');
    }

    // Check if this query came from a prompt by looking for common prompt patterns
    const isPromptQuery = checkIfPromptQuery(fullQuery);
    if (isPromptQuery) {
      setOriginalPromptText(fullQuery);
      setPromptClickTimestamp(Date.now());
    } else {
      setOriginalPromptText(null);
      setPromptClickTimestamp(null);
    }

    // Log search_initiated event RIGHT BEFORE calling the API
    client.logEvent('search_initiated', fullQuery, {
      query: fullQuery,
      query_length: fullQuery.length.toString(),
      contains_location: fullQuery.toLowerCase().includes(' in ').toString(),
      timestamp: new Date().toISOString()
    });

    const apiStartTime = Date.now();

    try {
      // All filtering now happens on the backend
      console.log('Calling backend for restaurant filtering...');
      console.log('🔥 ABOUT TO FETCH - CHECK NETWORK TAB NOW!'); 

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: fullQuery,
          userId: 'web-user', // Add userId for Statsig Dynamic Config
        }),
      });

      if (!response.ok) {
        console.error('Backend error:', response.status, response.statusText);
        
        // Log search_failed event for API errors
        client.logEvent('search_failed', fullQuery, {
          query: fullQuery,
          error_message: `API Error: ${response.status} ${response.statusText}`
        });
        
        setRestaurants([]);
        setBotResponse(`Sorry, there was an error processing your request. Please try again.`);
        setUsedClaude(false);
        return;
      }

      const data = await response.json();
      console.log('API response:', data);
      
      const responseTime = Date.now() - apiStartTime;
      
      if (data.recommendations && data.recommendations.length > 0) {
        // API returns restaurant objects directly - no conversion needed
        const restaurants = data.recommendations as Restaurant[];
        
        // Count Cynthia's picks
        const cynthiasPicksCount = restaurants.filter(r => r.cynthias_pick === true).length;

        // Log search_completed event RIGHT AFTER receiving results
        client.logEvent('search_completed', fullQuery, {
          query: fullQuery,
          results_count: restaurants.length.toString(),
          has_results: "true",
          cynthias_picks_count: cynthiasPicksCount.toString(),
          response_time_ms: responseTime.toString()
        });

        setRestaurants(restaurants);
        setBotResponse(data.summary + ' ⚡');
        setUsedClaude(false);
      } else {
        // Log search_no_results event when no results
        client.logEvent('search_no_results', fullQuery, {
          query: fullQuery,
          timestamp: new Date().toISOString()
        });

        setRestaurants([]);
        setBotResponse(data.summary || `No spots found for "${fullQuery}". Try a different search!`);
        setUsedClaude(false);
      }

      setResponseScreenKey(prev => prev + 1);
      
    } catch (error) {
      console.error('Error getting recommendations:', error);
      
      // Log search_failed event for network/other errors
      client.logEvent('search_failed', fullQuery, {
        query: fullQuery,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
      
      setRestaurants([]);
      setBotResponse(`Sorry, there was an error processing your request. Please try again.`);
      setUsedClaude(false);
    } finally {
      setIsLoading(false);
    }
  };

  const shouldShowResults = restaurants.length > 0 || isLoading;
  
  if (shouldShowResults) {
    let userPrompt = 'Recommend me some restaurants';
    if (lastQuery.trim()) {
      userPrompt = lastQuery;
    }
    
    return (
      <ResponseScreen
        key={responseScreenKey}
        userPrompt={userPrompt}
        botResponse={botResponse}
        restaurants={restaurants}
        searchQuery={lastQuery}
        originalPromptText={originalPromptText}
        promptClickTimestamp={promptClickTimestamp}
        isLoading={isLoading}
        onBackToSearch={() => {
          setRestaurants([]);
          setLastQuery('');
          setBotResponse('');
          setOriginalPromptText(null);
          setPromptClickTimestamp(null);
        }}
        onSendMessage={handleSendMessage}
      />
    );
  }

  return (
    <div className="content-container">
      <h1 className="main-title">Dining spots, curated by Cynthia</h1>
      <Chatbox 
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />

      {restaurants.length === 0 && !isLoading && lastQuery && (
        <div className="no-results-message">
          No spots found for "{lastQuery}". Try a different search!
        </div>
      )}
    </div>
  );
};