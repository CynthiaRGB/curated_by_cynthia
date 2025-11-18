import React, { useState, useEffect } from 'react';
import { useStatsigClient } from '@statsig/react-bindings';
import { Restaurant } from '../types/restaurant';
// Photo utilities are loaded via photo mapping in the component

// Component to handle photo display
const RestaurantPhoto: React.FC<{ photoUrl: string; restaurantName: string }> = ({ photoUrl, restaurantName }) => {
  return (
    <div className="restaurant-photo-container">
      <img 
        src={photoUrl} 
        alt={restaurantName}
        className="restaurant-photo"
      />
    </div>
  );
};

interface AnimatedRestaurantCardsProps {
  restaurants: Restaurant[];
  delay?: number; // Delay between each card appearance
  startDelay?: number; // Delay before first card appears
  className?: string;
  searchQuery?: string; // Add search query for event logging
  searchResultsTimestamp?: number; // When search results were shown
  originalPromptText?: string | null; // Original prompt text if search came from prompt
  promptClickTimestamp?: number | null; // When the prompt was clicked
  onAllCardsVisible?: () => void; // Callback when all cards have finished animating
}

export const AnimatedRestaurantCards: React.FC<AnimatedRestaurantCardsProps> = ({
  restaurants,
  delay = 200, // 200ms delay between each card
  startDelay = 0, // Delay before first card appears
  className = '',
  searchQuery = '',
  searchResultsTimestamp = Date.now(),
  originalPromptText = null,
  promptClickTimestamp = null,
  onAllCardsVisible
}) => {
  const { client } = useStatsigClient();
  const [visibleCards, setVisibleCards] = useState<number[]>([]);
  const [photoMapping, setPhotoMapping] = useState<Record<string, string[]>>({});

  // Load photo mapping once to determine which restaurants have photos
  useEffect(() => {
    const loadPhotoMapping = async () => {
      try {
        const response = await fetch('/restaurant-photos/photo-mapping.json');
        if (response.ok) {
          const mapping = await response.json();
          setPhotoMapping(mapping);
        }
      } catch (error) {
        console.error('Error loading photo mapping:', error);
      }
    };
    
    loadPhotoMapping();
  }, []);

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
    
    if (restaurants.length === 0) {
      // If no restaurants, call callback immediately
      if (onAllCardsVisible) {
        onAllCardsVisible();
      }
      return;
    }

    // Show cards one by one with delay, starting after startDelay
    restaurants.forEach((_, index) => {
      setTimeout(() => {
        setVisibleCards(prev => {
          const newVisibleCards = [...prev, index];
          // Check if all cards are now visible (last card just appeared)
          if (newVisibleCards.length === restaurants.length && onAllCardsVisible) {
            // Call callback after a small delay to ensure the last card's animation has started
            setTimeout(() => {
              onAllCardsVisible();
            }, 50);
          }
          return newVisibleCards;
        });
      }, startDelay + (index * delay));
    });
  }, [restaurants, delay, startDelay, onAllCardsVisible]);

  const handleCardClick = (restaurant: Restaurant, index: number) => {
    // Open Google Maps immediately (don't wait for logging)
    window.open(restaurant.original_place.properties.google_maps_url, '_blank', 'noopener,noreferrer');
    
    // Log events asynchronously after opening the map (non-blocking)
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
  };

  return (
    <div className={`restaurant-cards ${className}`}>
      {restaurants.map((restaurant, index) => {
        // Get first photo URL from mapping (if available)
        const photoUrls = photoMapping[restaurant.google_place_id];
        const firstPhotoUrl = photoUrls && photoUrls.length > 0 ? photoUrls[0] : null;
        const hasPhoto = !!firstPhotoUrl;
        
        return (
          <div
            key={`${restaurant.google_place_id}-${index}`}
            className={`restaurant-card ${
              visibleCards.includes(index) ? 'restaurant-card-visible' : 'restaurant-card-hidden'
            } ${hasPhoto ? 'restaurant-card-with-photo' : ''}`}
            onClick={() => handleCardClick(restaurant, index)}
            title="Click to view on Google Maps"
          >
            <div className="restaurant-card-content">
              <div className="restaurant-text-content">
                <h3 className="restaurant-name">
                  {restaurant.cynthias_pick && '👑 '}
                  {restaurant.google_data.displayName.text}
                </h3>
                <div className="restaurant-details">
                  <span className="cuisine">
                    {restaurant.google_data.primaryType 
                      ? restaurant.google_data.primaryType
                          .split('_')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
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
                  <span className="separator">·</span>
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
              {hasPhoto && firstPhotoUrl && (
                <RestaurantPhoto 
                  photoUrl={firstPhotoUrl} 
                  restaurantName={restaurant.google_data.displayName.text}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
