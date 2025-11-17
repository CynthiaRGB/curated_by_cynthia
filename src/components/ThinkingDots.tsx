import React from 'react';
import './ThinkingDots.css';

interface ThinkingDotsProps {
  className?: string;
}

export const ThinkingDots: React.FC<ThinkingDotsProps> = ({ className = '' }) => {
  return (
    <span className={`thinking-dots ${className}`}>
      <span className="thinking-dot"></span>
      <span className="thinking-dot"></span>
      <span className="thinking-dot"></span>
    </span>
  );
};

