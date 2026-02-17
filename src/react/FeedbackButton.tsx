/**
 * FeedbackButton - Simple thumbs up/down feedback buttons
 *
 * Collects user feedback for RLHF training of local models.
 */

import React, { useState, useCallback } from 'react';

export interface FeedbackButtonProps {
  /** Unique identifier for the message being rated */
  messageId: string;
  /** Callback when feedback is submitted */
  onFeedback?: (messageId: string, rating: 'positive' | 'negative') => void;
  /** Current feedback state (if controlled) */
  currentFeedback?: 'positive' | 'negative' | null;
  /** Size of the buttons */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state */
  disabled?: boolean;
  /** Custom class names */
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-sm',
  md: 'w-8 h-8 text-base',
  lg: 'w-10 h-10 text-lg',
};

/**
 * Simple feedback buttons for collecting user preferences
 */
export function FeedbackButton({
  messageId,
  onFeedback,
  currentFeedback,
  size = 'md',
  disabled = false,
  className = '',
}: FeedbackButtonProps): React.ReactElement {
  const [localFeedback, setLocalFeedback] = useState<
    'positive' | 'negative' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const feedback = currentFeedback ?? localFeedback;

  const handleFeedback = useCallback(
    async (rating: 'positive' | 'negative') => {
      if (disabled || isSubmitting) return;

      setIsSubmitting(true);
      try {
        // Toggle off if clicking same button
        const newRating = feedback === rating ? null : rating;

        if (currentFeedback === undefined) {
          setLocalFeedback(newRating);
        }

        if (newRating && onFeedback) {
          onFeedback(messageId, newRating);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [messageId, onFeedback, feedback, currentFeedback, disabled, isSubmitting]
  );

  const buttonBase = `
    inline-flex items-center justify-center rounded-full
    transition-all duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const sizeClass = sizeClasses[size];

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {/* Thumbs Up */}
      <button
        type="button"
        onClick={() => handleFeedback('positive')}
        disabled={disabled || isSubmitting}
        aria-label="Good response"
        aria-pressed={feedback === 'positive'}
        className={`
          ${buttonBase}
          ${sizeClass}
          ${
            feedback === 'positive'
              ? 'bg-green-500/20 text-green-500 ring-2 ring-green-500/50'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-600'
          }
        `}
      >
        <ThumbsUpIcon className="w-4 h-4" />
      </button>

      {/* Thumbs Down */}
      <button
        type="button"
        onClick={() => handleFeedback('negative')}
        disabled={disabled || isSubmitting}
        aria-label="Unhelpful response"
        aria-pressed={feedback === 'negative'}
        className={`
          ${buttonBase}
          ${sizeClass}
          ${
            feedback === 'negative'
              ? 'bg-red-500/20 text-red-500 ring-2 ring-red-500/50'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600'
          }
        `}
      >
        <ThumbsDownIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// Simple SVG icons (no external dependencies)
function ThumbsUpIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbsDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}
