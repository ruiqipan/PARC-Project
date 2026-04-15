'use client';

import { useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuickTag {
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
  { label: 'Location',    snippet: 'Located about 200m from the nearest subway station. ' },
  { label: 'Facilities',  snippet: 'Hotel facilities are well-maintained and modern. ' },
  { label: 'Cleanliness', snippet: 'Rooms were clean and tidy. ' },
  { label: 'Service',     snippet: 'Staff were friendly and helpful. ' },
  { label: 'WiFi',        snippet: 'WiFi was fast and reliable throughout the property. ' },
  { label: 'Breakfast',   snippet: 'Breakfast options were varied and fresh. ' },
  { label: 'Value',       snippet: 'Good value for the price paid. ' },
  { label: 'Noise',       snippet: 'Rooms were quiet with minimal street noise. ' },
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
  /** Called after a successful save, so parent can refresh the feed. */
  onSubmitSuccess?: () => void;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type PolishState = 'idle' | 'loading' | 'done' | 'error';

export default function ReviewInput({ propertyId, userId, onSubmitSuccess }: ReviewInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [originalText, setOriginalText] = useState(''); // pre-polish snapshot
  const [isPolished, setIsPolished] = useState(false);
  const [polishState, setPolishState] = useState<PolishState>('idle');
  const [polishError, setPolishError] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');

  // Q&A carousel index
  const [carouselIndex, setCarouselIndex] = useState(0);
  const visibleCount = 2; // cards visible at once

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

  // ── Q&A click ────────────────────────────────────────────────────────────

  function handleQAClick(item: QAItem) {
    appendToText(item.seed);
  }

  // ── Quick Tag click ──────────────────────────────────────────────────────

  function handleTagClick(tag: QuickTag) {
    appendToText(tag.snippet);
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

    try {
      const supabase = getSupabaseClient();

      const payload: Record<string, unknown> = {
        eg_property_id: propertyId,
        raw_text: isPolished ? originalText : text,
        ai_polished_text: isPolished ? text : null,
        sentiment_score: null,
      };

      if (userId) payload.user_id = userId;

      const { error } = await supabase.from('Review_Submissions').insert(payload);

      if (error) throw new Error(error.message);

      setSubmitState('success');
      setText('');
      setOriginalText('');
      setIsPolished(false);
      setPolishState('idle');
      onSubmitSuccess?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save review. Please try again.');
      setSubmitState('error');
    }
  }

  // ── Carousel nav ─────────────────────────────────────────────────────────

  const maxIndex = Math.max(0, QA_ITEMS.length - visibleCount);
  const visibleQA = QA_ITEMS.slice(carouselIndex, carouselIndex + visibleCount);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-5">

      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-gray-900">Write a Review</h3>
        <p className="text-xs text-gray-400 mt-0.5">Share your experience to help future guests.</p>
      </div>

      {/* ── Q&A Carousel ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top Q&amp;A</p>
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
            aria-label="Voice dictation (coming soon)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 text-xs hover:border-gray-300 hover:text-gray-500 transition-colors cursor-not-allowed"
          >
            {/* Mic icon */}
            <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
            Voice input
          </button>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
            <div className="bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
              Voice dictation coming soon
            </div>
          </div>
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
              <span className="text-[10px] text-gray-400 group-hover:text-white">+</span>
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
    </div>
  );
}
