import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
  className = '',
}) => {
  const baseClasses = 'font-["JetBrains_Mono:Regular",_sans-serif] font-normal leading-normal rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-[#B64809] text-white hover:bg-[#A03E08] focus:ring-[#B64809]',
    secondary: 'bg-[#FCF6E8] text-[#1A1818] border border-[#B8A57F] hover:bg-[#EADBBE] focus:ring-[#B64809]',
    tertiary: 'bg-[#EADBBE] text-[#1A1818] border border-[#B8A57F] hover:bg-[#B8A57F] focus:ring-[#B64809]',
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };
  
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClasses} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

