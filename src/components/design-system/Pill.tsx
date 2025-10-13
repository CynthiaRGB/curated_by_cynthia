import React from 'react';

interface PillProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Pill: React.FC<PillProps> = ({
  children,
  selected = false,
  onClick,
  className = '',
}) => {
  const baseClasses = 'font-["JetBrains_Mono:Regular",_sans-serif] font-normal leading-normal rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer';
  
  const selectedClasses = selected 
    ? 'bg-[#EADBBE] text-[#1A1818] border border-[#B8A57F]' 
    : 'bg-[#FCF6E8] text-[#1A1818] border border-[#B8A57F] hover:bg-[#EADBBE]';
  
  return (
    <button
      className={`${baseClasses} ${selectedClasses} px-3 py-2 text-base ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

