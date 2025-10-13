import React, { useState, useEffect } from 'react';
import { Restaurant } from '../types/restaurant';

interface AnimatedRestaurantCardsProps {
  restaurants: Restaurant[];
  delay?: number; // Delay between each card appearance
  startDelay?: number; // Delay before first card appears
  className?: string;
}

export const AnimatedRestaurantCards: React.FC<AnimatedRestaurantCardsProps> = ({
  restaurants,
  delay = 200, // 200ms delay between each card
  startDelay = 0, // Delay before first card appears
  className = ''
}) => {
  const [visibleCards, setVisibleCards] = useState<number[]>([]);

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

  const handleCardClick = (restaurant: Restaurant) => {
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
          onClick={() => handleCardClick(restaurant)}
          title="Click to view on Google Maps"
        >
          <h3 className="restaurant-name">
            {restaurant.cynthias_pick && '👑 '}
            {restaurant.google_data.displayName.text}
          </h3>
          <div className="restaurant-details">
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
      ))}
    </div>
  );
};
