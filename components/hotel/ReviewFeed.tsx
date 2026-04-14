'use client';

import { useState } from 'react';
import { Review } from '@/types';
import { RATING_LABELS } from '@/lib/utils';

const PAGE_SIZE = 20;

function StarBar({ rating, max = 5 }: { rating: number; max?: number }) {
  const filled = Math.round(rating);
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(filled)}{'☆'.repeat(max - filled)}
    </span>
  );
}

function RatingBadge({ value, label }: { value: number; label: string }) {
  const color =
    value >= 4 ? 'bg-green-100 text-green-700' :
    value >= 3 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-700';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {label}: {value}/5
    </span>
  );
}

export default function ReviewFeed({ reviews }: { reviews: Review[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (reviews.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-10">No reviews for this property.</p>;
  }

  const visible = reviews.slice(0, shown);

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Showing {visible.length} of {reviews.length} reviews
      </p>

      <div className="space-y-4">
        {visible.map((review, i) => {
          const overall = review.rating?.overall ?? 0;
          const subRatings = Object.entries(review.rating || {})
            .filter(([key, val]) => key !== 'overall' && typeof val === 'number' && val > 0) as [string, number][];

          return (
            <div key={`${review.eg_property_id}-${review.acquisition_date}-${i}`}
              className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {review.review_title && (
                    <h4 className="font-semibold text-gray-900 text-sm mb-1 truncate">
                      {review.review_title}
                    </h4>
                  )}
                  {review.review_text && (
                    <p className="text-gray-700 text-sm leading-relaxed line-clamp-4">
                      {review.review_text}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {overall > 0 && <StarBar rating={overall} />}
                  {overall > 0 && (
                    <p className="text-xs font-semibold text-gray-700 mt-0.5">{overall}/5</p>
                  )}
                </div>
              </div>

              {/* Sub-ratings (non-zero) */}
              {subRatings.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {subRatings.map(([key, val]) => (
                    <RatingBadge
                      key={key}
                      label={RATING_LABELS[key] || key}
                      value={val}
                    />
                  ))}
                </div>
              )}

              {/* Meta */}
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                {review.acquisition_date && <span>{review.acquisition_date}</span>}
                {review.lob && <span className="capitalize">{review.lob.toLowerCase()}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {shown < reviews.length && (
        <button
          onClick={() => setShown(s => s + PAGE_SIZE)}
          className="mt-6 w-full py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Show more ({reviews.length - shown} remaining)
        </button>
      )}
    </div>
  );
}
