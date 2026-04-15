/**
 * 4-Layer Follow-Up Question Recommendation Engine
 *
 * This implementation keeps the original PARC ranking funnel intact:
 *   1. Property memory decay
 *   2. Description ↔ review blind spots
 *   3. Persona-aware boosts
 *   4. Decision-risk ranking
 *
 * The final question strategy is intentionally deterministic so the hackathon
 * demo stays aligned with product intent:
 *   - Positive review  -> 1 verification question about a valuable gap
 *   - Non-positive     -> 2 questions about the main pain point:
 *       a) confirm severity
 *       b) isolate the likely reason
 */

import { createServerClient } from '@/lib/supabase';
import { parseArrayField } from '@/lib/utils';
import type {
  AgreementQuestion,
  FollowUpEngineResponse,
  FollowUpQuestion,
  Hotel,
  NlpHint,
  Review,
  UserPersona,
} from '@/types';

interface AttributeGap {
  attribute: string;
  raw_score: number;
  final_score: number;
  source: 'decay' | 'blind_spot' | 'both';
  decay_days?: number;
  amenity_claimed?: string;
}

interface ReviewSubmissionRow {
  id: string;
  eg_property_id: string;
  user_id: string | null;
  rating: number | string | null;
  raw_text: string | null;
  ai_polished_text: string | null;
  sentiment_score: number | null;
  created_at: string | null;
}

type ReviewSentiment = 'positive' | 'non_positive';

interface AttributeMention {
  attribute: string;
  mentions: number;
  positive: number;
  negative: number;
}

const ATTRIBUTE_KEYWORDS: Record<string, string[]> = {
  parking: ['parking', 'garage', 'valet', 'car park', 'parked', 'lot'],
  breakfast: ['breakfast', 'morning meal', 'buffet', 'continental', 'brunch'],
  wifi: ['wifi', 'wi-fi', 'internet', 'wireless', 'connection speed', 'bandwidth', 'signal'],
  pet_policy: ['dog', 'pet', 'animal', 'cat', 'puppy', 'leash', 'pet-friendly', 'pet friendly'],
  check_in: ['check-in', 'check in', 'check out', 'checkout', 'arrival', 'late arrival', 'front desk', 'reception'],
  safety: ['safe', 'safety', 'security', 'secure', 'lock', 'keycard', 'emergency'],
  pool: ['pool', 'swimming', 'swim', 'hot tub', 'jacuzzi', 'heated pool'],
  gym: ['gym', 'fitness', 'workout', 'exercise', 'treadmill', 'weights'],
  noise: ['quiet', 'noise', 'noisy', 'loud', 'soundproof', 'silent', 'disturb'],
  cleanliness: ['clean', 'dirty', 'hygiene', 'spotless', 'stain', 'dusty', 'smell', 'odor', 'odour', 'mold', 'mildew'],
  transit: ['subway', 'metro', 'bus', 'train', 'station', 'transit', 'walk to', 'walkable'],
  accessibility: ['wheelchair', 'accessible', 'elevator', 'disabled', 'ramp', 'mobility', 'ada', 'step-free'],
  air_conditioning: ['ac', 'air conditioning', 'air-conditioning', 'hvac', 'cooling', 'thermostat'],
  construction: ['construction', 'renovation', 'drilling', 'building work', 'scaffolding'],
  breakfast_quality: ['eggs', 'pastry', 'coffee quality', 'breakfast selection', 'buffet variety'],
};

const DECAY_THRESHOLD_DAYS: Record<string, number> = {
  parking: 30,
  breakfast: 14,
  wifi: 30,
  pet_policy: 90,
  check_in: 60,
  safety: 90,
  pool: 45,
  gym: 60,
  noise: 60,
  cleanliness: 7,
  transit: 365,
  accessibility: 180,
  air_conditioning: 90,
  construction: 7,
  breakfast_quality: 14,
};

const AMENITY_TO_ATTRIBUTE: Record<string, string> = {
  free_parking: 'parking',
  breakfast_available: 'breakfast',
  breakfast_included: 'breakfast',
  internet: 'wifi',
  pool: 'pool',
  kids_pool: 'pool',
  fitness_equipment: 'gym',
  soundproof_room: 'noise',
  no_smoking: 'safety',
  frontdesk_24_hour: 'check_in',
  hot_tub: 'pool',
  spa: 'gym',
  ac: 'air_conditioning',
};

