import React, { useState } from 'react';
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
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [responseScreenKey, setResponseScreenKey] = useState(0);
  const [botResponse, setBotResponse] = useState('');
  const [, setUsedClaude] = useState(false);

  const handleSendMessage = async (message: string, city?: City) => {
    console.log('handleSendMessage called with:', { message, city });
    setIsLoading(true);
    
    // Create full query
    let fullQuery = '';
    if (message && city) {
      fullQuery = `${message} in ${city}`;
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

    try {
      // All filtering now happens on the backend
      console.log('Calling backend for restaurant filtering...');
      
      const response = await fetch('https://curatedbycynthia-dro5wohby-cynthia-xins-projects.vercel.app/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: fullQuery,
        }),
      });

      if (!response.ok) {
        console.error('Backend error:', response.status, response.statusText);
        setRestaurants([]);
        setBotResponse(`Sorry, there was an error processing your request. Please try again.`);
        setUsedClaude(false);
        return;
      }

      const data = await response.json();
      console.log('API response:', data);
      
      if (data.recommendations && data.recommendations.length > 0) {
        // Convert API response to Restaurant format
        const restaurants = data.recommendations.map((rec: any) => ({
          google_data: {
            displayName: { text: rec.restaurantName },
            rating: rec.rating,
            userRatingCount: rec.reviewCount,
            primaryType: rec.cuisineType,
            types: [rec.cuisineType],
            addressComponents: [],
            reviews: [],
          },
          original_place: {
            properties: {
              location: {
                address: rec.address,
                country_code: 'US',
              },
            },
            geometry: {
              coordinates: [0, 0],
              type: 'Point' as const,
            },
            type: 'Feature' as const,
          },
          neighborhood_extracted: rec.neighborhood,
          specific_type: rec.cuisineType,
          place_classification: 'restaurant',
          enrichment_status: 'success',
          enrichment_date: new Date().toISOString(),
          cynthias_pick: rec.cynthiasPick || false,
          price_display: rec.priceRange,
          // Add custom fields for display
          _apiReason: rec.reason,
          _apiHighlights: rec.highlights,
          _apiMatchScore: rec.matchScore,
        })) as any;

        setRestaurants(restaurants);
        setBotResponse(data.summary + ' ⚡');
        setUsedClaude(false);
      } else {
        setRestaurants([]);
        setBotResponse(data.summary || `No restaurants found for "${fullQuery}". Try a different search!`);
        setUsedClaude(false);
      }

      setResponseScreenKey(prev => prev + 1);
      
    } catch (error) {
      console.error('Error getting recommendations:', error);
      setRestaurants([]);
      setBotResponse(`Sorry, there was an error processing your request. Please try again.`);
      setUsedClaude(false);
    } finally {
      setIsLoading(false);
    }
  };

  const shouldShowResults = restaurants.length > 0 && !isLoading;
  
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
        onBackToSearch={() => {
          setRestaurants([]);
          setLastQuery('');
          setBotResponse('');
        }}
        onSendMessage={handleSendMessage}
      />
    );
  }

  return (
    <div className="content-container">
      <h1 className="main-title">Dining spots, curated by Cynthia</h1>
      <div className={`${className}`}>
        <Chatbox 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="font-['JetBrains_Mono:Regular',_sans-serif] text-[#7F7F7F]">
              Finding the perfect restaurants for you...
            </div>
          </div>
        )}

        {restaurants.length === 0 && !isLoading && lastQuery && (
          <div className="text-center py-8">
            <div className="no-results-message">
              No restaurants found for "{lastQuery}". Try a different search!
            </div>
          </div>
        )}
      </div>
    </div>
  );
};