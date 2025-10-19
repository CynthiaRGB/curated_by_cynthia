import React, { useState, useEffect } from 'react';
import { useStatsigClient } from '@statsig/react-bindings';
import { Restaurant } from '../types/restaurant';

interface AnimatedRestaurantCardsProps {
  restaurants: Restaurant[];
  delay?: number; // Delay between each card appearance
  startDelay?: number; // Delay before first card appears
  className?: string;
  searchQuery?: string; // Add search query for event logging
  searchResultsTimestamp?: number; // When search results were shown
  originalPromptText?: string | null; // Original prompt text if search came from prompt
  promptClickTimestamp?: number | null; // When the prompt was clicked
}

export const AnimatedRestaurantCards: React.FC<AnimatedRestaurantCardsProps> = ({
  restaurants,
  delay = 200, // 200ms delay between each card
  startDelay = 0, // Delay before first card appears
  className = '',
  searchQuery = '',
  searchResultsTimestamp = Date.now(),
  originalPromptText = null,
  promptClickTimestamp = null
}) => {
  const { client } = useStatsigClient();
  const [visibleCards, setVisibleCards] = useState<number[]>([]);

  // Helper function to calculate scroll depth percentage
  const calculateScrollDepth = () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    const scrollDepth = (scrollTop + windowHeight) / documentHeight;
    return Math.round(scrollDepth * 100);
  };

  useEffect(() => {
    // Reset visible cards when restaurants change
    setVisibleCards([]);
    
    if (restaurants.length === 0) return;

    // Show cards one by one with delay, starting after startDelay
    restaurants.forEach((_, index) => {
      setTimeout(() => {
        setVisibleCards(prev => [...prev, index]);
      }, startDelay + (index * delay));
    });
  }, [restaurants, delay, startDelay]);

  const handleCardClick = (restaurant: Restaurant, index: number) => {
    const timeSinceSearchResults = Math.round((Date.now() - searchResultsTimestamp) / 1000);
    
    // Log restaurant_clicked event
    client.logEvent('restaurant_clicked', restaurant.google_data.displayName.text, {
      restaurant_name: restaurant.google_data.displayName.text,
      restaurant_id: restaurant.google_place_id,
      is_cynthias_pick: (restaurant.cynthias_pick || false).toString(),
      position_in_results: (index + 1).toString(), // 1-indexed
      total_results_shown: restaurants.length.toString(),
      search_query: searchQuery,
      
      // Restaurant metadata
      rating: (restaurant.google_data.rating || 0).toString(),
      review_count: (restaurant.google_data.userRatingCount || 0).toString(),
      price_level: restaurant.price_display || 'N/A',
      neighborhood: restaurant.neighborhood_extracted || 'N/A',
      cuisine_type: restaurant.specific_type || 'N/A',
      
      // User context
      time_to_click_seconds: timeSinceSearchResults.toString(),
      scroll_depth_percentage: calculateScrollDepth().toString()
    });

    // Log prompt_led_to_restaurant_click event if this search came from a prompt
    if (originalPromptText && promptClickTimestamp) {
      const timeFromPromptToClick = Math.round((Date.now() - promptClickTimestamp) / 1000);
      
      client.logEvent('prompt_led_to_restaurant_click', restaurant.google_data.displayName.text, {
        prompt_text: originalPromptText,
        restaurant_name: restaurant.google_data.displayName.text,
        results_count: restaurants.length.toString(),
        time_to_click_seconds: timeFromPromptToClick.toString()
      });
    }

    // Log google_maps_opened event
    client.logEvent('google_maps_opened', restaurant.google_data.displayName.text, {
      restaurant_name: restaurant.google_data.displayName.text,
      is_cynthias_pick: (restaurant.cynthias_pick || false).toString(),
      position_in_results: (index + 1).toString()
    });

    // Open Google Maps in a new tab
    window.open(restaurant.original_place.properties.google_maps_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`restaurant-cards ${className}`}>
      {restaurants.map((restaurant, index) => (
        <div
          key={`${restaurant.google_place_id}-${index}`}
          className={`restaurant-card ${
            visibleCards.includes(index) ? 'restaurant-card-visible' : 'restaurant-card-hidden'
          }`}
          onClick={() => handleCardClick(restaurant, index)}
          title="Click to view on Google Maps"
        >
          <h3 className="restaurant-name">
            {restaurant.cynthias_pick && '👑 '}
            {restaurant.google_data.displayName.text}
          </h3>
          <div className="restaurant-details">
            <div className="restaurant-details-row">
              <span className="cuisine">
                {restaurant.google_data.types[0] 
                  ? restaurant.google_data.types[0]
                      .split('_')
                      .map(word => word === 'restaurant' ? 'restaurant' : word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ')
                  : 'N/A'
                }
              </span>
              <span className="separator">·</span>
              <span className="neighborhood">
                {restaurant.neighborhood_extracted || 'N/A'}
              </span>
              <span className="separator">·</span>
              <span className="price">
                {restaurant.price_display || 'N/A'}
              </span>
            </div>
            <div className="rating-container">
              <span className="rating">{restaurant.google_data.rating || 0}</span>
              <div className="stars">
                {Array.from({ length: 5 }, (_, i) => {
                  const rating = restaurant.google_data.rating || 0;
                  const filledStars = Math.round(rating);
                  const isFilled = i < filledStars;
                  return (
                    <span key={i} className={`star ${isFilled ? 'filled' : 'empty'}`}>
                      {isFilled ? '⭐' : '☆'}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
            {(restaurant.google_data.editorialSummary?.text || restaurant.google_data.generativeSummary?.overview?.text) && (
              <p className="restaurant-summary">
                {restaurant.google_data.editorialSummary?.text || restaurant.google_data.generativeSummary?.overview?.text}
              </p>
            )}
            <div className="maps-link-indicator">
            <span className="maps-text">📍 View on Google Maps</span>
          </div>
        </div>
      ))}
    </div>
  );
};
