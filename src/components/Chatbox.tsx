import React, { useState, useEffect, useRef } from 'react';
import { City } from '../types/restaurant';

interface ChatboxProps {
  onSendMessage: (message: string, city?: City) => void;
  isLoading?: boolean;
}

const CITIES: City[] = ['Tokyo', 'New York City', 'Paris', 'Seoul'];

// City-specific search prompts
const CITY_PROMPTS: Record<City, string[]> = {
  'Tokyo': [
    "Cynthia's favorites 👑",
    'Sushi restaurants loved by locals',
    'Coffee shops',
    'Traditional Japanese food'
  ],
  'New York City': [
    "Cynthia's favorites 👑",
    'Brunch restaurants',
    'Romantic dinner',
    'Best Thai restaurants'
  ],
  'Paris': [
    "Cynthia's favorites 👑",
    'Traditional French fare',
    'Galettes and crepes',
    'Coffee shops'
  ],
  'Seoul': [
    "Cynthia's favorites 👑",
    'Traditional Korean food',
    'Coffee shops'
  ]
};

export const Chatbox: React.FC<ChatboxProps> = ({
  onSendMessage,
  isLoading = false,
}) => {
  const [message, setMessage] = useState('');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [visiblePrompts, setVisiblePrompts] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if ((message.trim() || selectedCity) && !isLoading) {
      onSendMessage(message.trim(), selectedCity || undefined);
      setMessage('');
      setSelectedCity(null);
    }
  };

  const handlePillClick = (city: City) => {
    setSelectedCity(city);
    setVisiblePrompts([]); // Reset visible prompts
    // Don't automatically navigate - show prompts instead
  };

  const handlePromptClick = (prompt: string) => {
    // Send the prompt as the message
    onSendMessage(prompt, selectedCity || undefined);
    setMessage('');
    setSelectedCity(null);
  };


  const isReadyToSubmit = message.trim().length > 0 && !isLoading;

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Staggered animation for prompts
  useEffect(() => {
    if (selectedCity) {
      const prompts = CITY_PROMPTS[selectedCity];
      
      const revealNext = (index: number) => {
        if (index < prompts.length) {
          setVisiblePrompts(prev => [...prev, index]);
          setTimeout(() => revealNext(index + 1), 50); // 50ms delay between each prompt
        }
      };
      
      // Start revealing prompts immediately
      revealNext(0);
      
      return () => {
        // Cleanup function
      };
    } else {
      setVisiblePrompts([]);
    }
  }, [selectedCity]);

  return (
    <>
      <div className="chatbox-container">
        <div className="chatbox-content">
          <div className="text-input-area">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Recommend me restaurants in ..."
              className="text-input"
              disabled={isLoading}
              autoFocus
              rows={1}
            />
          </div>
          <div className="bottom-row">
            <div className="pills-container">
              {CITIES.map((city) => (
                <button
                  key={city}
                  className={`pill ${selectedCity === city ? 'selected' : ''}`}
                  onClick={() => handlePillClick(city)}
                >
                  <span className="pill-text">{city}</span>
                </button>
              ))}
            </div>
            <button
              className={`submit-button ${!isReadyToSubmit ? 'disabled' : ''}`}
              onClick={handleSubmit}
              disabled={!isReadyToSubmit}
            >
              <div className="arrow-container">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5,12 12,5 19,12"></polyline>
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>
      
      {/* City-specific prompts - positioned below chatbox */}
      {selectedCity && (
        <div className="city-prompts-container">
          <div className="city-prompts-list">
            {CITY_PROMPTS[selectedCity].map((prompt, index) => (
              <div
                key={index}
                className={`city-prompt-item ${visiblePrompts.includes(index) ? 'prompt-visible' : 'prompt-hidden'}`}
                onClick={() => handlePromptClick(prompt)}
              >
                <div className="prompt-text">
                  <span>{prompt}</span>
                  <svg 
                    className="prompt-arrow" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12,5 19,12 12,19"></polyline>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
