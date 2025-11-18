import React, { useState, useEffect } from 'react';

interface QuickActionsProps {
  hasMoreResults: boolean;
  onShowMore: () => void;
  onSortByPrice: () => void;
  onSortByRating: () => void;
  onActionClick?: () => void; // Callback to hide quick actions when any action is clicked
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  hasMoreResults,
  onShowMore,
  onSortByPrice,
  onSortByRating,
  onActionClick,
}) => {
  const [visibleActions, setVisibleActions] = useState<number[]>([]);

  // Staggered animation for actions
  useEffect(() => {
    const actions: number[] = [];
    if (hasMoreResults) actions.push(0); // "Show me more"
    actions.push(1); // "Sort by price"
    actions.push(2); // "Sort by star"

    const revealNext = (index: number) => {
      if (index < actions.length) {
        setVisibleActions(prev => [...prev, actions[index]]);
        setTimeout(() => revealNext(index + 1), 50); // 50ms delay between each action
      }
    };

    setVisibleActions([]);
    revealNext(0);
  }, [hasMoreResults]);

  const handleActionClick = (originalOnClick: () => void) => {
    originalOnClick();
    if (onActionClick) {
      onActionClick();
    }
  };

  const actions = [];
  if (hasMoreResults) {
    actions.push({ id: 0, text: 'Show me more', onClick: onShowMore });
  }
  actions.push({ id: 1, text: 'Sort by price (ascending)', onClick: onSortByPrice });
  actions.push({ id: 2, text: 'Sort by star (descending)', onClick: onSortByRating });

  return (
    <div className="quick-actions-container">
      <div className="quick-actions-title">Quick Actions</div>
      <div className="quick-actions-list">
        {actions.map((action, index) => (
          <div
            key={action.id}
            className={`quick-action-item ${
              visibleActions.includes(action.id) ? 'action-visible' : 'action-hidden'
            }`}
            onClick={() => handleActionClick(action.onClick)}
          >
            <div className="action-text">
              <span>{action.text}</span>
              <svg
                className="action-arrow"
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
  );
};