const PERSONA_ATTRIBUTES: Record<string, string[]> = {
  'Business traveler': ['wifi', 'check_in', 'parking', 'noise'],
  'Convention attendee': ['wifi', 'check_in', 'parking', 'noise'],
  'Digital nomad': ['wifi', 'check_in', 'parking', 'noise'],
  'Remote worker': ['wifi', 'check_in', 'parking', 'noise'],
  'Fast WiFi': ['wifi', 'check_in', 'parking', 'noise'],
  'Long-stay traveler': ['wifi', 'cleanliness', 'air_conditioning', 'check_in'],
  Backpacker: ['parking', 'breakfast', 'wifi'],
  'Budget traveler': ['parking', 'breakfast', 'wifi'],
  'Luxury traveler': ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Wellness traveler': ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Pool access': ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Gym access': ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Spa & relaxation': ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Couple traveler': ['noise', 'cleanliness', 'breakfast_quality'],
  'Family traveler': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Group traveler': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Traveling with baby/toddler': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Traveling with kids': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Traveling with teens': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Caregiver traveler': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Senior traveler': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  Families: ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Pet owner': ['pet_policy'],
  'Guide dog owner': ['pet_policy', 'accessibility'],
  'Wheelchair user': ['accessibility', 'check_in', 'safety'],
  'Mobility aid user': ['accessibility', 'check_in', 'safety'],
  'Visual impairment': ['accessibility', 'check_in', 'safety'],
  'Hearing impairment': ['accessibility', 'check_in', 'safety'],
  'Step-free access needed': ['accessibility', 'check_in', 'safety'],
  'Elevator access needed': ['accessibility', 'check_in', 'safety'],
  'Accessible bathroom needed': ['accessibility', 'check_in', 'safety'],
  Neurodivergent: ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Sensory-sensitive': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Light sleeper': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  Quiet: ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Strong AC': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Air quality sensitive': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Fragrance-sensitive': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Safety-conscious': ['safety', 'check_in'],
  'Cleanliness-focused': ['cleanliness', 'safety'],
  'Chronic illness': ['cleanliness', 'safety'],
  Tourist: ['transit', 'noise', 'breakfast'],
  'Weekend getaway': ['transit', 'noise', 'breakfast'],
  'Event traveler': ['transit', 'noise', 'breakfast'],
  'Adventure traveler': ['transit', 'noise', 'breakfast'],
  'Culture enthusiast': ['transit', 'noise', 'breakfast'],
  'Road tripper': ['parking', 'check_in'],
  'Parking needed': ['parking', 'check_in'],
  'Transit-first': ['transit', 'noise'],
  'Walkable area': ['transit', 'noise'],
  'Breakfast-first': ['breakfast', 'breakfast_quality'],
  Foodie: ['breakfast', 'breakfast_quality'],
  'Dietary restrictions': ['breakfast', 'breakfast_quality'],
  'Spacious room': ['cleanliness', 'air_conditioning'],
  'Solo traveler': ['safety', 'noise', 'check_in'],
  'Eco-conscious': ['transit'],
};

const RISK_WEIGHTS: Record<string, number> = {
  safety: 10,
  accessibility: 10,
  check_in: 9,
  pet_policy: 8,
  cleanliness: 8,
  wifi: 7,
  parking: 7,
  construction: 7,
  noise: 6,
  breakfast: 5,
  pool: 4,
  transit: 4,
  air_conditioning: 3,
  gym: 3,
  breakfast_quality: 2,
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  parking: 'parking',
  breakfast: 'breakfast',
  wifi: 'WiFi',
  pet_policy: 'pet-friendliness',
  check_in: 'check-in',
  safety: 'safety',
  pool: 'pool',
  gym: 'gym',
  noise: 'noise level',
  cleanliness: 'cleanliness',
  transit: 'location convenience',
  accessibility: 'accessibility',
  air_conditioning: 'air conditioning',
  construction: 'construction disruption',
  breakfast_quality: 'breakfast quality',
};

const POSITIVE_SENTIMENT_WORDS = [
  'great', 'good', 'excellent', 'amazing', 'wonderful', 'smooth', 'friendly',
  'comfortable', 'clean', 'quiet', 'easy', 'reliable', 'convenient', 'loved',
];

const NEGATIVE_SENTIMENT_WORDS = [
  'bad', 'poor', 'terrible', 'awful', 'dirty', 'loud', 'slow', 'broken',
  'frustrating', 'unsafe', 'confusing', 'smelly', 'noisy', 'unreliable',
  'delayed', 'hard', 'issue', 'problem', 'worst',
];

