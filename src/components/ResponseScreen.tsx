import React, { useState, useRef, useEffect } from 'react';
import { Restaurant, City, QueryContext } from '../types/restaurant';
import type { SendMessageOptions } from '../types/chat';
import { TypewriterText } from './TypewriterText';
import { AnimatedRestaurantCards } from './AnimatedRestaurantCards';
import { ThinkingDots } from './ThinkingDots';
import { QuickActions } from './QuickActions';

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
  hasMoreResults?: boolean;
  showQuickActions?: boolean;
  messageId?: string; // Unique ID for this message
  onShowMore?: () => void;
  onSortByPrice?: () => void;
  onSortByRating?: () => void;
  onQuickActionClick?: () => void;
}> = ({ 
  text, 
  restaurants,
  searchQuery,
  searchResultsTimestamp,
  originalPromptText,
  promptClickTimestamp,
  isLoading = false,
  hasMoreResults = false,
  showQuickActions = true,
  messageId = '',
  onShowMore,
  onSortByPrice,
  onSortByRating,
  onQuickActionClick,
}) => {
  const [showRestaurantCards, setShowRestaurantCards] = useState(false);
  const [showThinkingDots, setShowThinkingDots] = useState(false);
  const [showQuickActionsAfterAnimation, setShowQuickActionsAfterAnimation] = useState(false);
  const [hasShownQuickActions, setHasShownQuickActions] = useState(false); // Track if Quick Actions has been shown for this message

  // Reset states when text or loading state changes (but not when restaurants change to avoid double animation)
  useEffect(() => {
    setShowRestaurantCards(false);
    setShowThinkingDots(false);
    setShowQuickActionsAfterAnimation(false);
    setHasShownQuickActions(false); // Reset when message changes
  }, [text, isLoading]);

  const handleTypewriterComplete = () => {
    if (isLoading) {
      // For loading state, show thinking dots after typewriter completes
      setShowThinkingDots(true);
    } else {
      // For regular responses, show restaurant cards after typewriter completes
      setShowRestaurantCards(true);
    }
  };

  // Calculate when to show Quick Actions: after all cards finish animating
  // Last card appears at: (restaurants.length - 1) * delay
  // Animation duration: 400ms (from CSS transition)
  // Show Quick Actions after: last card delay + animation duration
  // Once shown, keep it visible even if restaurants change (for sorting)
  useEffect(() => {
    if (restaurants && restaurants.length > 0 && showRestaurantCards && !isLoading) {
      // If Quick Actions has already been shown, keep it visible (for sorting scenario)
      if (hasShownQuickActions) {
        setShowQuickActionsAfterAnimation(true);
        return;
      }
      
      const delay = 200; // Delay between each card (matches AnimatedRestaurantCards)
      const animationDuration = 400; // Animation duration in ms (from CSS transition)
      const lastCardIndex = restaurants.length - 1;
      const lastCardAppearTime = lastCardIndex * delay;
      const lastCardFinishTime = lastCardAppearTime + animationDuration;
      
      const timer = setTimeout(() => {
        setShowQuickActionsAfterAnimation(true);
        setHasShownQuickActions(true); // Mark as shown so it stays visible on sort
      }, lastCardFinishTime);
      
      return () => clearTimeout(timer);
    } else {
      // Only reset if we're truly hiding (not just sorting)
      if (!showRestaurantCards || isLoading) {
        setShowQuickActionsAfterAnimation(false);
      }
    }
  }, [restaurants, showRestaurantCards, isLoading, hasShownQuickActions]);

  return (
    <div className="response-content">
      <div className="response-text">
        <div className="flex items-center gap-2">
          <TypewriterText 
            text={text} 
            onComplete={handleTypewriterComplete}
          />
          {isLoading && showThinkingDots && <ThinkingDots />}
        </div>
      </div>
      
      {/* Show animated restaurant cards only after typewriter completes */}
      {restaurants && restaurants.length > 0 && showRestaurantCards && !isLoading && (
        <>
          <AnimatedRestaurantCards 
            restaurants={restaurants} 
            delay={200}
            searchQuery={searchQuery}
            searchResultsTimestamp={searchResultsTimestamp}
            originalPromptText={originalPromptText || undefined}
            promptClickTimestamp={promptClickTimestamp || undefined}
            messageId={messageId}
          />
          {/* Quick Actions - shown after all restaurant cards finish animating (timing-based) */}
          {showQuickActions && showQuickActionsAfterAnimation && (
            <QuickActions
              hasMoreResults={hasMoreResults}
              onShowMore={onShowMore || (() => {})}
              onSortByPrice={onSortByPrice || (() => {})}
              onSortByRating={onSortByRating || (() => {})}
              onActionClick={onQuickActionClick}
            />
          )}
        </>
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
  displayPrompt?: string;
  botResponse: string;
  restaurants: Restaurant[];
  onBackToSearch: () => void;
  onSendMessage?: (message: string, city?: City, options?: SendMessageOptions) => void;
  onNewResults?: (restaurants: Restaurant[], query: string) => void;
  searchQuery?: string; // Add search query for event logging
  originalPromptText?: string | null; // Original prompt text if search came from prompt
  promptClickTimestamp?: number | null; // When the prompt was clicked
  isLoading?: boolean; // Loading state for new searches
  hasMoreResults?: boolean; // Whether there are more results available
  queryContext?: QueryContext | null; // Query context for follow-up queries
  city?: City; // Current city for loading message
}

export const ResponseScreen: React.FC<ResponseScreenProps> = ({
  userPrompt,
  displayPrompt = userPrompt,
  botResponse,
  restaurants: initialRestaurants,
  onBackToSearch,
  onSendMessage,
  onNewResults,
  searchQuery = userPrompt, // Default to userPrompt if searchQuery not provided
  originalPromptText = null,
  promptClickTimestamp = null,
  isLoading: isExternalLoading = false,
  hasMoreResults: initialHasMoreResults = false,
  queryContext: initialQueryContext = null,
  city,
}) => {
  const [message, setMessage] = useState('');
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const MAX_CHARACTERS = 250;
  // Track sorted restaurants (start with initial restaurants)
  const [sortedRestaurants, setSortedRestaurants] = useState<Restaurant[]>(initialRestaurants);
  // Track if we're showing sorted view
  const [isSorted, setIsSorted] = useState(false);
  // Track the original city from the first query
  const [originalCity, setOriginalCity] = useState<City | null>(() => {
    const city = extractCityFromQuery(searchQuery || userPrompt);
    return city;
  });
  // Track hasMoreResults
  const [hasMoreResults, setHasMoreResults] = useState(initialHasMoreResults);
  // Track query context
  const [queryContext, setQueryContext] = useState<QueryContext | null>(initialQueryContext);
  // Track if quick actions should be shown
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [conversation, setConversation] = useState<Message[]>(() => {
    const initialUserMessage = displayPrompt || userPrompt;
    const messages: Message[] = [
      { id: 'user-1', text: initialUserMessage, isUser: true, timestamp: Date.now() }
    ];
    
    if (isExternalLoading) {
      // Show loading state like Google Gemini
      const loadingText = city 
        ? `Curating the best spots for you in ${city}`
        : 'Curating the best spots for you';
      messages.push({
        id: 'bot-loading',
        text: loadingText,
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
        restaurants: sortedRestaurants,
        searchQuery: searchQuery || userPrompt
      });
    }
    
    return messages;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track the last bot response ID to detect new results
  const lastBotMessageIdRef = useRef<string>('bot-1');

  const handleSubmit = () => {
    if (message.trim() && !isLocalLoading && message.length <= MAX_CHARACTERS) {
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

  const isReadyToSubmit = message.trim().length > 0 && !isLocalLoading && message.length <= MAX_CHARACTERS;
  const exceedsCharacterLimit = message.length > MAX_CHARACTERS;

  // Sync sortedRestaurants with initialRestaurants when they change (from new API responses)
  useEffect(() => {
    setSortedRestaurants(initialRestaurants);
    setIsSorted(false); // Reset sorted state when new results arrive
    setShowQuickActions(true); // Show quick actions for new results
  }, [initialRestaurants]);

  // Sync hasMoreResults and queryContext when props change
  useEffect(() => {
    setHasMoreResults(initialHasMoreResults);
  }, [initialHasMoreResults]);

  useEffect(() => {
    setQueryContext(initialQueryContext);
  }, [initialQueryContext]);

  // Helper function to convert price_display to numeric value for sorting
  const getPriceValue = (priceDisplay: string | undefined): number => {
    if (!priceDisplay || priceDisplay === 'N/A') return 999; // Put N/A at the end
    return priceDisplay.length; // $ = 1, $$ = 2, $$$ = 3, $$$$ = 4
  };

  // Sort by price (ascending)
  const handleSortByPrice = () => {
    const sorted = [...sortedRestaurants].sort((a, b) => {
      const priceA = getPriceValue(a.price_display);
      const priceB = getPriceValue(b.price_display);
      return priceA - priceB;
    });
    setSortedRestaurants(sorted);
    setIsSorted(true);
    
    // Update the restaurants in the conversation message
    setConversation(prev => prev.map(msg => {
      if (msg.id === lastBotMessageIdRef.current && !msg.isLoading) {
        return { ...msg, restaurants: sorted };
      }
      return msg;
    }));
  };

  // Sort by rating (descending)
  const handleSortByRating = () => {
    const sorted = [...sortedRestaurants].sort((a, b) => {
      const ratingA = a.google_data.rating || 0;
      const ratingB = b.google_data.rating || 0;
      return ratingB - ratingA; // Descending order
    });
    setSortedRestaurants(sorted);
    setIsSorted(true);
    
    // Update the restaurants in the conversation message
    setConversation(prev => prev.map(msg => {
      if (msg.id === lastBotMessageIdRef.current && !msg.isLoading) {
        return { ...msg, restaurants: sorted };
      }
      return msg;
    }));
  };

  // Handle "Show me more" - triggers API call with "show me more" query
  // This should behave exactly like typing "show me more" in the chatbox
  const handleShowMore = () => {
    if (onSendMessage && !isLocalLoading) {
      const originalMessage = 'show me more';
      
      // Add user message to conversation - display "show me more" in prompt-pill
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: originalMessage, // Display "show me more" in prompt-pill
        isUser: true,
        timestamp: Date.now()
      };
      
      setConversation(prev => [...prev, userMessage]);
      
      // Add loading bot message
      const loadingMessageId = `bot-loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const loadingMessage: Message = {
        id: loadingMessageId,
        text: 'Finding more restaurants for you...',
        isUser: false,
        timestamp: Date.now() + 1,
        isLoading: true,
        searchQuery: originalMessage // Use "show me more" for search query tracking
      };
      
      setConversation(prev => [...prev, loadingMessage]);
      setIsLocalLoading(true);
      lastBotMessageIdRef.current = loadingMessageId;
      
      // Send "show me more" query which the API will handle using context
      // The context is passed from ChatInterface, so it should be available
      onSendMessage(originalMessage, originalCity || undefined);
      const excludePlaceIds = queryContext?.previousResultIds?.length 
        ? queryContext.previousResultIds 
        : sortedRestaurants.map(restaurant => restaurant.google_place_id);

      onSendMessage(originalMessage, originalCity || undefined, {
        excludePlaceIds
      });
    }
  };

  // Hide quick actions when any action is clicked
  const handleQuickActionClick = () => {
    setShowQuickActions(false);
  };

  // Update conversation when new results arrive (for follow-up queries or initial load)
  useEffect(() => {
    // Handle follow-up queries: update loading message with results
    if (isLocalLoading && !isExternalLoading && botResponse) {
      const latestRestaurants = initialRestaurants;
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
              restaurants: latestRestaurants,
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
    // Only do this if we're not in a local loading state (to avoid interfering with follow-up queries)
    if (isExternalLoading === false && !isLocalLoading && botResponse) {
      const latestRestaurants = initialRestaurants;
      setConversation(prev => {
        // Find the initial loading message (if it exists) and replace it
        // Only replace if this is truly the initial load (conversation has only 2 messages: user + loading)
        const hasInitialLoading = prev.some(msg => msg.id === 'bot-loading' && msg.isLoading);
        const isInitialLoad = prev.length === 2 && hasInitialLoading;
        
        if (isInitialLoad) {
          return prev.map(msg => {
            if (msg.id === 'bot-loading' && msg.isLoading) {
              lastBotMessageIdRef.current = 'bot-1';
              return {
                id: 'bot-1',
                text: botResponse,
                isUser: false,
                timestamp: Date.now(),
                restaurants: latestRestaurants,
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
  }, [botResponse, initialRestaurants, sortedRestaurants, isExternalLoading, isLocalLoading, searchQuery]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Scroll to top when ResponseScreen mounts to ensure prompt-pill is visible
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
                hasMoreResults={msg.id === lastBotMessageIdRef.current ? hasMoreResults : false}
                showQuickActions={msg.id === lastBotMessageIdRef.current ? showQuickActions : false}
                messageId={msg.id}
                onShowMore={handleShowMore}
                onSortByPrice={handleSortByPrice}
                onSortByRating={handleSortByRating}
                onQuickActionClick={handleQuickActionClick}
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
                placeholder={originalCity ? `Ask for more recommendations in ${originalCity}` : "Ask for more recommendations"}
                className="text-input"
                disabled={isLocalLoading}
                rows={1}
              />
              {exceedsCharacterLimit && (
                <div className="error-message">
                  Try a shorter inquiry less than 250 characters
                </div>
              )}
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
