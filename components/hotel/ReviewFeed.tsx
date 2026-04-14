'use client';

import { Review, TravelerPersona } from '@/types';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface ReviewFeedProps {
  reviews: Review[];
}

const PERSONA_LABELS: Record<TravelerPersona, string> = {
  business: '💼 Business',
  family: '👨‍👩‍👧 Family',
  solo: '🧳 Solo',
  couple: '💑 Couple',
  car: '🚗 Road trip',
  accessibility: '♿ Accessibility',
};

const PERSONA_COLORS: Record<TravelerPersona, string> = {
  business: 'bg-blue-100 text-blue-700',
  family: 'bg-green-100 text-green-700',
  solo: 'bg-purple-100 text-purple-700',
  couple: 'bg-pink-100 text-pink-700',
  car: 'bg-orange-100 text-orange-700',
  accessibility: 'bg-teal-100 text-teal-700',
};

function StarBar({ rating }: { rating: number }) {
  const stars = Math.round(rating);
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
    </span>
  );
}

export default function ReviewFeed({ reviews }: ReviewFeedProps) {
  const [filter, setFilter] = useState<TravelerPersona | 'all'>('all');

  const personas = ['all', ...Array.from(new Set(reviews.map(r => r.traveler_persona).filter(Boolean)))] as (TravelerPersona | 'all')[];

  const filtered = filter === 'all' ? reviews : reviews.filter(r => r.traveler_persona === filter);

  return (
    <div>
      {/* Filter chips */}
      {personas.length > 2 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {personas.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                filter === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'all' ? 'All travelers' : PERSONA_LABELS[p as TravelerPersona]}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {filtered.slice(0, 10).map(review => (
          <div key={review.id} className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                {review.review_title && (
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">{review.review_title}</h4>
                )}
                <p className="text-gray-700 text-sm leading-relaxed line-clamp-3">
                  {review.review_text}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {review.rating > 0 && <StarBar rating={review.rating} />}
                {review.acquisition_date && (
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(review.acquisition_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {review.reviewer_name && (
                <span className="text-xs text-gray-500">{review.reviewer_name}</span>
              )}
              {review.traveler_persona && (
                <Badge className={`text-xs px-2 py-0.5 ${PERSONA_COLORS[review.traveler_persona as TravelerPersona] || 'bg-gray-100 text-gray-600'}`}>
                  {PERSONA_LABELS[review.traveler_persona as TravelerPersona] || review.traveler_persona}
                </Badge>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">No reviews match this filter.</p>
        )}
      </div>
    </div>
  );
}
