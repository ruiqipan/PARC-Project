'use client';

import { useEffect, useState } from 'react';
import type { Review, ReviewEnrichment } from '@/types';
import ReviewCard from './ReviewCard';
import { deriveReviewerTags } from '@/lib/persona-match';
import { REVIEW_ENRICHMENT_BATCH_SIZE } from '@/lib/review-enrichment-constants';

const PAGE_SIZE = REVIEW_ENRICHMENT_BATCH_SIZE;

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
  const [enrichmentMap, setEnrichmentMap] = useState<Record<string, ReviewEnrichment>>({});
  const visible = reviews.slice(0, shown);
  const pendingVisibleCount = visible.filter(review => {
    if (!review.review_key || !review.source_type) {
      return false;
    }

    const hasStoredTitle = Boolean(review.review_title?.trim());
    const hasStoredTags = Boolean(review.reviewer_tags?.length);
    if (hasStoredTitle && hasStoredTags) {
      return false;
    }

    return !enrichmentMap[review.review_key];
  }).length;

  useEffect(() => {
    const pendingReviews = visible
      .filter(review => {
        if (!review.review_key || !review.source_type) {
          return false;
        }

        if (enrichmentMap[review.review_key]) {
          return false;
        }

        const hasStoredTitle = Boolean(review.review_title?.trim());
        const hasStoredTags = Boolean(review.reviewer_tags?.length);
        return !hasStoredTitle || !hasStoredTags;
      })
      .slice(0, REVIEW_ENRICHMENT_BATCH_SIZE);

    if (pendingReviews.length === 0) {
      return;
    }

    let cancelled = false;

    const fallbackEntries = Object.fromEntries(
      pendingReviews
        .filter((review): review is Review & { review_key: string } => Boolean(review.review_key))
        .map(review => [
          review.review_key,
          {
            reviewKey: review.review_key,
            generatedTitle: null,
            generatedTags: [],
            titleWasAiGenerated: false,
            tagsWereAiGenerated: false,
            sourceTextHash: '',
          } satisfies ReviewEnrichment,
        ])
    );

    void fetch('/api/reviews/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviews: pendingReviews.map(review => ({
          reviewKey: review.review_key,
          sourceType: review.source_type,
          egPropertyId: review.eg_property_id,
          reviewTitle: review.review_title,
          reviewText: review.review_text,
          reviewerTags: review.reviewer_tags ?? [],
        })),
      }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? `Request failed (${res.status})`);
        }

        if (cancelled) {
          return;
        }

        const nextEntries = Object.fromEntries(
          ((data?.items ?? []) as ReviewEnrichment[]).map(item => [item.reviewKey, item])
        );
        setEnrichmentMap(prev => ({ ...prev, ...fallbackEntries, ...nextEntries }));
      })
      .catch(error => {
        console.error('[ReviewFeed] review enrichment failed:', error);
        if (!cancelled) {
          setEnrichmentMap(prev => ({ ...prev, ...fallbackEntries }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enrichmentMap, visible]);

  const enrichedVisible = visible.map(review => {
    const enrichment = review.review_key ? enrichmentMap[review.review_key] : undefined;
    const derivedTags = review.reviewer_tags?.length ? review.reviewer_tags : deriveReviewerTags(review);

    return {
      ...review,
      generated_title: enrichment?.generatedTitle ?? null,
      generated_tags: enrichment?.generatedTags ?? [],
      title_was_ai_generated: enrichment?.titleWasAiGenerated ?? false,
      tags_was_ai_generated: enrichment?.tagsWereAiGenerated ?? false,
      source_text_hash: enrichment?.sourceTextHash,
      reviewer_tags:
        review.reviewer_tags?.length
          ? review.reviewer_tags
          : enrichment?.generatedTags?.length
            ? enrichment.generatedTags
            : derivedTags,
    } satisfies Review;
  });

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">💬</p>
        <p className="font-medium text-gray-600">No reviews yet</p>
        <p className="text-sm mt-1">This property hasn&apos;t received any reviews.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          Showing <span className="font-medium text-gray-900">{visible.length}</span> of{' '}
          <span className="font-medium text-gray-900">{reviews.length.toLocaleString()}</span> reviews
        </p>
        {pendingVisibleCount > 0 && (
          <p className="text-xs text-gray-400">
            Enhancing {Math.min(pendingVisibleCount, REVIEW_ENRICHMENT_BATCH_SIZE)} review
            {Math.min(pendingVisibleCount, REVIEW_ENRICHMENT_BATCH_SIZE) === 1 ? '' : 's'}...
          </p>
        )}
      </div>

      <div className="space-y-3">
        {enrichedVisible.map((review, i) => (
          <ReviewCard
            key={`${review.review_key ?? review.eg_property_id}-${i}`}
            review={review}
            userTags={userTags}
            reviewerTags={review.reviewer_tags}
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
