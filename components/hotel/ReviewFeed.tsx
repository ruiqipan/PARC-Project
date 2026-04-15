'use client';

import { useState } from 'react';
import type { Review } from '@/types';
import ReviewCard from './ReviewCard';

const PAGE_SIZE = 20;

interface ReviewFeedProps {
  reviews: Review[];
  /**
   * Tags from the currently logged-in user's UserPersona record.
   * Forwarded to every ReviewCard to power the "Shares your focus" badge.
   * Omit (or pass []) to hide similarity badges entirely.
   */
  userTags?: string[];
}

export default function ReviewFeed({ reviews, userTags = [] }: ReviewFeedProps) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">💬</p>
        <p className="font-medium text-gray-600">No reviews yet</p>
        <p className="text-sm mt-1">This property hasn&apos;t received any reviews.</p>
      </div>
    );
  }

  const visible = reviews.slice(0, shown);

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          Showing <span className="font-medium text-gray-900">{visible.length}</span> of{' '}
          <span className="font-medium text-gray-900">{reviews.length.toLocaleString()}</span> reviews
        </p>
      </div>

      <div className="space-y-3">
        {visible.map((review, i) => (
          <ReviewCard
            key={`${review.eg_property_id}-${review.acquisition_date}-${i}`}
            review={review}
            userTags={userTags}
          />
        ))}
      </div>

      {shown < reviews.length && (
        <button
          onClick={() => setShown(s => s + PAGE_SIZE)}
          className="mt-6 w-full py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          Show more reviews ({(reviews.length - shown).toLocaleString()} remaining)
        </button>
      )}
    </div>
  );
}
