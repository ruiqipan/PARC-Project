'use client';

import { useState, useRef } from 'react';
import { GeneratedQuestion, TravelerPersona, AnswerType } from '@/types';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface ReviewAndQuestionProps {
  hotelId: string;
  hotelName: string;
  persona: TravelerPersona;
}

type Step = 'write' | 'questions' | 'done';

interface Insight {
  good: number;
  bad: number;
  unknown: number;
  total: number;
}

const TOPIC_ICONS: Record<string, string> = {
  wifi: '📶',
  parking: '🅿️',
  breakfast: '🍳',
  noise: '🔇',
  cleanliness: '✨',
  gym: '💪',
  ac: '❄️',
  checkin: '🔑',
  accessibility: '♿',
  service: '⭐',
  value: '💰',
};

const GAP_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  missing: { label: 'Rarely mentioned', color: 'bg-orange-100 text-orange-700' },
  conflicting: { label: 'Conflicting reports', color: 'bg-yellow-100 text-yellow-700' },
  stale: { label: 'No recent data', color: 'bg-red-100 text-red-700' },
  periodic: { label: 'Periodic check', color: 'bg-blue-100 text-blue-700' },
  complaint_followup: { label: 'Follow-up', color: 'bg-purple-100 text-purple-700' },
};

function VoiceButton({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled: boolean }) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setStatus('processing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());

        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');

        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.text) onTranscript(data.text);
        } catch {
          // If transcription fails, just clear status
        }
        setStatus('idle');
      };

      mediaRecorder.start();
      setRecording(true);
      setStatus('recording');
    } catch {
      alert('Microphone access required for voice input.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <button
      type="button"
      disabled={disabled || status === 'processing'}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
        ${status === 'recording' ? 'bg-red-500 text-white animate-pulse' : ''}
        ${status === 'processing' ? 'bg-gray-200 text-gray-400 cursor-wait' : ''}
        ${status === 'idle' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : ''}
      `}
      title="Hold to record voice answer"
    >
      {status === 'recording' ? '🔴 Release to stop' : status === 'processing' ? '⏳ Transcribing…' : '🎙️ Voice'}
    </button>
  );
}

export default function ReviewAndQuestion({ hotelId, hotelName, persona }: ReviewAndQuestionProps) {
  const [step, setStep] = useState<Step>('write');
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerType>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [insights, setInsights] = useState<Record<number, Insight>>({});
  const [questionIds, setQuestionIds] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({});
  const [showComment, setShowComment] = useState(false);

  async function submitReview() {
    if (!reviewText.trim() || reviewText.trim().length < 10) return;
    setLoading(true);

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotelId, reviewText, persona }),
      });
      const data = await res.json();

      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setStep('questions');
        setCurrentQIdx(0);
      } else {
        setStep('done');
      }
    } catch {
      setStep('done');
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(answer: AnswerType) {
    setAnswers(prev => ({ ...prev, [currentQIdx]: answer }));

    const q = questions[currentQIdx];

    try {
      const res = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelId,
          answer,
          commentText: comments[currentQIdx] || null,
        }),
      });
      const data = await res.json();

      if (data.insight) {
        setInsights(prev => ({ ...prev, [currentQIdx]: data.insight }));
      }
      if (data.response?.id) {
        setQuestionIds(prev => ({ ...prev, [currentQIdx]: data.response.id }));
      }
    } catch {
      // Continue even if saving fails
    }

    // Move to next question after a brief pause
    setTimeout(() => {
      if (currentQIdx + 1 < questions.length) {
        setCurrentQIdx(i => i + 1);
        setShowComment(false);
      } else {
        setStep('done');
      }
    }, 1500);
  }

  async function submitFeedback(vote: 'up' | 'down') {
    setFeedback(prev => ({ ...prev, [currentQIdx]: vote }));
    const qId = questionIds[currentQIdx];
    if (!qId) return;

    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: qId, vote }),
    });
  }

  const currentQ = questions[currentQIdx];
  const currentAnswer = answers[currentQIdx];
  const currentInsight = insights[currentQIdx];

  // ── Step: write review ────────────────────────────────────────────────────
  if (step === 'write') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 text-lg mb-4">
          Share your experience at {hotelName}
        </h3>

        {/* Star rating */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">Your overall rating</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="text-2xl transition-transform hover:scale-110"
              >
                <span className={(hoveredRating || rating) >= star ? 'text-yellow-400' : 'text-gray-300'}>
                  ★
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Review text */}
        <Textarea
          placeholder="Tell us about your stay — what stood out? What could be better?"
          value={reviewText}
          onChange={e => setReviewText(e.target.value)}
          className="min-h-[120px] resize-none text-sm"
        />
        <p className="text-xs text-gray-400 mt-1.5">Minimum 10 characters</p>

        <Button
          onClick={submitReview}
          disabled={loading || reviewText.trim().length < 10}
          className="mt-4 w-full bg-[#003580] hover:bg-blue-800 text-white"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span> Analyzing your review…
            </span>
          ) : (
            'Submit review & help future guests'
          )}
        </Button>
      </div>
    );
  }

  // ── Step: follow-up questions ─────────────────────────────────────────────
  if (step === 'questions' && currentQ) {
    const gapInfo = GAP_TYPE_LABELS[currentQ.gap_type];

    return (
      <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-600 font-semibold text-sm">🔍 PARC Follow-up</span>
            {gapInfo && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gapInfo.color}`}>
                {gapInfo.label}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {currentQIdx + 1} of {questions.length}
          </span>
        </div>

        {/* Topic icon */}
        <div className="text-3xl mb-3">{TOPIC_ICONS[currentQ.topic] || '❓'}</div>

        {/* Question text */}
        <p className="text-gray-900 font-medium text-base leading-relaxed mb-2">
          {currentQ.text}
        </p>

        {/* Why this user */}
        {currentQ.why_this_user && (
          <p className="text-xs text-gray-500 mb-5 italic">
            {currentQ.why_this_user}
          </p>
        )}

        {/* Answer buttons */}
        {!currentAnswer ? (
          <div>
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => submitAnswer('good')}
                className="flex-1 py-3 rounded-xl bg-green-50 border-2 border-green-200 text-green-700 font-semibold text-sm hover:bg-green-100 hover:border-green-400 transition-all"
              >
                👍 Good
              </button>
              <button
                onClick={() => submitAnswer('bad')}
                className="flex-1 py-3 rounded-xl bg-red-50 border-2 border-red-200 text-red-700 font-semibold text-sm hover:bg-red-100 hover:border-red-400 transition-all"
              >
                👎 Bad
              </button>
              <button
                onClick={() => submitAnswer('unknown')}
                className="flex-1 py-3 rounded-xl bg-gray-50 border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 hover:border-gray-300 transition-all"
              >
                🤷 Not sure
              </button>
            </div>

            {/* Voice + text supplement */}
            <div className="flex items-center gap-2">
              <VoiceButton
                disabled={false}
                onTranscript={text => {
                  setComments(prev => ({ ...prev, [currentQIdx]: text }));
                  setShowComment(true);
                }}
              />
              <button
                onClick={() => setShowComment(v => !v)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                + Add text detail
              </button>
            </div>

            {showComment && (
              <div className="mt-2">
                <Textarea
                  placeholder="Add more detail (optional)…"
                  value={comments[currentQIdx] || ''}
                  onChange={e => setComments(prev => ({ ...prev, [currentQIdx]: e.target.value }))}
                  className="min-h-[60px] resize-none text-sm"
                />
              </div>
            )}

            {/* Question feedback */}
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Was this question relevant to you?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => submitFeedback('up')}
                  className={`text-lg transition-transform hover:scale-125 ${feedback[currentQIdx] === 'up' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                >
                  👍
                </button>
                <button
                  onClick={() => submitFeedback('down')}
                  className={`text-lg transition-transform hover:scale-125 ${feedback[currentQIdx] === 'down' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                >
                  👎
                </button>
              </div>
            </div>
          </div>
        ) : (
          // After answering — show confirmation + insight
          <div className="text-center py-4">
            <div className="text-4xl mb-2">
              {currentAnswer === 'good' ? '✅' : currentAnswer === 'bad' ? '❌' : '🤷'}
            </div>
            <p className="font-semibold text-gray-900 mb-1">Answer recorded!</p>
            {currentInsight && (
              <p className="text-sm text-gray-600">
                {currentInsight.total} travelers have answered this question
                &nbsp;·&nbsp;
                {currentInsight.good} Good · {currentInsight.bad} Bad · {currentInsight.unknown} Not sure
              </p>
            )}
            <p className="text-xs text-blue-600 mt-2 animate-pulse">
              {currentQIdx + 1 < questions.length ? 'Loading next question…' : 'Finishing up…'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Step: done ────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-green-200 rounded-xl p-6 shadow-sm text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">
        Thank you for helping future travelers!
      </h3>
      <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
        Your review and answers have been saved. This information helps Expedia keep{' '}
        <strong>{hotelName}</strong>&apos;s listing accurate and complete.
      </p>

      {Object.keys(answers).length > 0 && (
        <div className="mt-5 bg-green-50 rounded-lg p-4 text-left max-w-sm mx-auto">
          <p className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">
            Structured insights you contributed
          </p>
          {questions.map((q, i) => {
            const ans = answers[i];
            if (!ans) return null;
            return (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                <span>{TOPIC_ICONS[q.topic] || '•'}</span>
                <span className="flex-1">{q.topic.charAt(0).toUpperCase() + q.topic.slice(1)}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  ans === 'good' ? 'bg-green-100 text-green-700' :
                  ans === 'bad' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {ans === 'good' ? 'Good' : ans === 'bad' ? 'Bad' : 'Not sure'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Button
        onClick={() => { setStep('write'); setReviewText(''); setRating(0); setAnswers({}); setQuestions([]); setCurrentQIdx(0); setInsights({}); setFeedback({}); }}
        variant="outline"
        className="mt-5"
      >
        Write another review
      </Button>
    </div>
  );
}
