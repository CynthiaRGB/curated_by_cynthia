import React, { useState, useRef, useEffect } from 'react';
import { useStatsigClient } from '@statsig/react-bindings';
import { Restaurant, City } from '../types/restaurant';
import { TypewriterText } from './TypewriterText';
import { AnimatedRestaurantCards } from './AnimatedRestaurantCards';

// BotResponse component to coordinate typewriter and restaurant card timing
const BotResponse: React.FC<{ 
  text: string; 
  restaurants?: Restaurant[];
  searchQuery?: string;
  searchResultsTimestamp?: number;
  originalPromptText?: string | null;
  promptClickTimestamp?: number | null;
  isLoading?: boolean;
}> = ({ 
  text, 
  restaurants,
  searchQuery,
  searchResultsTimestamp,
  originalPromptText,
  promptClickTimestamp,
  isLoading = false
}) => {
  const [showRestaurantCards, setShowRestaurantCards] = useState(false);

  const handleTypewriterComplete = () => {
    setShowRestaurantCards(true);
  };

  return (
    <div className="response-content">
      <div className="response-text">
        {isLoading ? (
          // Show loading state like Google Gemini with AI icon
          <div className="flex items-center gap-2">
            <div className="ai-icon">✨</div>
            <span className="loading-text">{text}</span>
          </div>
        ) : (
          <TypewriterText 
            text={text} 
            onComplete={handleTypewriterComplete}
          />
        )}
      </div>
      
      {/* Show animated restaurant cards only after typewriter completes */}
      {restaurants && restaurants.length > 0 && showRestaurantCards && !isLoading && (
        <AnimatedRestaurantCards 
          restaurants={restaurants} 
          delay={200}
          searchQuery={searchQuery}
          searchResultsTimestamp={searchResultsTimestamp}
          originalPromptText={originalPromptText || undefined}
          promptClickTimestamp={promptClickTimestamp || undefined}
        />
      )}
    </div>
  );
};

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
  restaurants?: Restaurant[]; // Add restaurants to bot messages
  isLoading?: boolean; // Loading state for bot messages
}

interface ResponseScreenProps {
  userPrompt: string;
  botResponse: string;
  restaurants: Restaurant[];
  onBackToSearch: () => void;
  onSendMessage?: (message: string, city?: City) => void;
  onNewResults?: (restaurants: Restaurant[], query: string) => void;
  searchQuery?: string; // Add search query for event logging
  originalPromptText?: string | null; // Original prompt text if search came from prompt
  promptClickTimestamp?: number | null; // When the prompt was clicked
  isLoading?: boolean; // Loading state for new searches
}

const CITIES: City[] = ['Tokyo', 'New York City', 'Paris', 'Seoul'];

export const ResponseScreen: React.FC<ResponseScreenProps> = ({
  userPrompt,
  botResponse,
  restaurants,
  onBackToSearch,
  onSendMessage,
  onNewResults,
  searchQuery = userPrompt, // Default to userPrompt if searchQuery not provided
  originalPromptText = null,
  promptClickTimestamp = null,
  isLoading: isExternalLoading = false,
}) => {
  const { client } = useStatsigClient();
  const [message, setMessage] = useState('');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [hasSelectedCityInSession, setHasSelectedCityInSession] = useState(false);
  const [conversation, setConversation] = useState<Message[]>(() => {
    const messages: Message[] = [
      { id: 'user-1', text: userPrompt, isUser: true, timestamp: Date.now() }
    ];
    
    if (isExternalLoading) {
      // Show loading state like Google Gemini
      messages.push({
        id: 'bot-loading',
        text: 'Curating the best spots for you...',
        isUser: false,
        timestamp: Date.now() + 1,
        isLoading: true
      });
    } else {
      messages.push({
        id: 'bot-1',
        text: botResponse,
        isUser: false,
        timestamp: Date.now() + 1,
        restaurants: restaurants
      });
    }
    
    return messages;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if ((message.trim() || selectedCity) && !isLocalLoading) {
      const newMessage = message.trim() || `Recommend me restaurants in ${selectedCity}`;
      
      // Add user message to conversation
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: newMessage,
        isUser: true,
        timestamp: Date.now()
      };
      
      setConversation(prev => [...prev, userMessage]);
      
      // Add loading bot message
      const loadingMessage: Message = {
        id: `bot-loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: 'Finding the perfect restaurants for you...',
        isUser: false,
        timestamp: Date.now() + 1
      };
      
      setConversation(prev => [...prev, loadingMessage]);
      
      if (onSendMessage) {
        onSendMessage(message.trim(), selectedCity || undefined);
      }
      setMessage('');
      setSelectedCity(null);
    }
  };

  const handlePillClick = (city: City) => {
    console.log('ResponseScreen - Pill clicked:', city);
    
    // Log city_selected event with comprehensive data
    client.logEvent("city_selected", city, {
      city: city,
      selection_method: "button",
      is_first_selection: (!hasSelectedCityInSession).toString(),
      timestamp: new Date().toISOString()
    });
    
    setSelectedCity(city);
    setHasSelectedCityInSession(true); // Mark that user has selected a city in this session
    
    // Add user message to conversation
    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: `Recommend me restaurants in ${city}`,
      isUser: true,
      timestamp: Date.now()
    };
    
    setConversation(prev => [...prev, userMessage]);
    
    // Add loading bot message
    const loadingMessage: Message = {
      id: `bot-loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: 'Finding the perfect restaurants for you...',
      isUser: false,
      timestamp: Date.now() + 1
    };
    
    setConversation(prev => [...prev, loadingMessage]);
    
    if (onSendMessage) {
      onSendMessage('', city);
    }
  };

  const isReadyToSubmit = (message.trim().length > 0 || selectedCity) && !isLocalLoading;

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <div className="response-screen">
      <div className="conversation-container">
        {/* Render all conversation messages */}
        {conversation.map((msg, index) => (
          <div key={msg.id}>
            {msg.isUser ? (
              /* User prompt pill */
              <div className="prompt-pill">
                <p className="prompt-text">{msg.text}</p>
              </div>
            ) : (
              /* Bot response */
              <BotResponse 
                text={msg.text} 
                restaurants={msg.restaurants}
                searchQuery={searchQuery}
                searchResultsTimestamp={msg.timestamp}
                originalPromptText={originalPromptText}
                promptClickTimestamp={promptClickTimestamp}
                isLoading={msg.isLoading}
              />
            )}
          </div>
        ))}
        
        {/* Spacer to prevent content from being blocked by bottom chatbox */}
        <div className="bottom-spacer"></div>
      </div>

      {/* Chatbox at bottom */}
      <div className="bottom-chatbox">
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
                placeholder="Ask for more recommendations..."
                className="text-input"
                disabled={isLocalLoading}
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
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5,12 12,5 19,12"></polyline>
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
