'use client';

/**
 * FollowUpCard
 *
 * Renders the dynamic "Follow-Up UI" for PARC APP's Feature 5.
 * Given a payload of 1-2 FollowUpQuestion objects from the 4-Layer Engine,
 * it steps the user through each question using the correct micro-interaction:
 *
 *   • Slider    → SemanticSlider  (degree axis between two poles)
 *   • Agreement → AgreementAxis   (continuous agree ↔ disagree slider)
 *   • QuickTag  → QuickTagList    (multi-select recognition chip grid)
 *
 * A persistent microphone button is always visible. When the user speaks,
 * the hook's NLP bridge maps sentiment keywords to UI state automatically
 * (e.g. "the light was too bright" → slides Lighting toward "Office White").
 *
 * Props:
 *   questions  – payload from POST /api/reviews/follow-up
 *   onComplete – called with the collected FollowUpAnswer[] when the user
 *                finishes the last question
 *   onDismiss  – called when the user skips the entire flow
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { Mic, MicOff, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useVoiceInput,
  mapTranscriptToSlider,
  mapTranscriptToAgreement,
} from '@/hooks/useVoiceInput';
import type {
  FollowUpQuestion,
  FollowUpAnswer,
  SemanticSliderQuestion,
  AgreementQuestion,
  QuickTagQuestion,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  questions: FollowUpQuestion[];
  onComplete: (answers: FollowUpAnswer[]) => Promise<void> | void;
  onDismiss: () => void;
}

// ─── SemanticSlider ───────────────────────────────────────────────────────────

interface SemanticSliderProps {
  question: SemanticSliderQuestion;
  value: number | null; // 0–1
  onChange: (v: number) => void;
}

function getTrackPercent(track: HTMLDivElement | null, clientX: number): number | null {
  if (!track) {
    return null;
  }

  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function SemanticSlider({ question, value, onChange }: SemanticSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const resolvedValue = value ?? 0.5;

  // Spring-animate the fill width so NLP nudges feel physical, not instant.
  const rawMotion = useMotionValue(resolvedValue);
  const springX   = useSpring(rawMotion, { stiffness: 220, damping: 26 });

  // Keep rawMotion in sync when `value` changes externally (e.g. NLP update).
  useEffect(() => {
    rawMotion.set(resolvedValue);
  }, [resolvedValue, rawMotion]);

  const updateValueFromClientX = (clientX: number) => {
    const pct = getTrackPercent(trackRef.current, clientX);
    if (pct !== null) {
      onChange(pct);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateValueFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    updateValueFromClientX(event.clientX);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    updateValueFromClientX(event.clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft')  onChange(Math.max(0, resolvedValue - 0.05));
    if (e.key === 'ArrowRight') onChange(Math.min(1, resolvedValue + 0.05));
  };

  // Interpolated thumb colour: indigo at left, violet at right
  const pct = Math.round(resolvedValue * 100);

  return (
    <div className="space-y-8">
      <div className="rounded-[30px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-7 py-9 shadow-sm">
        <p className="mx-auto max-w-xl text-center text-2xl font-semibold leading-9 text-slate-900 sm:text-[30px] sm:leading-[42px]">
          {question.prompt}
        </p>
      </div>

      {/* Pole labels */}
      <div className="flex justify-between px-1 text-sm font-semibold text-slate-500 select-none">
        <span>{question.left_label}</span>
        <span>{question.right_label}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={question.prompt}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative h-5 cursor-pointer touch-none rounded-full bg-slate-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {/* Filled portion */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500"
          style={{ width: springX.get() === resolvedValue ? `${pct}%` : undefined }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        />
        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 size-7 -translate-y-1/2 cursor-grab rounded-full border-[3px] border-indigo-500 bg-white shadow-lg shadow-indigo-200 active:cursor-grabbing"
          style={{ left: `calc(${pct}% - 10px)` }}
          animate={{ left: `calc(${pct}% - 10px)` }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          whileTap={{ scale: 1.3 }}
        />
      </div>

      {/* Current value readout */}
      <div className="rounded-full bg-slate-50 px-4 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected</p>
        <p className="mt-1 text-sm font-semibold text-slate-700">
          {value === null ? 'Slide to respond' : pct >= 50 ? question.right_label : question.left_label}
        </p>
      </div>
    </div>
  );
}

// ─── AgreementAxis ────────────────────────────────────────────────────────────

interface AgreementAxisProps {
  question: AgreementQuestion;
  value: number | null; // 1–5
  onChange: (v: number) => void;
}

const AGREEMENT_LABELS: Record<number, { short: string; tone: string }> = {
  1: { short: 'Doesn’t match', tone: 'text-rose-600' },
  2: { short: 'Leans no', tone: 'text-orange-500' },
  3: { short: 'In between', tone: 'text-slate-500' },
  4: { short: 'Leans yes', tone: 'text-emerald-600' },
  5: { short: 'Matches well', tone: 'text-green-600' },
};

function AgreementAxis({ question, value, onChange }: AgreementAxisProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const resolvedValue = value ?? 3;
  const ratio = (resolvedValue - 1) / 4;
  const selectedMeta = value === null ? null : AGREEMENT_LABELS[resolvedValue];

  const updateValueFromClientX = (clientX: number) => {
    const pct = getTrackPercent(trackRef.current, clientX);
    if (pct === null) {
      return;
    }

    onChange(Math.max(1, Math.min(5, Math.round(pct * 4) + 1)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateValueFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    updateValueFromClientX(event.clientX);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    updateValueFromClientX(event.clientX);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') onChange(Math.max(1, resolvedValue - 1));
    if (event.key === 'ArrowRight') onChange(Math.min(5, resolvedValue + 1));
  };

  return (
    <div className="space-y-8">
      <div className="rounded-[30px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-7 py-9 shadow-sm">
        <p className="mx-auto max-w-xl text-center text-2xl font-semibold leading-9 text-slate-900 sm:text-[30px] sm:leading-[42px]">
          &ldquo;{question.statement}&rdquo;
        </p>
      </div>

      <div className="space-y-4">
        <div
          ref={trackRef}
          role="slider"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={resolvedValue}
          aria-label={question.statement}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="relative h-5 cursor-pointer touch-none rounded-full bg-gradient-to-r from-rose-200 via-slate-200 to-emerald-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <motion.div
            className="absolute top-1/2 size-7 -translate-y-1/2 rounded-full border-[3px] border-indigo-500 bg-white shadow-lg shadow-indigo-200"
            style={{ left: `calc(${ratio * 100}% - 12px)` }}
            animate={{ left: `calc(${ratio * 100}% - 12px)` }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          />
        </div>

        <div className="flex justify-between text-sm font-semibold text-slate-500">
          <span>Not really</span>
          <span>Very much</span>
        </div>
      </div>

      <div className="rounded-full bg-slate-50 px-4 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected</p>
        <p className={cn('mt-1 text-sm font-semibold', selectedMeta?.tone ?? 'text-slate-500')}>
          {selectedMeta?.short ?? 'Slide to respond'}
        </p>
      </div>
    </div>
  );
}

// ─── QuickTagList ─────────────────────────────────────────────────────────────

interface QuickTagListProps {
  question: QuickTagQuestion;
  selected: string[];
  onToggle: (option: string) => void;
}

function QuickTagList({ question, selected, onToggle }: QuickTagListProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700 leading-relaxed">{question.prompt}</p>
      <p className="text-xs text-gray-400">Select all that apply.</p>

      <div className="flex flex-wrap gap-2.5">
        {question.options.map(opt => {
          const active = selected.includes(opt);
          return (
            <motion.button
              key={opt}
              onClick={() => onToggle(opt)}
              whileTap={{ scale: 0.93 }}
              className={cn(
                'px-3.5 py-2 rounded-full text-sm font-medium border transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                active
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600',
              )}
              aria-pressed={active}
            >
              {active && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mr-1.5"
                >
                  ✓
                </motion.span>
              )}
              {opt}
            </motion.button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-indigo-600 font-medium"
        >
          {selected.length} selected
        </motion.p>
      )}
    </div>
  );
}

// ─── VoiceButton ─────────────────────────────────────────────────────────────

interface VoiceButtonProps {
  isListening: boolean;
  isUnsupported: boolean;
  transcript: string;
  onToggle: () => void;
}

function VoiceButton({ isListening, isUnsupported, transcript, onToggle }: VoiceButtonProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <motion.button
        onClick={onToggle}
        disabled={isUnsupported}
        whileTap={isUnsupported ? {} : { scale: 0.92 }}
        animate={isListening ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={isListening ? { repeat: Infinity, duration: 1.4 } : {}}
        title={
          isUnsupported
            ? 'Voice input unavailable in this browser'
            : isListening
            ? 'Tap to stop recording'
            : 'Tap to answer by voice'
        }
        className={cn(
          'relative flex size-10 items-center justify-center rounded-full border transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          isUnsupported
            ? 'border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed'
            : isListening
            ? 'border-red-400 bg-red-500 text-white shadow-lg shadow-red-200'
            : 'border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50',
        )}
      >
        {isListening ? <MicOff size={18} /> : <Mic size={18} />}

        {/* Ripple ring while listening */}
        {isListening && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-red-400"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeOut' }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {(isListening || transcript) && (
          <motion.div
            key={isListening ? 'transcript-live' : 'transcript-done'}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={cn(
              'max-w-[140px] rounded-2xl border px-3 py-2 text-right shadow-sm',
              isListening
                ? 'border-red-100 bg-white'
                : 'border-indigo-100 bg-indigo-50/80',
            )}
          >
            <p className={cn(
              'mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]',
              isListening ? 'text-red-500' : 'text-indigo-500',
            )}>
              {isListening ? 'Listening' : 'Voice applied'}
            </p>
            <p className="text-xs text-slate-700 line-clamp-3">
              {transcript || <span className="italic text-gray-400">speak now</span>}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Answer state helpers ─────────────────────────────────────────────────────

function blankAnswer(q: FollowUpQuestion): FollowUpAnswer {
  return {
    feature_name:       q.feature_name,
    ui_type:            q.ui_type,
    quantitative_value: null,
    qualitative_note:   null,
  };
}

// ─── FollowUpCard (main) ──────────────────────────────────────────────────────

export default function FollowUpCard({ questions, onComplete, onDismiss }: Props) {
  const [step, setStep]     = useState(0);
  const [done, setDone]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Per-step answer state
  const [answers, setAnswers] = useState<FollowUpAnswer[]>(
    () => questions.map(blankAnswer),
  );

  const current = questions[step];
  const answer  = answers[step];

  // ── Voice ──────────────────────────────────────────────────────────────────
  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    isUnsupported,
  } = useVoiceInput({ lang: 'en-US' });

  const toggleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  /**
   * NLP bridge: whenever the transcript settles (mic off, transcript non-empty),
   * attempt to auto-update the current question's UI state.
   *
   * For Slider → mapTranscriptToSlider uses the question's nlp_hints
   * For Agreement → mapTranscriptToAgreement uses universal sentiment patterns
   * For QuickTag → no NLP mapping (recognition, not interpretation)
   */
  useEffect(() => {
    if (isListening || !transcript) return;

    setAnswers(prev => {
      const next = [...prev];
      const q    = questions[step];
      const a    = { ...next[step] };

      if (q.ui_type === 'Slider') {
        const mapped = mapTranscriptToSlider(transcript, q.nlp_hints);
        if (mapped !== null) a.quantitative_value = mapped;
      } else if (q.ui_type === 'Agreement') {
        const mapped = mapTranscriptToAgreement(transcript);
        if (mapped !== null) a.quantitative_value = mapped;
      }

      // Always store the transcript as a qualitative note.
      a.qualitative_note = transcript;
      next[step] = a;
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, transcript]);

  // ── Per-question update helpers ───────────────────────────────────────────

  const setSliderValue = (v: number) =>
    setAnswers(prev => {
      const next = [...prev];
      next[step] = { ...next[step], quantitative_value: v };
      return next;
    });

  const setAgreementValue = (v: number) =>
    setAnswers(prev => {
      const next = [...prev];
      next[step] = { ...next[step], quantitative_value: v };
      return next;
    });

  const toggleTag = (tag: string) =>
    setAnswers(prev => {
      const next  = [...prev];
      const cur   = next[step].qualitative_note?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
      const exists = cur.includes(tag);
      const updated = exists ? cur.filter(t => t !== tag) : [...cur, tag];
      next[step] = { ...next[step], qualitative_note: updated.join(', ') || null };
      return next;
    });

  // ── Navigation ─────────────────────────────────────────────────────────────

  const advance = async () => {
    if (step < questions.length - 1) {
      setStep(s => s + 1);
      setSubmitError('');
    } else {
      setSubmitError('');
      setIsSubmitting(true);
      try {
        await onComplete(answers);
        setDone(true);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Unable to save your answer right now.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const canAdvance = (() => {
    if (current.ui_type === 'Slider')    return answer.quantitative_value !== null;
    if (current.ui_type === 'Agreement') return answer.quantitative_value !== null;
    if (current.ui_type === 'QuickTag')  return (answer.qualitative_note ?? '').length > 0;
    return false;
  })();

  // ─── Render: completion screen ─────────────────────────────────────────────

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-xl rounded-[32px] border border-gray-100 bg-white p-9 text-center shadow-xl"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
        >
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" strokeWidth={1.5} />
        </motion.div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Thank you!</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          Your insights help future travelers make better decisions.
        </p>
      </motion.div>
    );
  }

  // ─── Render: question card ─────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-5 pb-4">
        <div className="flex-1 min-w-0 pr-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-500">
            Quick follow-up
          </p>
          <div className="flex gap-1.5 mb-1.5">
            {questions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i <= step ? 'bg-indigo-500' : 'bg-slate-200',
                  i === step ? 'w-8' : 'w-2.5',
                )}
              />
            ))}
          </div>
          {/* Reason: why this question was chosen */}
          {questions[0]?.reason && (
            <p className="text-[11px] leading-[1.45] text-indigo-600/80 max-w-xs">
              {questions[0].reason}
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          disabled={isSubmitting}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Skip follow-up questions"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Question body (animated slide-in per step) ── */}
      <div className="min-h-[360px] px-6 pb-3 pt-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Question {step + 1} of {questions.length}
            </p>
          </div>
          <VoiceButton
            isListening={isListening}
            isUnsupported={isUnsupported}
            transcript={transcript}
            onToggle={toggleMic}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {current.ui_type === 'Slider' && (
              <SemanticSlider
                question={current}
                value={answer.quantitative_value}
                onChange={setSliderValue}
              />
            )}
            {current.ui_type === 'Agreement' && (
              <AgreementAxis
                question={current}
                value={answer.quantitative_value as number | null}
                onChange={setAgreementValue}
              />
            )}
            {current.ui_type === 'QuickTag' && (
              <QuickTagList
                question={current}
                selected={
                  answer.qualitative_note
                    ?.split(',')
                    .map(s => s.trim())
                    .filter(Boolean) ?? []
                }
                onToggle={toggleTag}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer: Next / Submit ── */}
      <div className="border-t border-slate-100 px-6 pb-6 pt-4">
        {submitError ? (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {submitError}
          </p>
        ) : null}

        <motion.button
          onClick={advance}
          disabled={!canAdvance || isSubmitting}
          whileTap={canAdvance && !isSubmitting ? { scale: 0.97 } : {}}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-all duration-200',
            canAdvance && !isSubmitting
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 hover:bg-indigo-700'
              : 'cursor-not-allowed bg-slate-100 text-slate-300',
          )}
        >
          {isSubmitting ? (
            'Saving…'
          ) : step < questions.length - 1 ? (
            <>Next <ChevronRight size={15} /></>
          ) : (
            'Submit answer'
          )}
        </motion.button>

        <button
          onClick={onDismiss}
          disabled={isSubmitting}
          className="mt-2 w-full py-2 text-xs text-slate-400 transition-colors hover:text-slate-600"
        >
          Skip all follow-ups
        </button>
      </div>
    </div>
  );
}

// ─── Demo payload ─────────────────────────────────────────────────────────────

/**
 * DEMO_QUESTIONS
 *
 * Example payload as it would arrive from POST /api/reviews/follow-up.
 * Shows all three UI types in action. Wire into a page like this:
 *
 *   import FollowUpCard, { DEMO_QUESTIONS } from '@/components/hotel/FollowUpCard';
 *
 *   <FollowUpCard
 *     questions={DEMO_QUESTIONS}
 *     onComplete={(answers) => console.log(answers)}
 *     onDismiss={() => setShowFollowUp(false)}
 *   />
 */
export const DEMO_QUESTIONS: FollowUpQuestion[] = [
  {
    ui_type:     'Slider',
    feature_name: 'room_lighting',
    prompt:      'How would you describe the room lighting?',
    left_label:  'Soft & Warm',
    right_label: 'Bright & White',
    nlp_hints: [
      {
        keywords: ['bright', 'harsh', 'glaring', 'fluorescent', 'white', 'clinical', 'office'],
        direction: 'right',
      },
      {
        keywords: ['soft', 'dim', 'warm', 'cozy', 'dark', 'moody', 'yellow', 'amber'],
        direction: 'left',
      },
    ],
  },
  {
    ui_type:      'Agreement',
    feature_name: 'dog_friendly',
    statement:    'This hotel is genuinely dog friendly',
    nlp_hints: [
      {
        keywords: ['yes', 'agree', 'friendly', 'welcoming', 'great', 'loved', 'perfect'],
        direction: 'right',
      },
      {
        keywords: ['no', 'not', 'unfriendly', 'terrible', 'awful', 'banned', 'refused'],
        direction: 'left',
      },
    ],
  },
  {
    ui_type:      'QuickTag',
    feature_name: 'amenities_used',
    prompt:       'Which amenities did you actually use during your stay?',
    options:      [
      'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar', 'Room Service',
      'Parking', 'Business Centre', 'Concierge', 'Laundry',
    ],
  },
];
