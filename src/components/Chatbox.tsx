import React, { useState, useEffect, useRef } from 'react';
import { useStatsigClient } from '@statsig/react-bindings';
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
  const { client } = useStatsigClient();
  const [message, setMessage] = useState('');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [visiblePrompts, setVisiblePrompts] = useState<number[]>([]);
  const [hasSelectedCityInSession, setHasSelectedCityInSession] = useState(false);
  const [hasClickedPromptInSession, setHasClickedPromptInSession] = useState(false);
  const [hoveredPrompt, setHoveredPrompt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if ((message.trim() || selectedCity) && !isLoading) {
      onSendMessage(message.trim(), selectedCity || undefined);
      setMessage('');
      setSelectedCity(null);
    }
  };

  const handlePillClick = (city: City) => {
    // Log city_selected event with comprehensive data
    client.logEvent("city_selected", city, {
      city: city,
      selection_method: "button",
      is_first_selection: (!hasSelectedCityInSession).toString(),
      timestamp: new Date().toISOString()
    });
    
    setSelectedCity(city);
    setVisiblePrompts([]); // Reset visible prompts
    setHasSelectedCityInSession(true); // Mark that user has selected a city in this session
    // Don't automatically navigate - show prompts instead
  };

  const handlePromptClick = (prompt: string) => {
    // Find the position of the prompt in the current city's prompts
    const currentCityPrompts = selectedCity ? CITY_PROMPTS[selectedCity] : [];
    const promptPosition = currentCityPrompts.findIndex(p => p === prompt) + 1; // 1-indexed
    
    // Log suggested_prompt_clicked event with comprehensive data
    client.logEvent("suggested_prompt_clicked", prompt, {
      prompt_text: prompt,
      city: selectedCity || 'Unknown',
      prompt_position: promptPosition.toString(),
      is_first_prompt_click: (!hasClickedPromptInSession).toString(),
      timestamp: new Date().toISOString()
    });
    
    // Mark that user has clicked a prompt in this session
    setHasClickedPromptInSession(true);
    
    // Store the original prompt text for tracking purposes
    // We'll pass this through the search flow to track if it leads to restaurant clicks
    const fullPromptText = selectedCity ? `${prompt} in ${selectedCity}` : prompt;
    
    // Send the prompt as the message
    onSendMessage(fullPromptText, selectedCity || undefined);
    setMessage('');
    setSelectedCity(null);
  };


  const isReadyToSubmit = message.trim().length > 0 && !isLoading;

  // Generate dynamic placeholder text
  const getPlaceholderText = () => {
    if (selectedCity && hoveredPrompt) {
      return `${hoveredPrompt} in ${selectedCity}`;
    }
    return "Recommend me restaurants in ...";
  };

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
              placeholder={getPlaceholderText()}
              className={`text-input ${selectedCity && hoveredPrompt ? 'dynamic-placeholder' : ''}`}
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
                onMouseEnter={() => setHoveredPrompt(prompt)}
                onMouseLeave={() => setHoveredPrompt(null)}
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
