/**
 * FeedbackPanel - Detailed feedback collection panel
 *
 * Provides a more detailed feedback interface with categories and comments.
 */

import React, { useState, useCallback } from 'react';

export interface FeedbackPanelProps {
  /** Unique identifier for the message being rated */
  messageId: string;
  /** The text content being evaluated */
  content?: string;
  /** Callback when feedback is submitted */
  onSubmit?: (feedback: DetailedFeedback) => void;
  /** Callback to close the panel */
  onClose?: () => void;
  /** Show content preview */
  showPreview?: boolean;
  /** Custom class names */
  className?: string;
}

export interface DetailedFeedback {
  messageId: string;
  rating: 'positive' | 'negative';
  categories: FeedbackCategory[];
  comment?: string;
  timestamp: string;
}

type FeedbackCategory =
  | 'accurate'
  | 'helpful'
  | 'clear'
  | 'creative'
  | 'inaccurate'
  | 'unhelpful'
  | 'confusing'
  | 'inappropriate';

const POSITIVE_CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'accurate', label: 'Accurate' },
  { id: 'helpful', label: 'Helpful' },
  { id: 'clear', label: 'Clear' },
  { id: 'creative', label: 'Creative' },
];

const NEGATIVE_CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'inaccurate', label: 'Inaccurate' },
  { id: 'unhelpful', label: 'Not helpful' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'inappropriate', label: 'Inappropriate' },
];

/**
 * Detailed feedback collection panel
 */
export function FeedbackPanel({
  messageId,
  content,
  onSubmit,
  onClose,
  showPreview = true,
  className = '',
}: FeedbackPanelProps): React.ReactNode {
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<
    Set<FeedbackCategory>
  >(new Set());
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const categories =
    rating === 'positive' ? POSITIVE_CATEGORIES : NEGATIVE_CATEGORIES;

  const toggleCategory = useCallback((category: FeedbackCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!rating || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const feedback: DetailedFeedback = {
        messageId,
        rating,
        categories: Array.from(selectedCategories),
        comment: comment.trim() || undefined,
        timestamp: new Date().toISOString(),
      };

      if (onSubmit) {
        await onSubmit(feedback);
      }

      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [messageId, rating, selectedCategories, comment, onSubmit, isSubmitting]);

  if (submitted) {
    return (
      <div
        className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-lg ${className}`}
      >
        <div className="text-center">
          <div className="text-green-500 text-2xl mb-2">✓</div>
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Thank you for your feedback!
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Your input helps improve the model.
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Rate this response
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content Preview */}
      {showPreview && content && (
        <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
            {content}
          </p>
        </div>
      )}

      {/* Rating Selection */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => {
            setRating('positive');
            setSelectedCategories(new Set());
          }}
          className={`
            flex-1 py-2 px-4 rounded-lg border-2 transition-all
            ${
              rating === 'positive'
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700'
            }
          `}
        >
          <span className="text-lg" aria-hidden="true">
            +
          </span>
          <span className="ml-2 text-sm font-medium">Helpful</span>
        </button>
        <button
          onClick={() => {
            setRating('negative');
            setSelectedCategories(new Set());
          }}
          className={`
            flex-1 py-2 px-4 rounded-lg border-2 transition-all
            ${
              rating === 'negative'
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                : 'border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700'
            }
          `}
        >
          <span className="text-lg" aria-hidden="true">
            -
          </span>
          <span className="ml-2 text-sm font-medium">Not Helpful</span>
        </button>
      </div>

      {/* Category Selection */}
      {rating && (
        <>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              What made it {rating === 'positive' ? 'helpful' : 'unhelpful'}?
              (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => toggleCategory(id)}
                  className={`
                    px-3 py-1 text-sm rounded-full border transition-all
                    ${
                      selectedCategories.has(id)
                        ? rating === 'positive'
                          ? 'border-green-500 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'border-red-500 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                    }
                  `}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Additional comments (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us more..."
              aria-label="Additional feedback comments"
              className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`
              w-full py-2 px-4 rounded-lg font-medium transition-all
              ${
                isSubmitting
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }
            `}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </>
      )}
    </div>
  );
}
