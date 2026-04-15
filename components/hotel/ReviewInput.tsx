'use client';

import { useRef, useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import FollowUpCard from '@/components/hotel/FollowUpCard';
import type { FollowUpAnswer, FollowUpEngineResponse, FollowUpQuestion } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuickTag {
  emoji: string;
  label: string;
  snippet: string;
}

interface QAItem {
  id: number;
  question: string;
  /** Seed text appended to the textarea when this Q&A card is clicked. */
  seed: string;
}

// ── Static data ───────────────────────────────────────────────────────────────

const QUICK_TAGS: QuickTag[] = [
  { emoji: '📍', label: 'Location', snippet: '📍 Location: ' },
  { emoji: '🏨', label: 'Facilities', snippet: '🏨 Facilities: ' },
  { emoji: '🧼', label: 'Cleanliness', snippet: '🧼 Cleanliness: ' },
  { emoji: '🤝', label: 'Service', snippet: '🤝 Service: ' },
  { emoji: '🛜', label: 'WiFi', snippet: '🛜 WiFi: ' },
  { emoji: '🍳', label: 'Breakfast', snippet: '🍳 Breakfast: ' },
  { emoji: '💸', label: 'Value', snippet: '💸 Value for money: ' },
  { emoji: '🔇', label: 'Noise', snippet: '🔇 Noise level: ' },
];

const QA_ITEMS: QAItem[] = [
  { id: 1, question: 'How was the WiFi speed during your stay?',          seed: 'The WiFi speed was ' },
  { id: 2, question: 'Would you recommend this hotel for business travel?', seed: 'For business travelers, ' },
  { id: 3, question: 'Was the check-in process smooth and fast?',          seed: 'The check-in process was ' },
  { id: 4, question: 'How was the breakfast quality and variety?',         seed: 'The breakfast quality was ' },
  { id: 5, question: 'Did the amenities match the hotel description?',     seed: 'The amenities ' },
  { id: 6, question: 'How was the noise level in your room?',              seed: 'The noise level in the room was ' },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface ReviewInputProps {
  propertyId: string;
  /** Optional — omit when auth is not yet wired up. */
  userId?: string;
  username?: string;
  /** Called after a successful save, so parent can refresh the feed. */
  onSubmitSuccess?: () => void;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type PolishState = 'idle' | 'loading' | 'done' | 'error';
type FollowUpState = 'idle' | 'loading' | 'ready' | 'error';

export default function ReviewInput({ propertyId, userId, username, onSubmitSuccess }: ReviewInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceBaseTextRef = useRef('');
  const isVoiceSessionRef = useRef(false);

  const [text, setText] = useState('');
  const [originalText, setOriginalText] = useState(''); // pre-polish snapshot
  const [isPolished, setIsPolished] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [polishState, setPolishState] = useState<PolishState>('idle');
  const [polishError, setPolishError] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [followUpState, setFollowUpState] = useState<FollowUpState>('idle');
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpReviewId, setFollowUpReviewId] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState('');

  // Q&A carousel
  const [qaItems] = useState<QAItem[]>(QA_ITEMS);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const visibleCount = 2; // cards visible at once

  // Voice input
  const { isListening, transcript, startListening, stopListening, isUnsupported } = useVoiceInput({
    lang: 'en-US',
  });

  // Keep voice dictation as a stable draft region instead of appending transcript deltas.
  useEffect(() => {
    if (!isVoiceSessionRef.current) return;

    const base = voiceBaseTextRef.current.trimEnd();
    const combined = transcript
      ? (base ? `${base}${base.endsWith('\n') ? '' : ' '}${transcript}` : transcript)
      : base;

    setText(prev => (prev === combined ? prev : combined));

    if (transcript) {
      setIsPolished(false);
    }

    if (!isListening) {
      isVoiceSessionRef.current = false;
      voiceBaseTextRef.current = combined;
    }
  }, [isListening, transcript]);

  function handleVoiceToggle() {
    if (isListening) {
      stopListening();
    } else {
      voiceBaseTextRef.current = text.trimEnd();
      isVoiceSessionRef.current = true;
      startListening();
      focusTextarea();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function focusTextarea() {
    textareaRef.current?.focus();
    // Scroll textarea into view on mobile
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function appendToText(snippet: string) {
    setText(prev => {
      const base = prev.trimEnd();
      return base ? `${base} ${snippet}` : snippet;
    });
    setIsPolished(false); // text changed; polish is stale
    focusTextarea();
  }

  function appendLineToText(snippet: string) {
    setText(prev => {
      const base = prev.trimEnd();
      return base ? `${base}\n${snippet}` : snippet;
    });
    setIsPolished(false);
    focusTextarea();
  }

  // ── Q&A click ────────────────────────────────────────────────────────────

  function handleQAClick(item: QAItem) {
    appendToText(item.seed);
  }

  // ── Quick Tag click ──────────────────────────────────────────────────────

  function handleTagClick(tag: QuickTag) {
    appendLineToText(tag.snippet);
  }

  // ── AI Polish ────────────────────────────────────────────────────────────

  async function handlePolish() {
    if (!text.trim() || polishState === 'loading') return;

    setPolishState('loading');
    setPolishError('');

    try {
      const res = await fetch('/api/ai-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      setOriginalText(text);
      setText(data.polishedText);
      setIsPolished(true);
      setPolishState('done');
    } catch (err) {
      setPolishError(err instanceof Error ? err.message : 'AI Polish failed. Please try again.');
      setPolishState('error');
    }
  }

  function handleUndoPolish() {
    setText(originalText);
    setIsPolished(false);
    setPolishState('idle');
    focusTextarea();
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!text.trim() || submitState === 'submitting') return;

    setSubmitState('submitting');
    setSubmitError('');
    setFollowUpState('idle');
    setFollowUpQuestions([]);
    setFollowUpReviewId(null);
    setFollowUpError('');

    let reviewSaved = false;

    try {
      const supabase = getSupabaseClient();

      const payload: Record<string, unknown> = {
        eg_property_id: propertyId,
        raw_text: isPolished ? originalText : text,
        ai_polished_text: isPolished ? text : null,
        sentiment_score: null,
      };

      if (userId) payload.user_id = userId;
      if (username) payload.username = username;
      if (rating > 0) payload.rating = rating;

      const { data, error } = await supabase
        .from('Review_Submissions')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      reviewSaved = true;
      setSubmitState('success');
      setText('');
      setOriginalText('');
      setIsPolished(false);
      setPolishState('idle');
      setRating(0);

      const reviewId = typeof data?.id === 'string' ? data.id : null;

      if (!reviewId || !userId) {
        onSubmitSuccess?.();
        return;
      }

      setFollowUpState('loading');

      try {
        const response = await fetch('/api/reviews/follow-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            review_id: reviewId,
            property_id: propertyId,
            user_id: userId,
          }),
        });

        const followUpData = (await response.json()) as FollowUpEngineResponse | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in followUpData && typeof followUpData.error === 'string'
              ? followUpData.error
              : 'Could not load follow-up questions.',
          );
        }

        const questions = Array.isArray((followUpData as FollowUpEngineResponse).questions)
          ? (followUpData as FollowUpEngineResponse).questions
          : [];

        if (questions.length === 0) {
          setFollowUpState('idle');
          onSubmitSuccess?.();
          return;
        }

        setFollowUpReviewId(reviewId);
        setFollowUpQuestions(questions);
        setFollowUpState('ready');
      } finally {
        setCarouselIndex(0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save review. Please try again.';

      if (reviewSaved) {
        setFollowUpState('error');
        setFollowUpError(`Your review was saved, but the follow-up questions did not load: ${message}`);
        onSubmitSuccess?.();
      } else {
        setSubmitError(message);
        setSubmitState('error');
      }
    }
  }

  async function handleFollowUpComplete(answers: FollowUpAnswer[]) {
    if (!followUpReviewId) {
      throw new Error('Missing submitted review ID for follow-up answers.');
    }

    const response = await fetch('/api/reviews/follow-up/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        review_id: followUpReviewId,
        answers,
      }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? 'Could not save your follow-up answers.');
    }

    window.setTimeout(() => {
      onSubmitSuccess?.();
    }, 350);
  }

  function handleFollowUpDismiss() {
    setFollowUpState('idle');
    setFollowUpQuestions([]);
    setFollowUpReviewId(null);
    onSubmitSuccess?.();
  }

  // ── Carousel nav ─────────────────────────────────────────────────────────

  const maxIndex = Math.max(0, qaItems.length - visibleCount);
  const visibleQA = qaItems.slice(carouselIndex, carouselIndex + visibleCount);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-5">

      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-gray-900">Write a Review</h3>
        <p className="text-xs text-gray-400 mt-0.5">Share your experience to help future guests.</p>
      </div>

      {/* Star Rating */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overall Rating</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              className="text-2xl leading-none transition-transform hover:scale-110 focus:outline-none"
            >
              <span className={(hoverRating || rating) >= star ? 'text-yellow-400' : 'text-gray-200'}>
                ★
              </span>
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-sm text-gray-500">{rating} / 5</span>
          )}
        </div>
      </div>

      {/* ── Q&A Carousel ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          Other users would love to know
        </p>
        <div className="flex items-center gap-2">
          {/* Prev */}
          <button
            onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}
            disabled={carouselIndex === 0}
            aria-label="Previous questions"
            className="shrink-0 size-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            ‹
          </button>

          {/* Cards */}
          <div className="flex gap-2 flex-1 overflow-hidden min-w-0">
            {visibleQA.map(item => (
              <button
                key={item.id}
                onClick={() => handleQAClick(item)}
                className="flex-1 min-w-0 text-left px-3 py-2.5 rounded-xl border border-[#0071c2]/20 bg-blue-50/60 hover:bg-blue-100/70 hover:border-[#0071c2]/40 transition-colors"
              >
                <p className="text-xs text-[#003580] font-medium leading-snug line-clamp-2">
                  {item.question}
                </p>
                <p className="text-[10px] text-blue-400 mt-1">Tap to answer →</p>
              </button>
            ))}
          </div>

          {/* Next */}
          <button
            onClick={() => setCarouselIndex(i => Math.min(maxIndex, i + 1))}
            disabled={carouselIndex >= maxIndex}
            aria-label="Next questions"
            className="shrink-0 size-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            ›
          </button>
        </div>

        {/* Carousel dots */}
        <div className="flex justify-center gap-1 mt-2">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <span
              key={i}
              className={`inline-block rounded-full transition-all ${
                i === carouselIndex ? 'w-3 h-1.5 bg-[#0071c2]' : 'w-1.5 h-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Main text area ─────────────────────────────────────────────────── */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => {
            setText(e.target.value);
            if (isPolished) setIsPolished(false);
          }}
          placeholder="Tell us about your stay — cleanliness, service, location, anything that stood out…"
          rows={5}
          maxLength={4000}
          className={`w-full rounded-xl border px-3.5 py-3 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 resize-none outline-none transition-colors pr-11 ${
            isPolished
              ? 'border-green-400 bg-green-50/40 focus:border-green-500 focus:ring-2 focus:ring-green-200'
              : 'border-gray-300 bg-white focus:border-[#0071c2] focus:ring-2 focus:ring-[#0071c2]/20'
          }`}
        />

        {/* Character count */}
        <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-300 select-none pointer-events-none">
          {text.length}/4000
        </span>

        {/* Polished badge */}
        {isPolished && (
          <span className="absolute top-2.5 right-2.5 bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full select-none">
            AI Polished
          </span>
        )}
      </div>

      {/* Mic row */}
      <div className="flex items-center gap-2">
        <div className="relative group">
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={isUnsupported}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isUnsupported
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : isListening
                ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100 animate-pulse'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
            {isListening ? 'Listening…' : 'Voice input'}
          </button>
          {isUnsupported && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
              <div className="bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                Not supported in this browser
              </div>
            </div>
          )}
        </div>

        {/* Polish / Undo row — pushed to right */}
        <div className="ml-auto flex items-center gap-2">
          {isPolished && (
            <button
              type="button"
              onClick={handleUndoPolish}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
            >
              Undo polish
            </button>
          )}
          <button
            type="button"
            onClick={handlePolish}
            disabled={!text.trim() || polishState === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 hover:border-violet-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {polishState === 'loading' ? (
              <>
                {/* Spinner */}
                <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Polishing…
              </>
            ) : (
              <>
                {/* Sparkle icon */}
                <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
                  <path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75Z" />
                  <path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75Z" />
                </svg>
                AI Polish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Polish error */}
      {polishState === 'error' && polishError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {polishError}
        </p>
      )}

      {/* ── Quick Tags ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Tags</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_TAGS.map(tag => (
            <button
              key={tag.label}
              type="button"
              onClick={() => handleTagClick(tag)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600 text-xs font-medium hover:bg-[#0071c2] hover:text-white hover:border-[#0071c2] transition-colors active:scale-95"
            >
              <span aria-hidden>{tag.emoji}</span>
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Submit ─────────────────────────────────────────────────────────── */}
      <div className="pt-1 border-t border-gray-100 flex items-center justify-between gap-3">
        {submitState === 'success' ? (
          <p className="text-sm text-green-700 font-medium flex items-center gap-1.5">
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Review submitted — thank you!
          </p>
        ) : (
          <>
            {submitState === 'error' && submitError && (
              <p className="text-xs text-red-600 flex-1">{submitError}</p>
            )}
            <div className="ml-auto">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!text.trim() || submitState === 'submitting'}
                className="px-5 py-2 rounded-xl bg-[#0071c2] text-white text-sm font-semibold hover:bg-[#005fa3] disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                {submitState === 'submitting' ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </>
        )}
      </div>

      {followUpState === 'loading' && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-4">
          <p className="text-sm font-semibold text-indigo-900">One quick follow-up…</p>
          <p className="mt-1 text-xs leading-5 text-indigo-700">
            We&apos;re choosing the most useful question to update this hotel&apos;s knowledge base.
          </p>
        </div>
      )}

      {followUpState === 'error' && followUpError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {followUpError}
        </div>
      )}

      {followUpState === 'ready' && followUpQuestions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
          <div className="max-h-full w-full max-w-3xl overflow-y-auto">
            <FollowUpCard
              questions={followUpQuestions}
              onComplete={handleFollowUpComplete}
              onDismiss={handleFollowUpDismiss}
            />
          </div>
        </div>
      )}
    </div>
  );
}
