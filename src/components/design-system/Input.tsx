import React from 'react';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onKeyPress?: (e: React.KeyboardEvent) => void;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  className = '',
  onKeyPress,
}) => {
  const baseClasses = 'font-["JetBrains_Mono:Regular",_sans-serif] font-normal leading-normal bg-[#FCF6E8] text-[#1A1818] border border-[#B64809] rounded-xl px-5 py-4 w-full focus:outline-none focus:ring-2 focus:ring-[#B64809] focus:ring-offset-2 transition-all duration-200';
  
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : '';
  
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyPress={onKeyPress}
      placeholder={placeholder}
      disabled={disabled}
      className={`${baseClasses} ${disabledClasses} ${className}`}
    />
  );
};
