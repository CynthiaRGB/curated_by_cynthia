import React from 'react';

interface SubmitButtonProps {
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  disabled = false,
  onClick,
  className = '',
}) => {
  const baseClasses = 'bg-[#B64809] rounded-full p-1.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#B64809] focus:ring-offset-2';
  
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#A03E08]';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${disabledClasses} ${className}`}
      aria-label="Submit"
    >
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="text-white"
      >
        <path 
          d="M12 4L12 20M4 12L20 12" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

