import React from 'react';
import { Restaurant } from '../../types/restaurant';

interface ResultCardProps {
  restaurant: Restaurant;
  isSpecial?: boolean;
  isHovered?: boolean;
  onClick?: () => void;
  className?: string;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  restaurant,
  isSpecial = false,
  isHovered = false,
  onClick,
  className = '',
}) => {
  const baseClasses = 'font-["JetBrains_Mono:Regular",_sans-serif] rounded-xl border border-[#B8A57F] transition-all duration-200 cursor-pointer';
  
  const stateClasses = isHovered 
    ? 'bg-[#EADBBE]' 
    : isSpecial 
    ? 'bg-[#FCF6E8]' 
    : 'bg-[#FCF6E8] hover:bg-[#EADBBE]';
  
  const formatPriceLevel = (priceLevel?: string) => {
    switch (priceLevel) {
      case 'PRICE_LEVEL_INEXPENSIVE': return '$';
      case 'PRICE_LEVEL_MODERATE': return '$$';
      case 'PRICE_LEVEL_EXPENSIVE': return '$$$';
      case 'PRICE_LEVEL_VERY_EXPENSIVE': return '$$$$';
      default: return '$$';
    }
  };
  
  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push('⭐');
    }
    if (hasHalfStar) {
      stars.push('⭐');
    }
    while (stars.length < 5) {
      stars.push('☆');
    }
    
    return stars.slice(0, 5);
  };
  
  return (
    <div
      className={`${baseClasses} ${stateClasses} p-4 flex flex-col gap-2 ${className}`}
      onClick={onClick}
      style={{ overflow: 'hidden' }}
    >
      {isSpecial && (
        <div className="flex items-center gap-2 font-bold text-xl">
          <span>🏆</span>
          <span className="text-[#1A1818]">{restaurant.google_data.displayName.text}</span>
        </div>
      )}
      
      {!isSpecial && (
        <h3 className="font-bold text-xl text-[#1A1818] w-full">
          {restaurant.google_data.displayName.text}
        </h3>
      )}
      
      <div className="flex items-center gap-2 text-base text-[#1A1818] flex-wrap">
        <span className="whitespace-nowrap">{restaurant.google_data.types[0] || 'Restaurant'}</span>
        <span>·</span>
        <span className="whitespace-nowrap">{formatPriceLevel(restaurant.google_data.priceLevel)}</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap">{restaurant.google_data.rating?.toFixed(1) || 'N/A'}</span>
          <div className="flex">
            {renderStars(restaurant.google_data.rating || 0).map((star, index) => (
              <span key={index} className="text-sm">{star}</span>
            ))}
          </div>
        </div>
      </div>
      
      <div className="text-base text-[#1A1818] break-words">
        {restaurant.google_data.formattedAddress}
      </div>
    </div>
  );
};

