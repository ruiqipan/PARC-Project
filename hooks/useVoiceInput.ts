'use client';

/**
 * useVoiceInput
 *
 * A React hook that wires the browser's Web Speech API to a follow-up question.
 *
 * NLP bridge (placeholder):
 *   Real production implementation would pipe `transcript` to a Claude API
 *   call (e.g. POST /api/nlp-sentiment) and receive a structured intent back.
 *   Here we use a keyword-match heuristic so the demo works offline and the
 *   data-flow is transparent to the reader.
 *
 * Usage:
 *   const { isListening, transcript, startListening, stopListening,
 *           mapTranscriptToSlider, mapTranscriptToAgreement } = useVoiceInput();
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NlpHint } from '@/types';

// ─── Browser SpeechRecognition type shim ─────────────────────────────────────
// The Web Speech API isn't in the standard TypeScript lib yet.
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function normalizeTranscriptSpacing(transcript: string): string {
  return transcript
    // Normalize exotic whitespace to plain spaces first.
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    // Remove spaces inserted between CJK characters.
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    // Remove spaces between CJK characters and common Chinese punctuation.
    .replace(/([\u3400-\u9fff])\s+([，。！？；：、])/g, '$1$2')
    .replace(/([，。！？；：、])\s+([\u3400-\u9fff])/g, '$1$2')
    // Tighten English punctuation spacing for cleaner dictation output.
    .replace(/\s+([,.;!?%])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    // Re-join common contractions split by speech engines.
    .replace(/\b([A-Za-z]+)\s+'\s+([A-Za-z]+)\b/g, "$1'$2")
    .replace(/\b([A-Za-z]+)\s+n\s*'\s*t\b/gi, "$1n't")
    // Avoid duplicate punctuation emitted by unstable interim results.
    .replace(/([,.;!?])\1+/g, '$1')
    // Collapse excessive ASCII spacing while preserving normal word boundaries.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function buildTranscriptFromResults(results: SpeechRecognitionResultList): string {
  let finalText = '';
  let interimText = '';

  for (let i = 0; i < results.length; i++) {
    const segment = results[i]?.[0]?.transcript?.trim();
    if (!segment) continue;

    if (results[i].isFinal) {
      finalText += `${segment} `;
    } else {
      interimText += `${segment} `;
    }
  }

  return normalizeTranscriptSpacing(`${finalText}${interimText}`);
}

// ─── NLP helpers ──────────────────────────────────────────────────────────────

/**
 * mapTranscriptToSlider
 *
 * Given a voice transcript and the question's nlp_hints, returns a target
 * slider value in [0, 1].  0 = fully left pole, 1 = fully right pole.
 * Returns `null` when no hint keyword matches — the caller should leave the
 * current slider position unchanged.
 *
 * Example:
 *   transcript = "the light was way too bright"
 *   hints = [
 *     { keywords: ["bright","harsh","glaring","fluorescent"], direction: "right" },
 *     { keywords: ["soft","dim","warm","cozy","dark"],        direction: "left"  },
 *   ]
 *   → 0.85  (nudge toward right pole with high confidence)
 */
export function mapTranscriptToSlider(
  transcript: string,
  hints: NlpHint[],
): number | null {
  const lower = transcript.toLowerCase();

  // Intensity modifiers shift the nudge amount up or down.
  const highIntensity = /\b(very|extremely|super|really|way too|completely|totally|absolutely)\b/.test(lower);
  const lowIntensity  = /\b(slightly|a bit|somewhat|kind of|a little|mildly)\b/.test(lower);
  const negated       = /\b(not|wasn't|weren't|didn't|no)\b/.test(lower);

  let bestScore = 0;
  let bestDirection: 'left' | 'right' | null = null;

  for (const hint of hints) {
    for (const kw of hint.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        // Simple TF score: matched keywords accumulate weight
        const score = 1 + hint.keywords.filter(k => lower.includes(k.toLowerCase())).length;
        if (score > bestScore) {
          bestScore = score;
          bestDirection = negated
            ? (hint.direction === 'left' ? 'right' : 'left') // flip on negation
            : hint.direction;
        }
      }
    }
  }

  if (!bestDirection) return null;

  // Base nudge strength: 0.6–0.95 depending on intensity modifiers
  const base = highIntensity ? 0.85 : lowIntensity ? 0.65 : 0.75;
  return bestDirection === 'right' ? base : 1 - base;
}

/**
 * mapTranscriptToAgreement
 *
 * Maps a voice transcript to a 1–5 agreement value.
 * Uses both sentiment keywords and explicit number words.
 * Returns `null` when no signal is found.
 *
 * Example: "I completely agree" → 5
 *          "not really"         → 2
 */
export function mapTranscriptToAgreement(transcript: string): number | null {
  const lower = transcript.toLowerCase();

  // Explicit number words take highest priority
  const numberMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  };
  for (const [word, val] of Object.entries(numberMap)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return val;
  }

  // Strong positive
  if (/\b(completely agree|strongly agree|absolutely|definitely yes|100 percent)\b/.test(lower)) return 5;
  // Mild positive
  if (/\b(agree|yes|correct|true|accurate|right)\b/.test(lower)) return 4;
  // Neutral
  if (/\b(neutral|unsure|not sure|maybe|kind of|somewhat)\b/.test(lower)) return 3;
  // Mild negative
  if (/\b(disagree|not really|don't think|doesn't seem|incorrect)\b/.test(lower)) return 2;
  // Strong negative
  if (/\b(completely disagree|strongly disagree|absolutely not|definitely not|wrong)\b/.test(lower)) return 1;

  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseVoiceInputReturn {
  /** Whether the mic is actively capturing. */
  isListening: boolean;
  /** Latest recognised transcript (live-updating during capture). */
  transcript: string;
  /** Start capturing. No-ops on unsupported browsers. */
  startListening: () => void;
  /** Stop capturing. */
  stopListening: () => void;
  /** true when SpeechRecognition is unavailable in this browser. */
  isUnsupported: boolean;
}

interface UseVoiceInputOptions {
  lang?: string;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const lang = options.lang ?? 'en-US';
  const hasSpeechRecognition =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [runtimeUnsupported, setRuntimeUnsupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isUnsupported = !hasSpeechRecognition || runtimeUnsupported;

  useEffect(() => {
    if (!hasSpeechRecognition) return;

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      return;
    }

    const rec = new Ctor();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = lang;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      setTranscript(buildTranscriptFromResults(e.results));
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      // "no-speech" is benign; surface others as unsupported.
      if (e.error !== 'no-speech') setRuntimeUnsupported(true);
      setIsListening(false);
    };

    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;

    return () => {
      rec.onresult = null;
      rec.onerror  = null;
      rec.onend    = null;
      try { rec.stop(); } catch { /* already stopped */ }
    };
  }, [hasSpeechRecognition, lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setTranscript('');
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      /* recognition already running */
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;
    recognitionRef.current.stop();
    setIsListening(false);
  }, [isListening]);

  return { isListening, transcript, startListening, stopListening, isUnsupported };
}
