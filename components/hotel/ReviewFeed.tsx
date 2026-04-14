'use client';

import { useState } from 'react';
import { Review } from '@/types';
import { RATING_LABELS } from '@/lib/utils';

const PAGE_SIZE = 20;

function formatDate(raw: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StarRow({ rating }: { rating: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <span className="text-yellow-400 tracking-tight text-sm">
      {'★'.repeat(filled)}{'☆'.repeat(5 - filled)}
    </span>
  );
}

function ratingColor(v: number): string {
  if (v >= 4) return 'bg-green-100 text-green-800';
  if (v >= 3) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export default function ReviewFeed({ reviews }: { reviews: Review[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">💬</p>
        <p className="font-medium text-gray-600">No reviews yet</p>
        <p className="text-sm mt-1">This property hasn't received any reviews.</p>
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
        {visible.map((review, i) => {
          const overall = review.rating?.overall ?? 0;
          const subRatings = Object.entries(review.rating || {})
            .filter(([key, val]) => key !== 'overall' && typeof val === 'number' && (val as number) > 0) as [string, number][];

          return (
            <article
              key={`${review.eg_property_id}-${review.acquisition_date}-${i}`}
              className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  {review.review_title ? (
                    <h4 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug mb-1">
                      {review.review_title}
                    </h4>
                  ) : (
                    <p className="text-sm text-gray-400 italic mb-1">No title</p>
                  )}
                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    {review.acquisition_date && (
                      <span>{formatDate(review.acquisition_date)}</span>
                    )}
                    {review.lob && (
                      <span className="capitalize bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {review.lob.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Overall rating */}
                {overall > 0 && (
                  <div className="shrink-0 text-right">
                    <StarRow rating={overall} />
                    <p className="text-xs text-gray-500 mt-0.5">{overall} / 5</p>
                  </div>
                )}
              </div>

              {/* Review text */}
              {review.review_text && (
                <p className="text-gray-700 text-sm leading-relaxed line-clamp-4 mb-3">
                  {review.review_text}
                </p>
              )}

              {/* Sub-ratings */}
              {subRatings.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
                  {subRatings.map(([key, val]) => (
                    <span
                      key={key}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${ratingColor(val)}`}
                    >
                      {RATING_LABELS[key] || key}: {val}/5
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
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