const NEGATIVE_CUES = [
  'bad', 'poor', 'terrible', 'awful', 'dirty', 'loud', 'slow', 'broken',
  'frustrating', 'unsafe', 'confusing', 'smelly', 'noisy', 'unreliable',
  'delayed', 'hard', 'issue', 'problem', 'difficult', 'crowded', 'weak',
  'expensive', 'fee', 'charge', 'limited', 'stale', 'worse',
];

const POSITIVE_CUES = [
  'great', 'good', 'excellent', 'amazing', 'clean', 'quiet', 'smooth',
  'stable', 'reliable', 'easy', 'convenient', 'comfortable', 'friendly',
];

const SLIDER_CONFIG: Record<
  string,
  {
    prompt: (userTags: string[]) => string;
    left_label: string;
    right_label: string;
    nlp_hints: NlpHint[];
  }
> = {
  noise: {
    prompt: userTags =>
      hasAnyTag(userTags, ['Quiet', 'Light sleeper', 'Family traveler', 'Traveling with baby/toddler', 'Traveling with kids'])
        ? 'How quiet did the room feel when you were trying to rest or sleep?'
        : 'How quiet did the room feel during your stay?',
    left_label: 'Peaceful',
    right_label: 'Disruptive',
    nlp_hints: [
      { keywords: ['quiet', 'peaceful', 'silent', 'sleepable', 'calm'], direction: 'left' },
      { keywords: ['loud', 'noisy', 'hallway', 'traffic', 'shouting', 'banging'], direction: 'right' },
    ],
  },
  cleanliness: {
    prompt: () => 'How clean did the room and bathroom feel overall?',
    left_label: 'Needs Work',
    right_label: 'Spotless',
    nlp_hints: [
      { keywords: ['dirty', 'stained', 'dusty', 'smelly', 'mold', 'gross'], direction: 'left' },
      { keywords: ['clean', 'fresh', 'spotless', 'tidy', 'well-kept'], direction: 'right' },
    ],
  },
  wifi: {
    prompt: userTags =>
      hasAnyTag(userTags, ['Business traveler', 'Digital nomad', 'Remote worker', 'Fast WiFi'])
        ? 'How reliable did the WiFi feel for work, video calls, or trip planning?'
        : 'How reliable did the WiFi feel during your stay?',
    left_label: 'Unreliable',
    right_label: 'Reliable',
    nlp_hints: [
      { keywords: ['slow', 'weak', 'dropped', 'disconnect', 'unstable', 'lag'], direction: 'left' },
      { keywords: ['fast', 'stable', 'reliable', 'strong', 'smooth'], direction: 'right' },
    ],
  },
  breakfast_quality: {
    prompt: () => 'How would you rate the breakfast quality and variety?',
    left_label: 'Disappointing',
    right_label: 'Excellent',
    nlp_hints: [
      { keywords: ['cold', 'stale', 'limited', 'bland', 'crowded'], direction: 'left' },
      { keywords: ['fresh', 'varied', 'good', 'excellent', 'worth it'], direction: 'right' },
    ],
  },
  air_conditioning: {
    prompt: () => 'How effective did the room temperature control feel?',
    left_label: 'Hard to Manage',
    right_label: 'Easy to Control',
    nlp_hints: [
      { keywords: ['hot', 'warm', 'humid', 'broken', 'loud'], direction: 'left' },
      { keywords: ['cool', 'comfortable', 'steady', 'worked', 'easy'], direction: 'right' },
    ],
  },
  construction: {
    prompt: () => 'How disruptive did construction or renovation activity feel?',
    left_label: 'Not Noticeable',
    right_label: 'Very Disruptive',
    nlp_hints: [
      { keywords: ['none', 'quiet', 'fine', 'didn’t notice'], direction: 'left' },
      { keywords: ['construction', 'drilling', 'renovation', 'hammering', 'scaffolding'], direction: 'right' },
    ],
  },
};

