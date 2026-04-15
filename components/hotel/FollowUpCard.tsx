'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MessageSquareText, Mic, MicOff, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  mapTranscriptToAgreement,
  mapTranscriptToSlider,
  useVoiceInput,
} from '@/hooks/useVoiceInput';
import type {
  FollowUpAnswer,
  FollowUpQuestion,
  QuickTagQuestion,
  SemanticSliderQuestion,
} from '@/types';

interface Props {
  questions: FollowUpQuestion[];
  onComplete: (answers: FollowUpAnswer[]) => Promise<void> | void;
  onDismiss: () => void;
}

const AUTO_ADVANCE_DELAY_MS = 550;

const AGREEMENT_OPTIONS = [
  { value: 1, label: 'No' },
  { value: 3, label: 'Neutral' },
  { value: 5, label: 'Yes' },
] as const;

const AGREEMENT_SUMMARY: Record<number, string> = {
  1: 'No',
  2: 'Leans no',
  3: 'Neutral',
  4: 'Leans yes',
  5: 'Yes',
};

function blankAnswer(question: FollowUpQuestion): FollowUpAnswer {
  return {
    feature_name: question.feature_name,
    ui_type: question.ui_type,
    quantitative_value: null,
    qualitative_note: null,
  };
}

function hasAnswer(answer: FollowUpAnswer): boolean {
  return answer.quantitative_value !== null || Boolean(answer.qualitative_note?.trim());
}

function inferQuantitativeValue(question: FollowUpQuestion, note: string): number | null {
  if (!note.trim()) {
    return null;
  }

  if (question.ui_type === 'Slider') {
    return mapTranscriptToSlider(note, question.nlp_hints);
  }

  if (question.ui_type === 'Agreement') {
    return mapTranscriptToAgreement(note);
  }

  return null;
}

function getSliderSummary(question: SemanticSliderQuestion, value: number | null): string | null {
  if (value === null) {
    return null;
  }

  if (value <= 0.15) return question.left_label;
  if (value < 0.4) return `Closer to ${question.left_label}`;
  if (value <= 0.6) return 'In between';
  if (value < 0.85) return `Closer to ${question.right_label}`;
  return question.right_label;
}

