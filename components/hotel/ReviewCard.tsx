'use client';

/**
 * ReviewCard
 *
 * Renders a single review from Reviews_PROC (or Review_Submissions).
 *
 * Feature 2 — Review Similarity Indicator:
 *   When the viewing user's persona tags are passed via `userTags`, the card
 *   computes a semantic cluster match (via matchPersonaTags) and displays a
 *   "Shares your focus: X / Y" or "Similar preference: X" badge beneath the
 *   review meta-line.
 *
 *   The badge does NOT require exact string matches.  "Quiet" on the user side
 *   and "Room Comfort" on the reviewer side both resolve to the "Rest & Quiet"
 *   cluster and register as a match.
 */

import { useMemo } from 'react';
import type { Review, PersonaMatch } from '@/types';
import {
  matchPersonaTags,
  deriveReviewerTags,
  badgeCopyPrefix,
} from '@/lib/persona-match';
import { RATING_LABELS } from '@/lib/utils';
import { Users } from 'lucide-react';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRow({ rating }: { rating: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <span className="text-yellow-400 tracking-tight text-sm" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(filled)}{'☆'.repeat(5 - filled)}
    </span>
  );
}

function ratingColor(v: number): string {
  if (v >= 4) return 'bg-green-100 text-green-800';
  if (v >= 3) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function formatDate(raw: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Similarity Badge ─────────────────────────────────────────────────────────

/**
 * Renders "Shares your focus: Quiet / Sleep Quality" or
 *         "Similar preference: Accessibility"
 *
 * Shows up to 2 matches side-by-side (separated by · ).
 */
function SimilarityBadge({ matches }: { matches: PersonaMatch[] }) {
  if (matches.length === 0) return null;

  // Group matches by their copy prefix so we can render them cleanly
  const items = matches.map(m => {
    const prefix = badgeCopyPrefix(m.clusterId);
    // If both tags are identical (exact match), show just one; otherwise show "userTag / reviewerTag"
    const tagDisplay =
      m.userTag.toLowerCase() === m.reviewerTag.toLowerCase()
        ? m.userTag
        : `${m.userTag} / ${m.reviewerTag}`;
    return { prefix, tagDisplay };
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200"
        >
          <Users className="size-3 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">{item.prefix}:</span>{' '}
            {item.tagDisplay}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface ReviewCardProps {
  review: Review;
  /**
   * Tags from the currently logged-in user's UserPersona record.
   * Pass an empty array (or omit) to hide the similarity badge entirely.
   */
  userTags?: string[];
  /**
   * Explicit reviewer tags.  Provide this when the review comes from
   * Review_Submissions and the author's stored persona is available.
   * When omitted, tags are derived automatically from the review's lob
   * and sub-rating scores via deriveReviewerTags().
   */
  reviewerTags?: string[];
}

export default function ReviewCard({
  review,
  userTags = [],
  reviewerTags,
}: ReviewCardProps) {
  const overall = review.rating?.overall ?? 0;
  const subRatings = Object.entries(review.rating ?? {}).filter(
    ([key, val]) => key !== 'overall' && typeof val === 'number' && (val as number) > 0,
  ) as [string, number][];

  // Derive reviewer tags once per render (cheap — pure computation)
  const resolvedReviewerTags = useMemo(
    () => reviewerTags ?? deriveReviewerTags(review),
    [review, reviewerTags],
  );

  // Semantic cluster matching — also pure, no API calls
  const matches = useMemo(
    () =>
      userTags.length > 0
        ? matchPersonaTags(userTags, resolvedReviewerTags)
        : [],
    [userTags, resolvedReviewerTags],
  );

  // Top 3 most relevant reviewer tags: matched tags first, then fill with unmatched
  const topReviewerTags = useMemo(() => {
    if (resolvedReviewerTags.length === 0) return [];
    const matchedTags = matches.map(m => m.reviewerTag);
    const unmatched = resolvedReviewerTags.filter(t => !matchedTags.includes(t));
    return [...matchedTags, ...unmatched].slice(0, 3);
  }, [resolvedReviewerTags, matches]);

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {review.review_title ? (
            <h4 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug mb-1">
              {review.review_title}
            </h4>
          ) : review.reviewer_name ? (
            <h4 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug mb-1">
              {review.reviewer_name}
            </h4>
          ) : null}

          {/* Meta: date + lob badge */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
            {review.acquisition_date && (
              <span>{formatDate(review.acquisition_date)}</span>
            )}
            {review.lob && review.lob !== 'user_submitted' && (
              <span className="capitalize bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {review.lob.toLowerCase()}
              </span>
            )}
            {review.lob === 'user_submitted' && (
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                ✍ Guest Review
              </span>
            )}
          </div>

          {/* Reviewer persona tags — top 3 most relevant to viewing user */}
          {topReviewerTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {topReviewerTags.map(tag => (
                <span
                  key={tag}
                  className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Feature 2: Similarity badge — sits right below the meta line */}
          <SimilarityBadge matches={matches} />
        </div>

        {/* Overall rating */}
        {overall > 0 && (
          <div className="shrink-0 text-right">
            <StarRow rating={overall} />
            <p className="text-xs text-gray-500 mt-0.5">{overall} / 5</p>
          </div>
        )}
      </div>

      {/* ── Review body ────────────────────────────────────────────────────── */}
      {review.review_text && (
        <p className="text-gray-700 text-sm leading-relaxed line-clamp-4 mb-3">
          {review.review_text}
        </p>
      )}

      {/* ── Sub-ratings ────────────────────────────────────────────────────── */}
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
}