const REASON_PROMPTS: Record<string, (text: string, userTags: string[]) => AgreementQuestion> = {
  noise: (text, userTags) =>
    buildAgreementQuestion(
      'noise_reason',
      pickReasonStatement(
        text,
        [
          {
            keywords: ['hallway', 'door', 'neighbor', 'next room', 'corridor', 'elevator'],
            statement: 'Hallway or neighboring-room noise was the main reason the stay felt disruptive.',
          },
          {
            keywords: ['street', 'traffic', 'outside', 'cars', 'sirens'],
            statement: 'Outside or street noise was the main reason the room felt disruptive.',
          },
          {
            keywords: ['ac', 'air conditioning', 'hvac', 'vent', 'machine'],
            statement: 'In-room equipment noise was the main reason the room felt disruptive.',
          },
        ],
        hasAnyTag(userTags, ['Quiet', 'Light sleeper'])
          ? 'The problem was repeated noise during rest hours, not just a one-off interruption.'
          : 'The problem was recurring noise, not just a one-off interruption.',
      ),
    ),
  wifi: text =>
    buildAgreementQuestion(
      'wifi_reason',
      pickReasonStatement(text, [
        { keywords: ['slow', 'speed', 'buffer', 'lag'], statement: 'Slow speed was the main reason the WiFi felt unreliable.' },
        { keywords: ['drop', 'disconnect', 'signal', 'weak'], statement: 'Dropouts or weak in-room signal were the main WiFi problem.' },
      ], 'Reliability was the bigger WiFi issue than the login or setup process.'),
    ),
  parking: text =>
    buildAgreementQuestion(
      'parking_reason',
      pickReasonStatement(text, [
        { keywords: ['fee', 'charge', 'cost', 'pay'], statement: 'Unexpected fees were the most frustrating part of parking.' },
        { keywords: ['entrance', 'find', 'garage', 'signage'], statement: 'Finding the parking entrance or instructions was the biggest parking challenge.' },
        { keywords: ['full', 'space', 'spot', 'availability'], statement: 'Parking availability was the main issue, more than the process itself.' },
      ], 'The parking process created more friction than confidence.'),
    ),
  breakfast: text =>
    buildAgreementQuestion(
      'breakfast_reason',
      pickReasonStatement(text, [
        { keywords: ['cold', 'stale', 'taste', 'quality'], statement: 'Food quality was the main breakfast issue.' },
        { keywords: ['crowded', 'line', 'wait'], statement: 'Crowding or long waits were the main breakfast issue.' },
        { keywords: ['late', 'hours', 'timing', 'ended'], statement: 'Timing or availability was the main breakfast issue.' },
      ], 'Breakfast felt less dependable in practice than it sounded on paper.'),
    ),
  check_in: text =>
    buildAgreementQuestion(
      'check_in_reason',
      pickReasonStatement(text, [
        { keywords: ['late', 'night', 'after midnight'], statement: 'Late-arrival handling was the main check-in problem.' },
        { keywords: ['line', 'wait', 'staff', 'desk'], statement: 'Front-desk response time was the main check-in problem.' },
        { keywords: ['instructions', 'confusing', 'unclear'], statement: 'Unclear instructions made check-in harder than it should have been.' },
      ], 'The check-in problem felt structural, not just bad luck with timing.'),
    ),
  cleanliness: text =>
    buildAgreementQuestion(
      'cleanliness_reason',
      pickReasonStatement(text, [
        { keywords: ['bathroom', 'toilet', 'shower', 'sink'], statement: 'Bathroom cleanliness drove most of the problem.' },
        { keywords: ['sheet', 'bed', 'linen', 'pillow'], statement: 'Bedding or linen cleanliness drove most of the problem.' },
        { keywords: ['smell', 'odor', 'odour', 'musty', 'mold'], statement: 'Smell or stale air was a major part of the cleanliness issue.' },
      ], 'The issue felt like an ongoing cleanliness problem, not a tiny one-off detail.'),
    ),
  pet_policy: text =>
    buildAgreementQuestion(
      'pet_policy_reason',
      pickReasonStatement(text, [
        { keywords: ['fee', 'charge', 'cost'], statement: 'Extra fees made the pet experience feel less friendly.' },
        { keywords: ['restrict', 'rule', 'policy'], statement: 'Policy restrictions mattered more than staff attitude.' },
      ], 'The pet experience felt more restricted than welcoming.'),
    ),
  accessibility: text =>
    buildAgreementQuestion(
      'accessibility_reason',
      pickReasonStatement(text, [
        { keywords: ['elevator', 'lift'], statement: 'Elevator access was the main accessibility friction point.' },
        { keywords: ['step', 'stairs', 'ramp'], statement: 'Steps or missing ramps were the main accessibility issue.' },
        { keywords: ['bathroom', 'shower'], statement: 'Bathroom usability was the biggest accessibility issue.' },
      ], 'The accessibility problem affected actual usability, not just convenience.'),
    ),
  air_conditioning: text =>
    buildAgreementQuestion(
      'air_conditioning_reason',
      pickReasonStatement(text, [
        { keywords: ['hot', 'warm', 'cooling'], statement: 'The room never reached a comfortable temperature.' },
        { keywords: ['loud', 'noise', 'rattle'], statement: 'AC noise was as big a problem as the temperature itself.' },
        { keywords: ['control', 'thermostat'], statement: 'The thermostat or controls made the AC hard to manage.' },
      ], 'The AC issue felt persistent, not just a brief fluctuation.'),
    ),
};