function getAnswerSummary(question: FollowUpQuestion, answer: FollowUpAnswer): string | null {
  if (question.ui_type === 'Slider') {
    return getSliderSummary(question, answer.quantitative_value);
  }

  if (question.ui_type === 'Agreement') {
    return answer.quantitative_value === null ? null : AGREEMENT_SUMMARY[answer.quantitative_value] ?? null;
  }

  const selected = answer.qualitative_note
    ?.split(',')
    .map(item => item.trim())
    .filter(Boolean) ?? [];

  return selected.length > 0 ? `${selected.length} selected` : null;
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

function getQuestionPrompt(question: FollowUpQuestion): string {
  if (question.ui_type === 'Slider' || question.ui_type === 'QuickTag') {
    return question.prompt;
  }

  return question.statement;
}

function QuickTagOptions({
  question,
  selected,
  onToggle,
}: {
  question: QuickTagQuestion;
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {question.options.map(option => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={cn(
              'rounded-full border px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-[#0071c2] bg-[#0071c2] text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-[#0071c2] hover:text-[#0071c2]',
            )}
            aria-pressed={active}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function SemanticSlider({
  question,
  value,
  onChange,
}: {
  question: SemanticSliderQuestion;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const resolvedValue = value ?? 0.5;
  const pct = Math.round(resolvedValue * 100);

  const updateFromClientX = (clientX: number) => {
    const next = getTrackPercent(trackRef.current, clientX);
    if (next !== null) {
      onChange(next);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) {
      updateFromClientX(event.clientX);
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    updateFromClientX(event.clientX);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') onChange(Math.max(0, resolvedValue - 0.05));
    if (event.key === 'ArrowRight') onChange(Math.min(1, resolvedValue + 0.05));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between px-1 text-sm font-semibold text-slate-500">
        <span>{question.left_label}</span>
        <span>{question.right_label}</span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label={question.prompt}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative h-5 cursor-pointer touch-none rounded-full bg-slate-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071c2]"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 via-[#0071c2] to-emerald-500"
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        />
        <motion.div
          className="absolute top-1/2 size-7 -translate-y-1/2 rounded-full border-[3px] border-[#0071c2] bg-white shadow-md"
          animate={{ left: `calc(${pct}% - 12px)` }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        />
      </div>

      <div className="rounded-full bg-slate-50 px-4 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Selected</p>
        <p className="mt-1 text-sm font-semibold text-slate-700">
          {getSliderSummary(question, value) ?? 'Slide to respond'}
        </p>
      </div>
    </div>
  );
}

async function parseTranscriptWithAI(
  transcript: string,
  question: FollowUpQuestion,
): Promise<number | null> {
  const body: Record<string, string> = {
    transcript,
    ui_type: question.ui_type,
    feature_name: question.feature_name,
    prompt: getQuestionPrompt(question),
  };
  if (question.ui_type === 'Slider') {
    body.left_label  = question.left_label;
    body.right_label = question.right_label;
  }

  const res = await fetch('/api/reviews/nlp-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { quantitative_value?: number | null };
  return typeof data.quantitative_value === 'number' ? data.quantitative_value : null;
}

export default function FollowUpCard({ questions, onComplete, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [answers, setAnswers] = useState<FollowUpAnswer[]>(() => questions.map(blankAnswer));
  const [manualSelection, setManualSelection] = useState<boolean[]>(() => questions.map(() => false));
  const [showTextInput, setShowTextInput] = useState<boolean[]>(() => questions.map(() => false));
  const [showAssistMenu, setShowAssistMenu] = useState<boolean[]>(() => questions.map(() => false));
  const [aiParsingStep, setAiParsingStep] = useState<number | null>(null);

  const manualSelectionRef = useRef(manualSelection);
  const autoAdvanceRef = useRef<number | null>(null);
  const voiceBaseTextRef = useRef('');
  const voiceStepRef = useRef<number | null>(null);

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    isUnsupported,
  } = useVoiceInput({ lang: 'en-US' });

  const current = questions[step];
  const answer = answers[step];
  const answerSummary = getAnswerSummary(current, answer);
  const inferredFromNote =
    !manualSelection[step]
    && Boolean(answer.qualitative_note?.trim())
    && answer.quantitative_value !== null
    && current.ui_type !== 'QuickTag';

  useEffect(() => {
    manualSelectionRef.current = manualSelection;
  }, [manualSelection]);

  const clearPendingAdvance = useCallback(() => {
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setIsAutoAdvancing(false);
  }, []);

  useEffect(() => {
    return () => clearPendingAdvance();
  }, [clearPendingAdvance]);

  const stopVoiceCapture = useCallback(() => {
    if (isListening) {
      stopListening();
    }
    voiceStepRef.current = null;
  }, [isListening, stopListening]);

  const setManualSelectionForStep = useCallback((targetStep: number, value: boolean) => {
    setManualSelection(prev => {
      const next = [...prev];
      next[targetStep] = value;
      manualSelectionRef.current = next;
      return next;
    });
  }, []);

  const updateNoteForStep = useCallback((targetStep: number, note: string) => {
    setAnswers(prev => {
      const next = [...prev];
      const question = questions[targetStep];
      const trimmed = note.trim();
      const nextAnswer = {
        ...next[targetStep],
        qualitative_note: trimmed ? note : null,
      };

      if (!manualSelectionRef.current[targetStep] && question.ui_type !== 'QuickTag') {
        nextAnswer.quantitative_value = trimmed ? inferQuantitativeValue(question, note) : null;
      }

      next[targetStep] = nextAnswer;
      return next;
    });
  }, [questions]);

  useEffect(() => {
    if (voiceStepRef.current !== step) {
      return;
    }

    const base = voiceBaseTextRef.current.trimEnd();
    const combined = transcript
      ? (base ? `${base}${base.endsWith('\n') ? '' : ' '}${transcript}` : transcript)
      : base;

    updateNoteForStep(step, combined);

    if (!isListening) {
      voiceBaseTextRef.current = combined;

      // Fire AI parse to replace keyword heuristic with a real semantic score.
      const capturedStep = voiceStepRef.current;
      const question = questions[capturedStep];
      if (combined.trim() && question && question.ui_type !== 'QuickTag') {
        setAiParsingStep(capturedStep);
        parseTranscriptWithAI(combined, question)
          .then(value => {
            if (value !== null) {
              setAnswers(prev => {
                const next = [...prev];
                // Only apply if user hasn't manually overridden since voice stopped.
                if (!manualSelectionRef.current[capturedStep]) {
                  next[capturedStep] = { ...next[capturedStep], quantitative_value: value };
                }
                return next;
              });
            }
          })
          .catch(() => { /* silently fall back to keyword heuristic result */ })
          .finally(() => setAiParsingStep(null));
      }
    }
  }, [isListening, step, transcript, updateNoteForStep, questions]);

  async function submitAnswers(nextAnswers: FollowUpAnswer[]) {
    clearPendingAdvance();
    stopVoiceCapture();
    setSubmitError('');
    setIsSubmitting(true);

    try {
      await onComplete(nextAnswers);
      onDismiss();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save your follow-up right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function advance(nextAnswers: FollowUpAnswer[] = answers) {
    clearPendingAdvance();
    stopVoiceCapture();

    if (step < questions.length - 1) {
      setSubmitError('');
      setStep(previous => previous + 1);
      return;
    }

    await submitAnswers(nextAnswers);
  }

  function scheduleAdvance(nextAnswers: FollowUpAnswer[]) {
    clearPendingAdvance();
    setIsAutoAdvancing(true);
    autoAdvanceRef.current = window.setTimeout(() => {
      void advance(nextAnswers);
    }, AUTO_ADVANCE_DELAY_MS);
  }

  function handleBack() {
    if (step === 0 || isSubmitting) {
      return;
    }

    clearPendingAdvance();
    stopVoiceCapture();
    setSubmitError('');
    setStep(previous => previous - 1);
  }

  function handleQuantitativeSelect(value: number) {
    if (current.ui_type === 'QuickTag' || isSubmitting) {
      return;
    }

    const nextAnswers = answers.map((item, index) => (
      index === step
        ? { ...item, quantitative_value: value }
        : item
    ));

    setAnswers(nextAnswers);
    setManualSelectionForStep(step, true);
    scheduleAdvance(nextAnswers);
  }

  function handleSliderChange(value: number) {
    if (current.ui_type !== 'Slider' || isSubmitting) {
      return;
    }

    clearPendingAdvance();
    setSubmitError('');

    setAnswers(prev => {
      const next = [...prev];
      next[step] = { ...next[step], quantitative_value: value };
      return next;
    });

    setManualSelectionForStep(step, true);
    scheduleAdvance(answers.map((item, index) => (
      index === step ? { ...item, quantitative_value: value } : item
    )));
  }

  function handleQuickTagToggle(option: string) {
    clearPendingAdvance();
    setSubmitError('');
    setShowTextInput(prev => {
      const next = [...prev];
      next[step] = true;
      return next;
    });

    setAnswers(prev => {
      const next = [...prev];
      const selected = next[step].qualitative_note
        ?.split(',')
        .map(item => item.trim())
        .filter(Boolean) ?? [];
      const exists = selected.includes(option);
      const updated = exists ? selected.filter(item => item !== option) : [...selected, option];

      next[step] = {
        ...next[step],
        qualitative_note: updated.join(', ') || null,
      };

      return next;
    });
  }

  function handleToggleTextInput() {
    clearPendingAdvance();
    setShowAssistMenu(prev => {
      const next = [...prev];
      next[step] = true;
      return next;
    });
    setShowTextInput(prev => {
      const next = [...prev];
      next[step] = !next[step];
      return next;
    });
  }

  function handleTextNoteChange(note: string) {
    clearPendingAdvance();
    setSubmitError('');
    updateNoteForStep(step, note);
  }

  function handleVoiceToggle() {
    clearPendingAdvance();
    setShowAssistMenu(prev => {
      const next = [...prev];
      next[step] = true;
      return next;
    });

    if (isUnsupported) {
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    setShowTextInput(prev => {
      const next = [...prev];
      next[step] = true;
      return next;
    });
    setSubmitError('');
    voiceStepRef.current = step;
    voiceBaseTextRef.current = answers[step].qualitative_note ?? '';
    startListening();
  }

  function handleToggleAssistMenu() {
    clearPendingAdvance();
    setShowAssistMenu(prev => {
      const next = [...prev];
      next[step] = !next[step];
      return next;
    });
  }

  const canContinue = hasAnswer(answer);
  const selectedQuickTags = current.ui_type === 'QuickTag'
    ? answer.qualitative_note?.split(',').map(item => item.trim()).filter(Boolean) ?? []
    : [];
  const prompt = getQuestionPrompt(current);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0 || isSubmitting}
            className={cn(
              'flex size-9 items-center justify-center rounded-full transition-colors',
              step === 0 || isSubmitting
                ? 'cursor-default text-slate-200'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
            aria-label="Previous follow-up question"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0071c2]">
              Quick follow-up
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {step + 1} of {questions.length}
            </p>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            disabled={isSubmitting}
            className="flex size-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Skip follow-up questions"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex gap-1.5">
          {questions.map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                index < step ? 'w-4 bg-[#0071c2]' : index === step ? 'w-8 bg-[#0071c2]' : 'w-3 bg-slate-200',
              )}
            />
          ))}
        </div>
      </div>

      <div className="px-5 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-5"
          >
            <div className="rounded-[28px] border border-slate-100 bg-gradient-to-br from-white via-[#f8fbfe] to-[#eef6fc] px-5 py-7 sm:px-7">
              <p className="text-2xl font-semibold leading-9 text-slate-900 sm:text-[34px] sm:leading-[46px]">
                {prompt}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{current.reason}</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {current.ui_type === 'Slider'
                  ? 'Slide once to continue'
                  : current.ui_type === 'Agreement'
                  ? 'Tap once to continue'
                  : 'Select all that apply'}
              </p>

              {current.ui_type === 'Slider' ? (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <SemanticSlider
                      question={current}
                      value={answer.quantitative_value}
                      onChange={handleSliderChange}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAssistMenu}
                    className="mt-7 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-[#0071c2] hover:text-[#0071c2]"
                    aria-label="More answer options"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              ) : null}

              {current.ui_type === 'Agreement' ? (
                <div className="flex items-start gap-3">
                  <div className="grid min-w-0 flex-1 grid-cols-3 gap-2.5">
                    {AGREEMENT_OPTIONS.map(option => {
                      const active = answer.quantitative_value === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleQuantitativeSelect(option.value)}
                          disabled={isSubmitting}
                          className={cn(
                            'rounded-2xl border px-3 py-3 text-sm font-semibold transition-all',
                            active
                              ? 'border-[#0071c2] bg-[#0071c2] text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-[#0071c2] hover:text-[#0071c2]',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAssistMenu}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-[#0071c2] hover:text-[#0071c2]"
                    aria-label="More answer options"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              ) : null}

              {current.ui_type === 'QuickTag' ? (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <QuickTagOptions
                      question={current}
                      selected={selectedQuickTags}
                      onToggle={handleQuickTagToggle}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAssistMenu}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-[#0071c2] hover:text-[#0071c2]"
                    aria-label="More answer options"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              ) : null}

              <AnimatePresence initial={false}>
                {showAssistMenu[step] && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleTextInput}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-[#0071c2] hover:text-[#0071c2]"
                      >
                        <MessageSquareText size={15} />
                        {showTextInput[step] || answer.qualitative_note ? 'Edit note' : 'Type instead'}
                      </button>

                      <button
                        type="button"
                        onClick={handleVoiceToggle}
                        disabled={isUnsupported}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                          isUnsupported
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300'
                            : isListening
                            ? 'border-rose-300 bg-rose-50 text-rose-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-[#0071c2] hover:text-[#0071c2]',
                        )}
                      >
                        {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                        {isListening ? 'Stop voice' : 'Use voice'}
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleAssistMenu}
                        className="ml-auto inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-[#0071c2] hover:text-[#0071c2]"
                        aria-label="Close extra answer options"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {(showTextInput[step] || Boolean(answer.qualitative_note) || isListening) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      value={answer.qualitative_note ?? ''}
                      onChange={event => handleTextNoteChange(event.target.value)}
                      placeholder="Add a quick note if you want to explain your answer..."
                      rows={4}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#0071c2]"
                    />

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {isListening ? (
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-600">
                          Listening now...
                        </span>
                      ) : null}

                      {!isListening && aiParsingStep === step ? (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-600">
                          AI analyzing...
                        </span>
                      ) : null}

                      {inferredFromNote && answerSummary && aiParsingStep !== step ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                          Inferred answer: {answerSummary}
                        </span>
                      ) : null}

                      {!inferredFromNote && answerSummary ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700">
                          Selected: {answerSummary}
                        </span>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        {submitError ? (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void advance()}
          disabled={!canContinue || isSubmitting || isAutoAdvancing}
          className={cn(
            'w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
            canContinue && !isSubmitting && !isAutoAdvancing
              ? 'bg-[#0071c2] text-white hover:bg-[#005fa3]'
              : 'cursor-not-allowed bg-slate-100 text-slate-400',
          )}
        >
          {isSubmitting
            ? 'Saving...'
            : isAutoAdvancing
            ? 'Continuing...'
            : step < questions.length - 1
            ? 'Continue'
            : 'Save follow-up'}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          disabled={isSubmitting}
          className="mt-2 w-full py-2 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          Skip follow-ups
        </button>
      </div>
    </div>
  );
}

export const DEMO_QUESTIONS: FollowUpQuestion[] = [
  {
    ui_type: 'Slider',
    feature_name: 'room_lighting',
    evidence_text: 'Other users found that "the room was bright enough to work from, but harsh at night."',
    reason: 'Lighting has a thin review signal right now, so your input helps future guests understand how it feels in practice.',
    prompt: 'How would you describe the room lighting?',
    left_label: 'Soft & Warm',
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
    ui_type: 'Agreement',
    feature_name: 'dog_friendly',
    evidence_text: 'The hotel states that "pets are welcome with advance notice."',
    reason: 'Pet policies matter for a high-risk booking decision, so we want a fresher signal from real stays.',
    statement: 'This hotel is genuinely dog friendly',
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
    ui_type: 'QuickTag',
    feature_name: 'amenities_used',
    evidence_text: 'Recent reviews rarely mention which amenities guests actually used during their stay.',
    reason: 'This helps turn generic amenity claims into practical guidance for future guests.',
    prompt: 'Which amenities did you actually use during your stay?',
    options: [
      'Pool',
      'Gym',
      'Spa',
      'Restaurant',
      'Bar',
      'Room Service',
      'Parking',
      'Business Centre',
      'Concierge',
      'Laundry',
    ],
  },
];
