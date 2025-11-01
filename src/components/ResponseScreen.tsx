import React, { useState, useRef, useEffect } from 'react';
import { Restaurant, City } from '../types/restaurant';
import { TypewriterText } from './TypewriterText';
import { AnimatedRestaurantCards } from './AnimatedRestaurantCards';

// Helper function to extract city from a query string
const extractCityFromQuery = (query: string): City | null => {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('new york city') || lowerQuery.includes('nyc') || lowerQuery.includes('new york')) {
    return 'New York City';
  } else if (lowerQuery.includes('tokyo')) {
    return 'Tokyo';
  } else if (lowerQuery.includes('paris')) {
    return 'Paris';
  } else if (lowerQuery.includes('seoul')) {
    return 'Seoul';
  }
  
  // Try to extract from "in [city]" pattern
  const match = query.match(/in\s+([^,\s]+(?:\s+[^,\s]+)*)/i);
  if (match) {
    const location = match[1].trim();
    if (location.toLowerCase().includes('new york') || location.toLowerCase().includes('nyc')) {
      return 'New York City';
    } else if (location.toLowerCase().includes('tokyo')) {
      return 'Tokyo';
    } else if (location.toLowerCase().includes('paris')) {
      return 'Paris';
    } else if (location.toLowerCase().includes('seoul')) {
      return 'Seoul';
    }
  }
  
  return null;
};

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
  searchQuery?: string; // Store the query for this specific message
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
  const [message, setMessage] = useState('');
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  // Track the original city from the first query
  const [originalCity, setOriginalCity] = useState<City | null>(() => {
    const city = extractCityFromQuery(searchQuery || userPrompt);
    return city;
  });
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
        isLoading: true,
        searchQuery: searchQuery || userPrompt
      });
    } else {
      messages.push({
        id: 'bot-1',
        text: botResponse,
        isUser: false,
        timestamp: Date.now() + 1,
        restaurants: restaurants,
        searchQuery: searchQuery || userPrompt
      });
    }
    
    return messages;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track the last bot response ID to detect new results
  const lastBotMessageIdRef = useRef<string>('bot-1');

  const handleSubmit = () => {
    if (message.trim() && !isLocalLoading) {
      const originalMessage = message.trim();
      
      // For display in prompt-pill: use the original message without appending city
      // For backend: pass message and city separately so ChatInterface can construct the full query
      let queryForBackend = originalMessage;
      
      // If we have an original city and the follow-up doesn't mention a city, append it for backend query
      if (originalCity) {
        const messageLower = originalMessage.toLowerCase();
        const cityLower = originalCity.toLowerCase();
        
        // Check if message already contains the city name
        if (!messageLower.includes(cityLower) && !messageLower.includes('nyc') && 
            !(cityLower === 'new york city' && messageLower.includes('new york'))) {
          queryForBackend = `${originalMessage} in ${originalCity}`;
        }
      }
      
      // Add user message to conversation - display original message without "in [city]"
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: originalMessage, // Display original message in prompt-pill
        isUser: true,
        timestamp: Date.now()
      };
      
      setConversation(prev => [...prev, userMessage]);
      
      // Add loading bot message
      const loadingMessageId = `bot-loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const loadingMessage: Message = {
        id: loadingMessageId,
        text: 'Finding the perfect restaurants for you...',
        isUser: false,
        timestamp: Date.now() + 1,
        isLoading: true,
        searchQuery: queryForBackend // Use full query with city for search query tracking
      };
      
      setConversation(prev => [...prev, loadingMessage]);
      setIsLocalLoading(true);
      lastBotMessageIdRef.current = loadingMessageId;
      
      if (onSendMessage) {
        // Pass original message and city separately - ChatInterface will handle constructing the full query
        onSendMessage(originalMessage, originalCity || undefined);
      }
      setMessage('');
    }
  };

  const isReadyToSubmit = message.trim().length > 0 && !isLocalLoading;

  // Update conversation when new results arrive (for follow-up queries or initial load)
  useEffect(() => {
    // Handle follow-up queries: update loading message with results
    if (isLocalLoading && !isExternalLoading && botResponse) {
      setConversation(prev => {
        // Find and replace the loading message
        const updated = prev.map(msg => {
          if (msg.isLoading && msg.id === lastBotMessageIdRef.current) {
            const newId = msg.id.replace('loading', 'response');
            lastBotMessageIdRef.current = newId;
            return {
              id: newId,
              text: botResponse,
              isUser: false,
              timestamp: Date.now(),
              restaurants: restaurants,
              isLoading: false,
              searchQuery: msg.searchQuery || searchQuery // Preserve the query from loading message
            };
          }
          return msg;
        });
        return updated;
      });
      setIsLocalLoading(false);
    }
    
    // Handle initial load: replace initial loading message when results arrive
    if (isExternalLoading === false && botResponse && restaurants.length > 0) {
      setConversation(prev => {
        // Find the initial loading message (if it exists) and replace it
        const hasInitialLoading = prev.some(msg => msg.id === 'bot-loading' && msg.isLoading);
        if (hasInitialLoading) {
          return prev.map(msg => {
            if (msg.id === 'bot-loading' && msg.isLoading) {
              lastBotMessageIdRef.current = 'bot-1';
              return {
                id: 'bot-1',
                text: botResponse,
                isUser: false,
                timestamp: Date.now(),
                restaurants: restaurants,
                isLoading: false,
                searchQuery: msg.searchQuery || searchQuery
              };
            }
            return msg;
          });
        }
        return prev;
      });
    }
  }, [botResponse, restaurants, isExternalLoading, isLocalLoading, searchQuery]);

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
                searchQuery={msg.searchQuery || searchQuery}
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