function hasAnyTag(tags: string[], needles: string[]): boolean {
  const lowered = new Set(tags.map(tag => tag.toLowerCase()));
  return needles.some(needle => lowered.has(needle.toLowerCase()));
}

function normaliseNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildReviewText(review: ReviewSubmissionRow): string {
  return [review.ai_polished_text, review.raw_text].filter(Boolean).join('\n').trim();
}

function splitSentences(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

function runDecayLayer(reviews: Review[], today: Date): AttributeGap[] {
  const gaps: AttributeGap[] = [];

  for (const [attribute, keywords] of Object.entries(ATTRIBUTE_KEYWORDS)) {
    const threshold = DECAY_THRESHOLD_DAYS[attribute];
    if (!threshold) continue;

    let lastMentionDate: Date | null = null;

    for (const review of reviews) {
      const text = `${review.review_title ?? ''} ${review.review_text ?? ''}`.toLowerCase();
      if (!containsAny(text, keywords)) continue;

      const date = review.acquisition_date ? new Date(review.acquisition_date) : null;
      if (date && !Number.isNaN(date.getTime()) && (!lastMentionDate || date > lastMentionDate)) {
        lastMentionDate = date;
      }
    }

    const daysSince = lastMentionDate
      ? Math.floor((today.getTime() - lastMentionDate.getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;

    if (daysSince > threshold) {
      gaps.push({
        attribute,
        raw_score: Math.min(daysSince === Number.POSITIVE_INFINITY ? 5 : daysSince / threshold, 5),
        final_score: 0,
        source: 'decay',
        decay_days: Number.isFinite(daysSince) ? daysSince : undefined,
      });
    }
  }

  return gaps;
}

function runBlindSpotLayer(hotel: Hotel, reviews: Review[]): AttributeGap[] {
  const gaps: AttributeGap[] = [];
  const corpus = reviews
    .map(review => `${review.review_title ?? ''} ${review.review_text ?? ''}`)
    .join(' ')
    .toLowerCase();

  for (const amenity of parseArrayField(hotel.popular_amenities_list)) {
    const attribute = AMENITY_TO_ATTRIBUTE[amenity.toLowerCase()];
    if (!attribute) continue;

    const keywords = ATTRIBUTE_KEYWORDS[attribute] ?? [];
    if (!containsAny(corpus, keywords)) {
      gaps.push({
        attribute,
        raw_score: 3,
        final_score: 0,
        source: 'blind_spot',
        amenity_claimed: amenity,
      });
    }
  }

  if (hotel.pet_policy) {
    const keywords = ATTRIBUTE_KEYWORDS.pet_policy ?? [];
    if (!containsAny(corpus, keywords) && !gaps.find(gap => gap.attribute === 'pet_policy')) {
      gaps.push({
        attribute: 'pet_policy',
        raw_score: 3,
        final_score: 0,
        source: 'blind_spot',
        amenity_claimed: 'pet_policy',
      });
    }
  }

  if (hotel.check_in_end_time) {
    const keywords = ATTRIBUTE_KEYWORDS.check_in ?? [];
    if (!containsAny(corpus, keywords) && !gaps.find(gap => gap.attribute === 'check_in')) {
      gaps.push({
        attribute: 'check_in',
        raw_score: 3,
        final_score: 0,
        source: 'blind_spot',
        amenity_claimed: 'check_in_window',
      });
    }
  }

  return gaps;
}

function applyPersonaBoost(gaps: AttributeGap[], userTags: string[]): AttributeGap[] {
  return gaps.map(gap => {
    const boost = userTags.reduce((score, tag) => {
      const related = PERSONA_ATTRIBUTES[tag.trim()] ?? [];
      return score + (related.includes(gap.attribute) ? 2 : 0);
    }, 0);

    return { ...gap, raw_score: gap.raw_score + boost };
  });
}

function rankByRisk(gaps: AttributeGap[]): AttributeGap[] {
  const merged = new Map<string, AttributeGap>();

  for (const gap of gaps) {
    const existing = merged.get(gap.attribute);
    if (existing) {
      merged.set(gap.attribute, {
        ...existing,
        raw_score: existing.raw_score + gap.raw_score,
        source: 'both',
        amenity_claimed: existing.amenity_claimed ?? gap.amenity_claimed,
        decay_days: existing.decay_days ?? gap.decay_days,
      });
      continue;
    }

    merged.set(gap.attribute, { ...gap });
  }

  return Array.from(merged.values())
    .map(gap => ({
      ...gap,
      final_score: gap.raw_score * (RISK_WEIGHTS[gap.attribute] ?? 1),
    }))
    .sort((a, b) => b.final_score - a.final_score);
}

function detectReviewSentiment(review: ReviewSubmissionRow): ReviewSentiment {
  const rating = normaliseNumber(review.rating);
  if (rating !== null) {
    if (rating >= 4) return 'positive';
    return 'non_positive';
  }

  const text = buildReviewText(review).toLowerCase();
  const positiveScore = POSITIVE_SENTIMENT_WORDS.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
  const negativeScore = NEGATIVE_SENTIMENT_WORDS.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);

  if (positiveScore > negativeScore && positiveScore > 0) {
    return 'positive';
  }

  return 'non_positive';
}

function detectAttributeMentions(text: string): AttributeMention[] {
  const sentences = splitSentences(text);

  return Object.entries(ATTRIBUTE_KEYWORDS)
    .map(([attribute, keywords]) => {
      const mention = sentences.reduce<AttributeMention>(
        (accumulator, sentence) => {
          if (!containsAny(sentence, keywords)) return accumulator;

          const isNegative = containsAny(sentence, NEGATIVE_CUES);
          const isPositive = containsAny(sentence, POSITIVE_CUES);

          return {
            attribute,
            mentions: accumulator.mentions + 1,
            negative: accumulator.negative + (isNegative ? 1 : 0),
            positive: accumulator.positive + (isPositive ? 1 : 0),
          };
        },
        { attribute, mentions: 0, positive: 0, negative: 0 },
      );

      return mention;
    })
    .filter(mention => mention.mentions > 0)
    .sort((left, right) => {
      const leftScore = left.negative * 3 + left.mentions + (RISK_WEIGHTS[left.attribute] ?? 0);
      const rightScore = right.negative * 3 + right.mentions + (RISK_WEIGHTS[right.attribute] ?? 0);
      return rightScore - leftScore;
    });
}

function buildAgreementQuestion(feature_name: string, statement: string): AgreementQuestion {
  return {
    ui_type: 'Agreement',
    feature_name,
    statement,
    nlp_hints: [
      {
        keywords: ['yes', 'agree', 'accurate', 'true', 'exactly', 'definitely'],
        direction: 'right',
      },
      {
        keywords: ['no', 'disagree', 'not really', 'false', 'wrong', 'inaccurate'],
        direction: 'left',
      },
    ],
  };
}

function buildVerificationStatement(attribute: string, userTags: string[], gap: AttributeGap): string {
  const claimPrefix =
    gap.source !== 'decay' && gap.amenity_claimed
      ? `The hotel's advertised ${ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ')} `
      : 'The ';

  switch (attribute) {
    case 'wifi':
      return hasAnyTag(userTags, ['Business traveler', 'Digital nomad', 'Remote worker', 'Fast WiFi'])
        ? 'The WiFi felt stable enough for work, video calls, and trip planning.'
        : 'The WiFi felt stable enough to rely on during the stay.';
    case 'parking':
      return `${claimPrefix}parking process felt clear, convenient, and free of surprises.`;
    case 'breakfast':
    case 'breakfast_quality':
      return hasAnyTag(userTags, ['Family traveler', 'Breakfast-first', 'Foodie', 'Dietary restrictions'])
        ? 'Breakfast felt worth planning around in the morning, not just technically available.'
        : 'Breakfast quality and availability felt dependable in practice.';
    case 'check_in':
      return 'Check-in felt clear and smooth, including the actual arrival process.';
    case 'pet_policy':
      return hasAnyTag(userTags, ['Pet owner', 'Guide dog owner'])
        ? 'This hotel felt genuinely welcoming for guests traveling with pets.'
        : 'The pet-related policies felt easy to navigate in practice.';
    case 'noise':
      return hasAnyTag(userTags, ['Quiet', 'Light sleeper'])
        ? 'The room stayed quiet enough for real rest at night.'
        : 'Noise levels stayed manageable throughout the stay.';
    case 'cleanliness':
      return 'The room felt consistently clean, not just surface-level tidy.';
    case 'accessibility':
      return 'The accessibility setup felt practical and dependable in real use.';
    case 'air_conditioning':
      return 'The room temperature and AC felt easy to manage comfortably.';
    case 'safety':
      return 'The property felt secure and easy to navigate.';
    case 'transit':
      return 'Getting to and from the hotel felt convenient without extra hassle.';
    case 'construction':
      return 'There was little to no construction disruption during the stay.';
    case 'pool':
      return 'The pool experience felt well-kept and worth using.';
    case 'gym':
      return 'The gym felt usable and better than a token amenity.';
    default:
      return `The ${ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ')} held up well in actual use.`;
  }
}

function buildPrimaryQuestion(
  attribute: string,
  userTags: string[],
  mode: 'verification' | 'problem',
  gap?: AttributeGap,
): FollowUpQuestion {
  const slider = SLIDER_CONFIG[attribute];
  if (slider) {
    return {
      ui_type: 'Slider',
      feature_name: attribute,
      prompt: slider.prompt(userTags),
      left_label: slider.left_label,
      right_label: slider.right_label,
      nlp_hints: slider.nlp_hints,
    };
  }

  return buildAgreementQuestion(
    attribute,
    mode === 'problem'
      ? buildProblemStatement(attribute, userTags)
      : buildVerificationStatement(attribute, userTags, gap ?? {
          attribute,
          raw_score: 0,
          final_score: 0,
          source: 'decay',
        }),
  );
}

function buildProblemStatement(attribute: string, userTags: string[]): string {
  switch (attribute) {
    case 'wifi':
      return hasAnyTag(userTags, ['Business traveler', 'Digital nomad', 'Remote worker', 'Fast WiFi'])
        ? 'The WiFi felt too unstable to trust for work or video calls.'
        : 'The WiFi felt too unreliable to trust during the stay.';
    case 'parking':
      return 'The parking process created avoidable friction.';
    case 'breakfast':
    case 'breakfast_quality':
      return 'Breakfast felt less dependable than expected.';
    case 'check_in':
      return 'Check-in felt harder than it should have been.';
    case 'pet_policy':
      return 'The hotel felt less pet-friendly in practice than it sounded on paper.';
    case 'noise':
      return hasAnyTag(userTags, ['Quiet', 'Light sleeper'])
        ? 'The room was not quiet enough for restful sleep.'
        : 'Noise disrupted the stay more than it should have.';
    case 'cleanliness':
      return 'Cleanliness issues affected the stay in a meaningful way.';
    case 'accessibility':
      return 'Accessibility gaps created real friction during the stay.';
    case 'air_conditioning':
      return 'Temperature control was harder than it should have been.';
    case 'safety':
      return 'The property did not feel as secure as expected.';
    case 'construction':
      return 'Construction or renovation activity was meaningfully disruptive.';
    default:
      return `The ${ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ')} was worse in practice than expected.`;
  }
}

function pickReasonStatement(
  text: string,
  candidates: Array<{ keywords: string[]; statement: string }>,
  fallback: string,
): string {
  const lower = text.toLowerCase();
  const match = candidates.find(candidate => containsAny(lower, candidate.keywords));
  return match?.statement ?? fallback;
}

function buildReasonQuestion(attribute: string, text: string, userTags: string[]): FollowUpQuestion {
  const builder = REASON_PROMPTS[attribute];
  if (builder) return builder(text, userTags);

  return buildAgreementQuestion(
    `${attribute}_reason`,
    `The problem with ${ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ')} felt persistent, not like a one-off inconvenience.`,
  );
}

function selectPositiveGap(rankedGaps: AttributeGap[], mentions: AttributeMention[]): AttributeGap | undefined {
  const mentionedAttributes = new Set(mentions.map(mention => mention.attribute));
  return rankedGaps.find(gap => !mentionedAttributes.has(gap.attribute)) ?? rankedGaps[0];
}

function selectPrimaryNegativeAttribute(
  mentions: AttributeMention[],
  rankedGaps: AttributeGap[],
): string | undefined {
  const fromReview = mentions.find(mention => mention.negative > 0)?.attribute;
  if (fromReview) return fromReview;
  return rankedGaps[0]?.attribute;
}

function buildGenerationSummary(
  reviewSentiment: ReviewSentiment,
  rankedGaps: AttributeGap[],
  questions: FollowUpQuestion[],
  selectedAttribute?: string,
): string {
  const rankedSummary = rankedGaps
    .slice(0, 5)
    .map(gap => `${gap.attribute}:${gap.final_score.toFixed(1)}(${gap.source})`)
    .join(', ');

  return [
    'generation_mode=deterministic',
    `review_sentiment=${reviewSentiment}`,
    `question_count=${questions.length}`,
    `selected_attribute=${selectedAttribute ?? 'none'}`,
    `ranked_gaps=${rankedSummary || 'none'}`,
  ].join('\n');
}

function mapSubmissionToReview(row: ReviewSubmissionRow): Review {
  return {
    eg_property_id: row.eg_property_id,
    acquisition_date: row.created_at,
    lob: 'user_submitted',
    rating: row.rating ? { overall: normaliseNumber(row.rating) ?? undefined } : null,
    review_title: null,
    review_text: row.ai_polished_text ?? row.raw_text,
    reviewer_name: null,
    reviewer_tags: [],
  };
}

export interface EngineInput {
  review_id: string;
  property_id: string;
  user_id: string;
}

export async function runFollowUpEngine(input: EngineInput): Promise<FollowUpEngineResponse> {
  const { review_id, property_id, user_id } = input;
  const supabase = createServerClient();
  const today = new Date();

  const [
    { data: hotelData, error: hotelError },
    { data: historicReviewsData },
    { data: submissionReviewsData },
    { data: personaData },
    { data: currentReviewData, error: currentReviewError },
  ] = await Promise.all([
    supabase
      .from('Description_PROC')
      .select('*')
      .eq('eg_property_id', property_id)
      .single(),
    supabase
      .from('Reviews_PROC')
      .select('eg_property_id, acquisition_date, review_title, review_text, rating, lob')
      .eq('eg_property_id', property_id)
      .order('acquisition_date', { ascending: false })
      .limit(500),
    supabase
      .from('Review_Submissions')
      .select('id, eg_property_id, user_id, rating, raw_text, ai_polished_text, sentiment_score, created_at')
      .eq('eg_property_id', property_id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('User_Personas')
      .select('tags')
      .eq('user_id', user_id)
      .maybeSingle(),
    supabase
      .from('Review_Submissions')
      .select('id, eg_property_id, user_id, rating, raw_text, ai_polished_text, sentiment_score, created_at')
      .eq('id', review_id)
      .maybeSingle(),
  ]);

  if (hotelError || !hotelData) {
    throw new Error(`Property "${property_id}" not found in Description_PROC`);
  }

  if (currentReviewError || !currentReviewData) {
    throw new Error(`Review "${review_id}" not found in Review_Submissions`);
  }

  const hotel = hotelData as Hotel;
  const currentReview = currentReviewData as ReviewSubmissionRow;
  const userTags = ((personaData as UserPersona | null)?.tags ?? []);
  const historicReviews = (historicReviewsData ?? []) as Review[];
  const submissionReviews = ((submissionReviewsData ?? []) as ReviewSubmissionRow[]).map(mapSubmissionToReview);
  const mergedReviews = [...submissionReviews, ...historicReviews];

  const decayGaps = runDecayLayer(mergedReviews, today);
  const blindSpotGaps = runBlindSpotLayer(hotel, mergedReviews);
  const rankedGaps = rankByRisk(applyPersonaBoost([...decayGaps, ...blindSpotGaps], userTags));

  if (rankedGaps.length === 0) {
    return {
      review_id,
      property_id,
      questions: [],
      llm_prompt: 'generation_mode=deterministic\nranked_gaps=none',
    };
  }

  const reviewSentiment = detectReviewSentiment(currentReview);
  const reviewText = buildReviewText(currentReview);
  const mentions = detectAttributeMentions(reviewText);

  let questions: FollowUpQuestion[] = [];
  let selectedAttribute: string | undefined;

  if (reviewSentiment === 'positive') {
    const selectedGap = selectPositiveGap(rankedGaps, mentions);
    if (selectedGap) {
      selectedAttribute = selectedGap.attribute;
      questions = [buildPrimaryQuestion(selectedGap.attribute, userTags, 'verification', selectedGap)];
    }
  } else {
    const primaryAttribute = selectPrimaryNegativeAttribute(mentions, rankedGaps);
    if (primaryAttribute) {
      selectedAttribute = primaryAttribute;
      const matchingGap = rankedGaps.find(gap => gap.attribute === primaryAttribute);
      questions = [
        buildPrimaryQuestion(primaryAttribute, userTags, 'problem', matchingGap),
        buildReasonQuestion(primaryAttribute, reviewText, userTags),
      ];
    }
  }

  return {
    review_id,
    property_id,
    questions,
    llm_prompt: buildGenerationSummary(reviewSentiment, rankedGaps, questions, selectedAttribute),
  };
}
