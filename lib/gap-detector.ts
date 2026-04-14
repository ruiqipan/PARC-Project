import { Gap, Review } from '@/types';
import { TOPIC_KEYWORDS, POSITIVE_WORDS, NEGATIVE_WORDS } from './topic-keywords';

export function detectGaps(reviews: Review[]): Gap[] {
  const gaps: Gap[] = [];
  const now = new Date();

  if (reviews.length === 0) return [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const mentioning = reviews.filter(r => {
      const text = (r.review_text || '').toLowerCase();
      return keywords.some(kw => text.includes(kw));
    });

    const mentionRate = mentioning.length / reviews.length;

    // ── MISSING: fewer than 15% of reviews cover this topic ──────────────────
    if (mentionRate < 0.15 && reviews.length >= 3) {
      gaps.push({
        topic,
        gap_type: 'missing',
        confidence_score: Math.min(0.9, 0.8 - mentionRate * 2),
        evidence: `Only ${Math.round(mentionRate * 100)}% of reviews mention ${topic} (benchmark: 15%+)`,
      });
      continue; // don't double-count as conflicting
    }

    // ── CONFLICTING: same topic has significant positive AND negative mentions ─
    if (mentioning.length >= 3) {
      const posCount = mentioning.filter(r =>
        POSITIVE_WORDS.some(w => r.review_text.toLowerCase().includes(w))
      ).length;
      const negCount = mentioning.filter(r =>
        NEGATIVE_WORDS.some(w => r.review_text.toLowerCase().includes(w))
      ).length;

      const conflictRatio = Math.min(posCount, negCount) / mentioning.length;
      if (conflictRatio > 0.25) {
        gaps.push({
          topic,
          gap_type: 'conflicting',
          confidence_score: Math.min(0.95, conflictRatio * 1.5),
          evidence: `${posCount} positive vs ${negCount} negative mentions out of ${mentioning.length} total`,
        });
      }
    }

    // ── STALE: last mention was >90 days ago ──────────────────────────────────
    if (mentioning.length >= 2) {
      const recentMentions = mentioning.filter(r => {
        if (!r.acquisition_date) return false;
        const daysDiff =
          (now.getTime() - new Date(r.acquisition_date).getTime()) / 86400000;
        return daysDiff < 90;
      });
      if (recentMentions.length === 0) {
        gaps.push({
          topic,
          gap_type: 'stale',
          confidence_score: 0.7,
          evidence: `No mention of ${topic} in reviews from the last 90 days`,
        });
      }
    }
  }

  // ── PERIODIC: always re-validate cleanliness every 30 reviews ─────────────
  if (reviews.length > 0 && reviews.length % 30 < 5) {
    const alreadyHasCleanliness = gaps.some(g => g.topic === 'cleanliness');
    if (!alreadyHasCleanliness) {
      gaps.push({
        topic: 'cleanliness',
        gap_type: 'periodic',
        confidence_score: 0.55,
        evidence: 'Periodic revalidation of cleanliness standards',
      });
    }
  }

  return gaps.sort((a, b) => b.confidence_score - a.confidence_score);
}

// Detect what topics the reviewer mentioned in their own text
export function analyzeReviewText(text: string): {
  mentionedTopics: string[];
  hasNegativeSentiment: boolean;
  negativePhrases: string[];
} {
  const lower = text.toLowerCase();
  const mentionedTopics: string[] = [];
  const negativePhrases: string[] = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      mentionedTopics.push(topic);
    }
  }

  const hasNegativeSentiment = NEGATIVE_WORDS.some(w => lower.includes(w));
  if (hasNegativeSentiment) {
    // Extract short phrases around negative words for context
    NEGATIVE_WORDS.forEach(word => {
      const idx = lower.indexOf(word);
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + 40);
        negativePhrases.push(text.slice(start, end).trim());
      }
    });
  }

  return { mentionedTopics, hasNegativeSentiment, negativePhrases };
}
