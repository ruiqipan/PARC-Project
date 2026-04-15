'use client';

/**
 * FollowUpCard
 *
 * Renders the dynamic "Follow-Up UI" for PARC APP's Feature 5.
 * Given a payload of 1-2 FollowUpQuestion objects from the 4-Layer Engine,
 * it steps the user through each question using the correct micro-interaction:
 *
 *   • Slider    → SemanticSlider  (degree axis between two poles)
 *   • Agreement → AgreementAxis   (1–5 Disagree→Agree button bar)
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
  onComplete: (answers: FollowUpAnswer[]) => void;
  onDismiss: () => void;
}

// ─── SemanticSlider ───────────────────────────────────────────────────────────

interface SemanticSliderProps {
  question: SemanticSliderQuestion;
  value: number; // 0–1
  onChange: (v: number) => void;
}

function SemanticSlider({ question, value, onChange }: SemanticSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Spring-animate the fill width so NLP nudges feel physical, not instant.
  const rawMotion = useMotionValue(value);
  const springX   = useSpring(rawMotion, { stiffness: 220, damping: 26 });

  // Keep rawMotion in sync when `value` changes externally (e.g. NLP update).
  useEffect(() => {
    rawMotion.set(value);
  }, [value, rawMotion]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(pct);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft')  onChange(Math.max(0, value - 0.05));
    if (e.key === 'ArrowRight') onChange(Math.min(1, value + 0.05));
  };

  // Interpolated thumb colour: indigo at left, violet at right
  const pct = Math.round(value * 100);

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-gray-700 leading-relaxed">{question.prompt}</p>

      {/* Pole labels */}
      <div className="flex justify-between text-xs font-semibold text-gray-500 px-1 select-none">
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
        onClick={handleTrackClick}
        className="relative h-3 rounded-full bg-gray-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {/* Filled portion */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
          style={{ width: springX.get() === value ? `${pct}%` : undefined }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        />
        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-indigo-500 shadow-md cursor-grab active:cursor-grabbing"
          style={{ left: `calc(${pct}% - 10px)` }}
          animate={{ left: `calc(${pct}% - 10px)` }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          whileTap={{ scale: 1.3 }}
        />
      </div>

      {/* Current value readout */}
      <p className="text-center text-xs text-gray-400 tabular-nums select-none">
        {pct}% toward <span className="font-medium text-gray-600">{pct >= 50 ? question.right_label : question.left_label}</span>
      </p>
    </div>
  );
}

// ─── AgreementAxis ────────────────────────────────────────────────────────────

interface AgreementAxisProps {
  question: AgreementQuestion;
  value: number | null; // 1–5
  onChange: (v: number) => void;
}

const AGREEMENT_LABELS: Record<number, { short: string; color: string; bg: string; ring: string }> = {
  1: { short: 'Strongly\nDisagree', color: 'text-red-600',    bg: 'bg-red-50',    ring: 'ring-red-400'    },
  2: { short: 'Disagree',          color: 'text-orange-500',  bg: 'bg-orange-50', ring: 'ring-orange-400' },
  3: { short: 'Neutral',           color: 'text-gray-500',    bg: 'bg-gray-100',  ring: 'ring-gray-400'   },
  4: { short: 'Agree',             color: 'text-emerald-600', bg: 'bg-emerald-50',ring: 'ring-emerald-400'},
  5: { short: 'Strongly\nAgree',   color: 'text-green-600',   bg: 'bg-green-50',  ring: 'ring-green-500'  },
};

function AgreementAxis({ question, value, onChange }: AgreementAxisProps) {
  return (
    <div className="space-y-5">
      {/* Statement */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
        <p className="text-sm font-medium text-indigo-900 leading-relaxed text-center">
          &ldquo;{question.statement}&rdquo;
        </p>
      </div>

      {/* 1–5 Button bar */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => {
          const meta    = AGREEMENT_LABELS[n];
          const selected = value === n;
          return (
            <motion.button
              key={n}
              onClick={() => onChange(n)}
              whileTap={{ scale: 0.92 }}
              animate={selected ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: 0.25 }}
              className={cn(
                'flex-1 flex flex-col items-center gap-1.5 rounded-xl py-3 px-1',
                'border-2 text-xs font-semibold transition-all duration-150',
                'focus:outline-none focus-visible:ring-2',
                selected
                  ? `${meta.bg} border-current ${meta.color} ${meta.ring} ring-2`
                  : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600',
              )}
              aria-label={`${n} — ${meta.short.replace('\n', ' ')}`}
              aria-pressed={selected}
            >
              <span className="text-base font-bold leading-none">{n}</span>
              <span className="leading-tight text-center whitespace-pre-line">{meta.short}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[10px] font-medium text-gray-400 px-1 select-none">
        <span>← Disagree</span>
        <span>Agree →</span>
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
    <div className="flex items-center gap-3">
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
            : 'Tap to speak your answer'
        }
        className={cn(
          'relative w-11 h-11 rounded-full flex items-center justify-center transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          isUnsupported
            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
            : isListening
            ? 'bg-red-500 text-white shadow-lg shadow-red-200'
            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
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

      {/* Live transcript bubble */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            key="transcript"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2"
          >
            <p className="text-xs text-gray-500 mb-0.5 font-medium">Listening…</p>
            <p className="text-xs text-gray-800 truncate">
              {transcript || <span className="italic text-gray-400">speak now</span>}
            </p>
          </motion.div>
        )}
        {!isListening && transcript && (
          <motion.div
            key="done-transcript"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 min-w-0 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2"
          >
            <p className="text-xs text-indigo-500 mb-0.5 font-medium">Applied from voice</p>
            <p className="text-xs text-indigo-900 truncate">{transcript}</p>
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

  const advance = () => {
    if (step < questions.length - 1) {
      setStep(s => s + 1);
    } else {
      setDone(true);
      onComplete(answers);
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
        className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center max-w-sm mx-auto"
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
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-w-sm mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
        <div>
          <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mb-0.5">
            Quick follow-up
          </p>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all duration-300',
                  i <= step ? 'bg-indigo-500' : 'bg-gray-200',
                  i === step ? 'w-6' : 'w-2',
                )}
              />
            ))}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Skip follow-up questions"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Question body (animated slide-in per step) ── */}
      <div className="px-5 pt-5 pb-2 min-h-[260px]">
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
                value={answer.quantitative_value ?? 0.5}
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

      {/* ── Persistent Voice row ── */}
      <div className="px-5 py-3 border-t border-gray-100">
        <VoiceButton
          isListening={isListening}
          isUnsupported={isUnsupported}
          transcript={transcript}
          onToggle={toggleMic}
        />
      </div>

      {/* ── Footer: Next / Submit ── */}
      <div className="px-5 pb-5 pt-2">
        <motion.button
          onClick={advance}
          disabled={!canAdvance}
          whileTap={canAdvance ? { scale: 0.97 } : {}}
          className={cn(
            'w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200',
            canAdvance
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
              : 'bg-gray-100 text-gray-300 cursor-not-allowed',
          )}
        >
          {step < questions.length - 1 ? (
            <>Next <ChevronRight size={15} /></>
          ) : (
            'Submit answer'
          )}
        </motion.button>

        <button
          onClick={onDismiss}
          className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
