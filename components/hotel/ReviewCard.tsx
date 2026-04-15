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

import { useMemo, useState } from 'react';
import type { Review, PersonaMatch } from '@/types';
import {
  matchPersonaTags,
  deriveReviewerTags,
  badgeCopyPrefix,
} from '@/lib/persona-match';
import { RATING_LABELS } from '@/lib/utils';
import { CircleAlert, Sparkles, Users } from 'lucide-react';

interface TranslationOption {
  value: string;
  label: string;
}

const TRANSLATION_OPTIONS: TranslationOption[] = [
  { value: 'English', label: 'English' },
  { value: 'Chinese (Simplified)', label: 'Chinese (Simplified)' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'French', label: 'French' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'German', label: 'German' },
  { value: 'Portuguese', label: 'Portuguese' },
];

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

function AiHint({
  label,
  message,
}: {
  label: string;
  message: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(value => !value)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="group inline-flex items-center text-gray-400 transition hover:text-gray-600"
      >
        <CircleAlert className="size-3.5" aria-hidden />
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-52 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[11px] font-normal leading-4 text-gray-600 shadow-lg group-hover:block group-focus-visible:block sm:block sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
          {message}
        </span>
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[11px] leading-4 text-gray-600 shadow-lg sm:hidden">
          {message}
        </span>
      )}
    </span>
  );
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
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [showTranslateBox, setShowTranslateBox] = useState(false);
  const [translationState, setTranslationState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [translatedText, setTranslatedText] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const overall = review.rating?.overall ?? 0;
  const subRatings = Object.entries(review.rating ?? {}).filter(
    ([key, val]) => key !== 'overall' && typeof val === 'number' && (val as number) > 0,
  ) as [string, number][];

  // Derive reviewer tags once per render (cheap — pure computation)
  const resolvedReviewerTags = useMemo(
    () => reviewerTags ?? review.generated_tags ?? deriveReviewerTags(review),
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
  const displayTitle = review.review_title?.trim() || review.generated_title?.trim() || review.reviewer_name?.trim() || null;
  const showsAiTitle = !review.review_title?.trim() && Boolean(review.generated_title?.trim()) && review.title_was_ai_generated;
  const showsAiTags = Boolean(review.tags_was_ai_generated && resolvedReviewerTags.length > 0);
  const displayedReviewText = translatedText || review.review_text;

  async function handleTranslate() {
    if (!review.review_text || translationState === 'loading') {
      return;
    }

    setTranslationState('loading');
    setTranslationError('');

    try {
      const res = await fetch('/api/reviews/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewText: review.review_text,
          targetLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      setDetectedLanguage(data.detectedLanguage ?? '');
      setTranslatedText(data.translatedText ?? '');
      setTranslationState('done');
      setShowTranslateBox(false);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'Translation failed. Please try again.');
      setTranslationState('error');
    }
  }

  return (
    <article className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {displayTitle && (
            <div className="mb-1 flex items-start gap-2">
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug">
                {displayTitle}
              </h4>
              {showsAiTitle && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <Sparkles className="size-3" aria-hidden />
                  <AiHint
                    label="AI summarized title"
                    message="This title was summarized by AI from the review text."
                  />
                </span>
              )}
            </div>
          )}

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
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {topReviewerTags.map(tag => (
                <span
                  key={tag}
                  className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100"
                >
                  {tag}
                </span>
              ))}
              {showsAiTags && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <Sparkles className="size-3" aria-hidden />
                  <AiHint
                    label="AI summarized tags"
                    message="These tags were summarized by AI from the review text."
                  />
                </span>
              )}
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
      {displayedReviewText && (
        <p className="text-gray-700 text-sm leading-relaxed line-clamp-4 mb-3">
          {displayedReviewText}
        </p>
      )}

      {review.review_text && (
        <div className="relative mb-3 flex justify-end">
          <div className="flex items-center gap-3">
            {translatedText && (
              <button
                type="button"
                onClick={() => {
                  setTranslatedText('');
                  setDetectedLanguage('');
                  setTranslationState('idle');
                  setTranslationError('');
                }}
                className="text-xs font-medium text-[#0071c2] transition hover:text-[#005999]"
              >
                Show original
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowTranslateBox(value => !value);
                setTranslationError('');
              }}
              className="text-xs font-medium text-[#0071c2] transition hover:text-[#005999]"
            >
              Translate
            </button>
          </div>

          {showTranslateBox && (
            <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Translate to
              </p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={targetLanguage}
                  onChange={e => {
                    setTargetLanguage(e.target.value);
                    setTranslationState('idle');
                    setTranslationError('');
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0071c2]/20"
                >
                  {TRANSLATION_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={translationState === 'loading'}
                  className="rounded-lg bg-[#0071c2] px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-[#005999] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {translationState === 'loading' ? '...' : 'Go'}
                </button>
              </div>
              {translationError && (
                <p className="mt-2 text-[11px] leading-4 text-red-600">{translationError}</p>
              )}
              {translatedText && detectedLanguage && (
                <p className="mt-2 text-[11px] leading-4 text-gray-400">
                  Detected: {detectedLanguage}
                </p>
              )}
            </div>
          )}
        </div>
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
