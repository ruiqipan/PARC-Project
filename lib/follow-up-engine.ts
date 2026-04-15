/**
 * 4-Layer Follow-Up Question Recommendation Engine
 *
 * Layer 1 — Property Memory Decay (persistent, exponential curve)
 *   Each (property, attribute) pair has a stored freshness record in
 *   Property_Attribute_Freshness. Freshness decays as:
 *     f(t) = e^(-t · ln2 / half_life)
 *   where half_life varies by attribute (cleanliness: 7d, transit: 365d, …).
 *   "Staleness" = 1 − freshness: drives how urgently we want to refresh this attribute.
 *
 * Layer 2 — Description ↔ Review Blind Spot
 *   Amenities the hotel advertises but no reviewer has mentioned → blind spot bonus.
 *
 * Layer 3 — Persona-Aware Boost
 *   Attributes that match the reviewer's persona tags get a priority multiplier.
 *
 * Layer 4 — Decision-Risk Weighting
 *   Final priority = risk_weight × staleness × persona_multiplier.
 *   Attributes that strongly affect booking decisions (safety, accessibility, check_in)
 *   have higher risk weights and thus outrank low-stakes attributes even at equal staleness.
 *
 * On each run the engine also:
 *   • Writes updated freshness records (last_mentioned_at) for attributes the new
 *     review mentions — so the next run starts from persisted state.
 *   • Falls back to scanning mergedReviews when the DB table is empty (first run),
 *     then populates the table from that scan.
 *
 * Question strategy (deterministic):
 *   Positive review  → 1 verification question about the highest-priority gap
 *   Non-positive     → 2 questions: (a) confirm severity, (b) isolate root cause
 */

import { createServerClient } from '@/lib/supabase';
import { AMENITY_LABELS, parseArrayField, stripHtml } from '@/lib/utils';
import type {
  AgreementQuestion,
  FollowUpAnswer,
  FollowUpEngineResponse,
  FollowUpQuestion,
  Hotel,
  NlpHint,
  Review,
  UserPersona,
} from '@/types';

// ─── Internal types ───────────────────────────────────────────────────────────

interface AttributeGap {
  attribute: string;
  raw_score: number;
  final_score: number;
  source: 'decay' | 'blind_spot' | 'both';
  decay_days?: number;
  freshness_score?: number;   // 0–1; low = stale
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

interface FreshnessRecord {
  attribute: string;
  last_mentioned_at: string | null;
  last_confirmed_at: string | null;
  mention_count: number;
}

type ReviewSentiment = 'positive' | 'non_positive';

interface AttributeMention {
  attribute: string;
  mentions: number;
  positive: number;
  negative: number;
}
interface QuestionContext {
  evidence_text: string | null;
  reason: string;
}

interface ReviewEvidence {
  mention_count: number;
  positive_count: number;
  negative_count: number;
  representative_quote: string | null;
}

// ─── Attribute metadata ───────────────────────────────────────────────────────

const ATTRIBUTE_KEYWORDS: Record<string, string[]> = {
  parking:           ['parking', 'garage', 'valet', 'car park', 'parked', 'lot'],
  breakfast:         ['breakfast', 'morning meal', 'buffet', 'continental', 'brunch'],
  wifi:              ['wifi', 'wi-fi', 'internet', 'wireless', 'connection speed', 'bandwidth', 'signal'],
  pet_policy:        ['dog', 'pet', 'animal', 'cat', 'puppy', 'leash', 'pet-friendly', 'pet friendly'],
  check_in:          ['check-in', 'check in', 'check out', 'checkout', 'arrival', 'late arrival', 'front desk', 'reception'],
  safety:            ['safe', 'safety', 'security', 'secure', 'lock', 'keycard', 'emergency'],
  pool:              ['pool', 'swimming', 'swim', 'hot tub', 'jacuzzi', 'heated pool'],
  gym:               ['gym', 'fitness', 'workout', 'exercise', 'treadmill', 'weights'],
  noise:             ['quiet', 'noise', 'noisy', 'loud', 'soundproof', 'silent', 'disturb'],
  cleanliness:       ['clean', 'dirty', 'hygiene', 'spotless', 'stain', 'dusty', 'smell', 'odor', 'odour', 'mold', 'mildew'],
  transit:           ['subway', 'metro', 'bus', 'train', 'station', 'transit', 'walk to', 'walkable'],
  accessibility:     ['wheelchair', 'accessible', 'elevator', 'disabled', 'ramp', 'mobility', 'ada', 'step-free'],
  air_conditioning:  ['ac', 'air conditioning', 'air-conditioning', 'hvac', 'cooling', 'thermostat'],
  construction:      ['construction', 'renovation', 'drilling', 'building work', 'scaffolding'],
  breakfast_quality: ['eggs', 'pastry', 'coffee quality', 'breakfast selection', 'buffet variety'],
};

/**
 * Half-life for each attribute's exponential decay curve (days).
 * At t = half_life → freshness = 0.5
 * At t = 0         → freshness = 1.0 (fully fresh)
 * As t → ∞        → freshness → 0.0 (fully stale)
 */
const DECAY_HALF_LIFE_DAYS: Record<string, number> = {
  cleanliness:       7,
  construction:      7,
  breakfast:         14,
  breakfast_quality: 14,
  parking:           30,
  wifi:              30,
  pool:              45,
  check_in:          60,
  gym:               60,
  noise:             60,
  air_conditioning:  90,
  pet_policy:        90,
  safety:            90,
  accessibility:     180,
  transit:           365,
};

const AMENITY_TO_ATTRIBUTE: Record<string, string> = {
  free_parking:       'parking',
  breakfast_available:'breakfast',
  breakfast_included: 'breakfast',
  internet:           'wifi',
  pool:               'pool',
  kids_pool:          'pool',
  fitness_equipment:  'gym',
  soundproof_room:    'noise',
  no_smoking:         'safety',
  frontdesk_24_hour:  'check_in',
  hot_tub:            'pool',
  spa:                'gym',
  ac:                 'air_conditioning',
};

const PERSONA_ATTRIBUTES: Record<string, string[]> = {
  'Business traveler':              ['wifi', 'check_in', 'parking', 'noise'],
  'Convention attendee':            ['wifi', 'check_in', 'parking', 'noise'],
  'Digital nomad':                  ['wifi', 'check_in', 'parking', 'noise'],
  'Remote worker':                  ['wifi', 'check_in', 'parking', 'noise'],
  'Fast WiFi':                      ['wifi', 'check_in', 'parking', 'noise'],
  'Long-stay traveler':             ['wifi', 'cleanliness', 'air_conditioning', 'check_in'],
  Backpacker:                       ['parking', 'breakfast', 'wifi'],
  'Budget traveler':                ['parking', 'breakfast', 'wifi'],
  'Luxury traveler':                ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Wellness traveler':              ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Pool access':                    ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Gym access':                     ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Spa & relaxation':               ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Couple traveler':                ['noise', 'cleanliness', 'breakfast_quality'],
  'Family traveler':                ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Group traveler':                 ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Traveling with baby/toddler':    ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Traveling with kids':            ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Traveling with teens':           ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Caregiver traveler':             ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Senior traveler':                ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  Families:                         ['pool', 'breakfast', 'safety', 'noise', 'check_in'],
  'Pet owner':                      ['pet_policy'],
  'Guide dog owner':                ['pet_policy', 'accessibility'],
  'Wheelchair user':                ['accessibility', 'check_in', 'safety'],
  'Mobility aid user':              ['accessibility', 'check_in', 'safety'],
  'Visual impairment':              ['accessibility', 'check_in', 'safety'],
  'Hearing impairment':             ['accessibility', 'check_in', 'safety'],
  'Step-free access needed':        ['accessibility', 'check_in', 'safety'],
  'Elevator access needed':         ['accessibility', 'check_in', 'safety'],
  'Accessible bathroom needed':     ['accessibility', 'check_in', 'safety'],
  Neurodivergent:                   ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Sensory-sensitive':              ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Light sleeper':                  ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  Quiet:                            ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Strong AC':                      ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Air quality sensitive':          ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Fragrance-sensitive':            ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Safety-conscious':               ['safety', 'check_in'],
  'Cleanliness-focused':            ['cleanliness', 'safety'],
  'Chronic illness':                ['cleanliness', 'safety'],
  Tourist:                          ['transit', 'noise', 'breakfast'],
  'Weekend getaway':                ['transit', 'noise', 'breakfast'],
  'Event traveler':                 ['transit', 'noise', 'breakfast'],
  'Adventure traveler':             ['transit', 'noise', 'breakfast'],
  'Culture enthusiast':             ['transit', 'noise', 'breakfast'],
  'Road tripper':                   ['parking', 'check_in'],
  'Parking needed':                 ['parking', 'check_in'],
  'Transit-first':                  ['transit', 'noise'],
  'Walkable area':                  ['transit', 'noise'],
  'Breakfast-first':                ['breakfast', 'breakfast_quality'],
  Foodie:                           ['breakfast', 'breakfast_quality'],
  'Dietary restrictions':           ['breakfast', 'breakfast_quality'],
  'Spacious room':                  ['cleanliness', 'air_conditioning'],
  'Solo traveler':                  ['safety', 'noise', 'check_in'],
  'Eco-conscious':                  ['transit'],
};

/**
 * Decision-risk weight per attribute (1–10).
 * Higher = more likely to affect booking decisions or cause unpleasant surprises.
 * Used as a multiplier on staleness to produce the final priority score.
 */
const RISK_WEIGHTS: Record<string, number> = {
  safety:            10,
  accessibility:     10,
  check_in:           9,
  pet_policy:         8,
  cleanliness:        8,
  wifi:               7,
  parking:            7,
  construction:       7,
  noise:              6,
  breakfast:          5,
  pool:               4,
  transit:            4,
  air_conditioning:   3,
  gym:                3,
  breakfast_quality:  2,
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  parking:           'parking',
  breakfast:         'breakfast',
  wifi:              'WiFi',
  pet_policy:        'pet-friendliness',
  check_in:          'check-in',
  safety:            'safety',
  pool:              'pool',
  gym:               'gym',
  noise:             'noise level',
  cleanliness:       'cleanliness',
  transit:           'location convenience',
  accessibility:     'accessibility',
  air_conditioning:  'air conditioning',
  construction:      'construction disruption',
  breakfast_quality: 'breakfast quality',
};

const ATTRIBUTE_STAT_PHRASES: Record<string, { positive: string; negative: string }> = {
  wifi: { positive: 'described it as reliable', negative: 'described it as unreliable' },
  noise: { positive: 'said the room stayed quiet', negative: 'said noise was disruptive' },
  cleanliness: { positive: 'said the room felt clean', negative: 'said cleanliness was an issue' },
  parking: { positive: 'said parking felt straightforward', negative: 'said parking created friction' },
  breakfast: { positive: 'said breakfast felt dependable', negative: 'said breakfast fell short' },
  breakfast_quality: { positive: 'said breakfast quality felt strong', negative: 'said breakfast quality fell short' },
  check_in: { positive: 'said check-in felt smooth', negative: 'said check-in felt difficult' },
  pet_policy: { positive: 'said the hotel felt pet-friendly', negative: 'said the pet experience felt restrictive' },
  accessibility: { positive: 'said accessibility worked well in practice', negative: 'said accessibility gaps created friction' },
  air_conditioning: { positive: 'said temperature control felt easy', negative: 'said temperature control was hard to manage' },
  safety: { positive: 'said the property felt secure', negative: 'said the property felt less secure than expected' },
  pool: { positive: 'said the pool was worth using', negative: 'said the pool experience disappointed' },
  gym: { positive: 'said the gym felt usable', negative: 'said the gym felt underwhelming' },
  transit: { positive: 'said getting around felt convenient', negative: 'said getting around took more effort than expected' },
  construction: { positive: 'said construction was barely noticeable', negative: 'said construction was disruptive' },
};

const REVIEW_STAT_MIN_MENTIONS = 5;
const REVIEW_STAT_MIN_CONSENSUS = 0.75;

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
      { keywords: ['none', 'quiet', 'fine', "didn't notice"], direction: 'left' },
      { keywords: ['construction', 'drilling', 'renovation', 'hammering', 'scaffolding'], direction: 'right' },
    ],
  },
};

const REASON_PROMPTS: Record<string, (text: string, userTags: string[], context: QuestionContext) => AgreementQuestion> = {
  noise: (text, userTags, context) =>
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
      context,
    ),
  wifi: (text, _userTags, context) =>
    buildAgreementQuestion(
      'wifi_reason',
      pickReasonStatement(text, [
        { keywords: ['slow', 'speed', 'buffer', 'lag'], statement: 'Slow speed was the main reason the WiFi felt unreliable.' },
        { keywords: ['drop', 'disconnect', 'signal', 'weak'], statement: 'Dropouts or weak in-room signal were the main WiFi problem.' },
      ], 'Reliability was the bigger WiFi issue than the login or setup process.'),
      context,
    ),
  parking: (text, _userTags, context) =>
    buildAgreementQuestion(
      'parking_reason',
      pickReasonStatement(text, [
        { keywords: ['fee', 'charge', 'cost', 'pay'], statement: 'Unexpected fees were the most frustrating part of parking.' },
        { keywords: ['entrance', 'find', 'garage', 'signage'], statement: 'Finding the parking entrance or instructions was the biggest parking challenge.' },
        { keywords: ['full', 'space', 'spot', 'availability'], statement: 'Parking availability was the main issue, more than the process itself.' },
      ], 'The parking process created more friction than confidence.'),
      context,
    ),
  breakfast: (text, _userTags, context) =>
    buildAgreementQuestion(
      'breakfast_reason',
      pickReasonStatement(text, [
        { keywords: ['cold', 'stale', 'taste', 'quality'], statement: 'Food quality was the main breakfast issue.' },
        { keywords: ['crowded', 'line', 'wait'], statement: 'Crowding or long waits were the main breakfast issue.' },
        { keywords: ['late', 'hours', 'timing', 'ended'], statement: 'Timing or availability was the main breakfast issue.' },
      ], 'Breakfast felt less dependable in practice than it sounded on paper.'),
      context,
    ),
  check_in: (text, _userTags, context) =>
    buildAgreementQuestion(
      'check_in_reason',
      pickReasonStatement(text, [
        { keywords: ['late', 'night', 'after midnight'], statement: 'Late-arrival handling was the main check-in problem.' },
        { keywords: ['line', 'wait', 'staff', 'desk'], statement: 'Front-desk response time was the main check-in problem.' },
        { keywords: ['instructions', 'confusing', 'unclear'], statement: 'Unclear instructions made check-in harder than it should have been.' },
      ], 'The check-in problem felt structural, not just bad luck with timing.'),
      context,
    ),
  cleanliness: (text, _userTags, context) =>
    buildAgreementQuestion(
      'cleanliness_reason',
      pickReasonStatement(text, [
        { keywords: ['bathroom', 'toilet', 'shower', 'sink'], statement: 'Bathroom cleanliness drove most of the problem.' },
        { keywords: ['sheet', 'bed', 'linen', 'pillow'], statement: 'Bedding or linen cleanliness drove most of the problem.' },
        { keywords: ['smell', 'odor', 'odour', 'musty', 'mold'], statement: 'Smell or stale air was a major part of the cleanliness issue.' },
      ], 'The issue felt like an ongoing cleanliness problem, not a tiny one-off detail.'),
      context,
    ),
  pet_policy: (text, _userTags, context) =>
    buildAgreementQuestion(
      'pet_policy_reason',
      pickReasonStatement(text, [
        { keywords: ['fee', 'charge', 'cost'], statement: 'Extra fees made the pet experience feel less friendly.' },
        { keywords: ['restrict', 'rule', 'policy'], statement: 'Policy restrictions mattered more than staff attitude.' },
      ], 'The pet experience felt more restricted than welcoming.'),
      context,
    ),
  accessibility: (text, _userTags, context) =>
    buildAgreementQuestion(
      'accessibility_reason',
      pickReasonStatement(text, [
        { keywords: ['elevator', 'lift'], statement: 'Elevator access was the main accessibility friction point.' },
        { keywords: ['step', 'stairs', 'ramp'], statement: 'Steps or missing ramps were the main accessibility issue.' },
        { keywords: ['bathroom', 'shower'], statement: 'Bathroom usability was the biggest accessibility issue.' },
      ], 'The accessibility problem affected actual usability, not just convenience.'),
      context,
    ),
  air_conditioning: (text, _userTags, context) =>
    buildAgreementQuestion(
      'air_conditioning_reason',
      pickReasonStatement(text, [
        { keywords: ['hot', 'warm', 'cooling'], statement: 'The room never reached a comfortable temperature.' },
        { keywords: ['loud', 'noise', 'rattle'], statement: 'AC noise was as big a problem as the temperature itself.' },
        { keywords: ['control', 'thermostat'], statement: 'The thermostat or controls made the AC hard to manage.' },
      ], 'The AC issue felt persistent, not just a brief fluctuation.'),
      context,
    ),
};

// ─── Pure helper functions ────────────────────────────────────────────────────

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
    .map(s => s.trim())
    .filter(Boolean);
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

function latestDate(a: string | null, b: string | null): Date | null {
  const da = a ? new Date(a) : null;
  const db = b ? new Date(b) : null;
  if (!da && !db) return null;
  if (!da) return db;
  if (!db) return da;
  return da > db ? da : db;
}

function splitDisplaySentences(text: string): string[] {
  return stripHtml(text)
    .match(/[^.!?\n]+[.!?]?/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) ?? [];
}

function summariseDuration(days: number): string {
  if (days >= 84) {
    const months = Math.max(1, Math.round(days / 30));
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  if (days >= 14) {
    const weeks = Math.max(2, Math.round(days / 7));
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }

  return `${days} day${days === 1 ? '' : 's'}`;
}

function getAttributeLabel(attribute: string): string {
  return ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ');
}

function inferSentenceSentiment(sentence: string): 'positive' | 'negative' | 'neutral' {
  const lower = sentence.toLowerCase();
  const positiveHits = POSITIVE_CUES.reduce((count, cue) => count + (lower.includes(cue) ? 1 : 0), 0);
  const negativeHits = NEGATIVE_CUES.reduce((count, cue) => count + (lower.includes(cue) ? 1 : 0), 0);

  if (positiveHits > negativeHits && positiveHits > 0) return 'positive';
  if (negativeHits > positiveHits && negativeHits > 0) return 'negative';
  return 'neutral';
}

function sanitiseQuote(sentence: string): string | null {
  const cleaned = stripHtml(sentence)
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.length > 140 ? `${cleaned.slice(0, 137).trimEnd()}...` : cleaned;
}

function collectReviewEvidence(reviews: Review[], attribute: string): ReviewEvidence {
  const keywords = ATTRIBUTE_KEYWORDS[attribute] ?? [];
  if (keywords.length === 0) {
    return {
      mention_count: 0,
      positive_count: 0,
      negative_count: 0,
      representative_quote: null,
    };
  }

  let mention_count = 0;
  let positive_count = 0;
  let negative_count = 0;
  let representative_quote: string | null = null;

  for (const review of reviews) {
    const reviewText = [review.review_title, review.review_text].filter(Boolean).join('. ').trim();
    if (!reviewText) continue;

    const matchingSentences = splitDisplaySentences(reviewText).filter(sentence =>
      containsAny(sentence.toLowerCase(), keywords),
    );

    if (matchingSentences.length === 0) continue;

    mention_count += 1;

    let reviewPositive = 0;
    let reviewNegative = 0;
    for (const sentence of matchingSentences) {
      const sentiment = inferSentenceSentiment(sentence);
      if (sentiment === 'positive') reviewPositive += 1;
      if (sentiment === 'negative') reviewNegative += 1;
    }

    if (reviewPositive > reviewNegative) positive_count += 1;
    else if (reviewNegative > reviewPositive) negative_count += 1;

    if (!representative_quote) {
      representative_quote = sanitiseQuote(matchingSentences[0]);
    }
  }

  return { mention_count, positive_count, negative_count, representative_quote };
}

function buildReviewStatEvidence(attribute: string, evidence: ReviewEvidence): string | null {
  const dominantCount = Math.max(evidence.positive_count, evidence.negative_count);
  if (
    evidence.mention_count < REVIEW_STAT_MIN_MENTIONS ||
    dominantCount < REVIEW_STAT_MIN_MENTIONS ||
    dominantCount / evidence.mention_count < REVIEW_STAT_MIN_CONSENSUS
  ) {
    return null;
  }

  const sentiment = evidence.positive_count >= evidence.negative_count ? 'positive' : 'negative';
  const percentage = Math.round((dominantCount / evidence.mention_count) * 100);
  const phrase = ATTRIBUTE_STAT_PHRASES[attribute]?.[sentiment]
    ?? `described ${getAttributeLabel(attribute)} ${sentiment === 'positive' ? 'positively' : 'negatively'}`;

  return `${percentage}% of ${evidence.mention_count} reviews that mentioned ${getAttributeLabel(attribute)} ${phrase}.`;
}

function buildReviewQuoteEvidence(evidence: ReviewEvidence): string | null {
  return evidence.representative_quote ? `Other users found that "${evidence.representative_quote}"` : null;
}

function buildHotelClaimEvidence(hotel: Hotel, attribute: string, gap?: AttributeGap): string | null {
  const keywords = ATTRIBUTE_KEYWORDS[attribute] ?? [];
  const descriptionCorpus = [hotel.property_description, hotel.area_description].filter(Boolean).join(' ');

  if (descriptionCorpus) {
    const matchingSentence = splitDisplaySentences(descriptionCorpus).find(sentence =>
      containsAny(sentence.toLowerCase(), keywords),
    );

    if (matchingSentence) {
      const quote = sanitiseQuote(matchingSentence);
      if (quote) return `The hotel states that "${quote}"`;
    }
  }

  if (gap?.amenity_claimed) {
    const amenityLabel = AMENITY_LABELS[gap.amenity_claimed.toLowerCase()] ?? gap.amenity_claimed.replace(/_/g, ' ');
    return `The hotel lists ${amenityLabel} as an amenity.`;
  }

  if (attribute === 'pet_policy' && hotel.pet_policy) {
    return 'The hotel lists pet-related policies for guests traveling with animals.';
  }

  if (attribute === 'check_in' && hotel.check_in_end_time) {
    return `The hotel lists a check-in window ending at ${hotel.check_in_end_time}.`;
  }

  return null;
}

function buildFallbackEvidence(attribute: string, gap?: AttributeGap): string {
  if (gap?.decay_days) {
    return `${getAttributeLabel(attribute)} has barely been mentioned in reviews for ${summariseDuration(gap.decay_days)}.`;
  }

  if (gap?.source !== 'decay') {
    return `Recent reviews still leave a thin signal around ${getAttributeLabel(attribute)}.`;
  }

  return `Recent reviews have only a light signal around ${getAttributeLabel(attribute)}.`;
}

function buildEvidenceText(hotel: Hotel, reviews: Review[], attribute: string, gap?: AttributeGap): string {
  const reviewEvidence = collectReviewEvidence(reviews, attribute);
  return (
    buildReviewStatEvidence(attribute, reviewEvidence)
    ?? buildReviewQuoteEvidence(reviewEvidence)
    ?? buildHotelClaimEvidence(hotel, attribute, gap)
    ?? buildFallbackEvidence(attribute, gap)
  );
}

function attributeMattersToUser(attribute: string, userTags: string[]): boolean {
  return userTags.some(tag => (PERSONA_ATTRIBUTES[tag.trim()] ?? []).includes(attribute));
}

function buildQuestionReason(
  attribute: string,
  gap: AttributeGap | undefined,
  userTags: string[],
  variant: 'main' | 'narrowing' = 'main',
): string {
  if (variant === 'narrowing') {
    return `You surfaced possible ${getAttributeLabel(attribute)} friction, so this follow-up narrows down what future guests should know.`;
  }

  if (gap?.source === 'both' && gap.decay_days && gap.amenity_claimed) {
    return `The hotel advertises ${getAttributeLabel(attribute)}, but reviews have not refreshed that signal in ${summariseDuration(gap.decay_days)}.`;
  }

  if (gap?.source === 'decay' && gap.decay_days) {
    return `${getAttributeLabel(attribute)} has not been mentioned in reviews for ${summariseDuration(gap.decay_days)} — your input helps refresh this signal.`;
  }

  if (gap?.source !== 'decay' && gap?.amenity_claimed) {
    return `The hotel advertises ${getAttributeLabel(attribute)}, but recent reviews do not confirm how it holds up in practice.`;
  }

  if (attributeMattersToUser(attribute, userTags)) {
    return 'This is a high-impact detail for your travel preferences, so a fresh signal helps future guests like you.';
  }

  return 'This detail still has a thin review signal, so your input helps future guests make a better call.';
}

// ─── Layer 1: Exponential decay + priority scoring ────────────────────────────

/**
 * Freshness score ∈ [0, 1].
 *   f(t) = e^(−t · ln2 / half_life)
 * At t=0        → 1.0 (just mentioned, no need to ask)
 * At t=half_life → 0.5
 * At t→∞        → 0.0 (never mentioned or infinitely old)
 */
function computeFreshness(lastActiveAt: Date | null, attribute: string, today: Date): number {
  if (!lastActiveAt) return 0;
  const halfLife = DECAY_HALF_LIFE_DAYS[attribute] ?? 30;
  const daysSince = (today.getTime() - lastActiveAt.getTime()) / 86_400_000;
  if (daysSince <= 0) return 1;
  return Math.exp(-(daysSince * Math.LN2) / halfLife);
}

/**
 * Priority score = risk_weight × staleness × persona_multiplier
 * staleness = 1 − freshness  (0 = fresh, 1 = fully stale)
 * persona_multiplier ≥ 1.0 (boosted when attribute matches reviewer's tags)
 */
function computePriorityScore(attribute: string, freshness: number, userTags: string[]): number {
  const riskWeight = RISK_WEIGHTS[attribute] ?? 1;
  const staleness = 1 - freshness;
  const personaMultiplier = userTags.reduce((acc, tag) => {
    return acc + (PERSONA_ATTRIBUTES[tag]?.includes(attribute) ? 0.3 : 0);
  }, 1.0);
  return riskWeight * staleness * personaMultiplier;
}

// ─── Freshness DB helpers ─────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createServerClient>;

/**
 * Load freshness records from DB.
 * If the table is empty for this property, run a one-time backfill from
 * the merged review history, write the results to DB, and return them.
 */
async function loadOrBackfillFreshness(
  supabase: SupabaseClient,
  property_id: string,
  mergedReviews: Review[],
  today: Date,
): Promise<Map<string, FreshnessRecord>> {
  const { data } = await supabase
    .from('property_attribute_freshness')
    .select('attribute, last_mentioned_at, last_confirmed_at, mention_count')
    .eq('eg_property_id', property_id);

  if (data && data.length > 0) {
    return new Map((data as FreshnessRecord[]).map(r => [r.attribute, r]));
  }

  // First run: scan review corpus and populate the table.
  return backfillFreshnessFromReviews(supabase, property_id, mergedReviews, today);
}

/**
 * Scan all reviews for this property, find the most recent mention date per
 * attribute, write rows to Property_Attribute_Freshness, and return the map.
 */
async function backfillFreshnessFromReviews(
  supabase: SupabaseClient,
  property_id: string,
  reviews: Review[],
  today: Date,
): Promise<Map<string, FreshnessRecord>> {
  const lastSeen = new Map<string, Date>();
  const mentionCounts = new Map<string, number>();

  for (const review of reviews) {
    const text = `${review.review_title ?? ''} ${review.review_text ?? ''}`.toLowerCase();
    const reviewDate = review.acquisition_date ? new Date(review.acquisition_date) : today;

    for (const [attribute, keywords] of Object.entries(ATTRIBUTE_KEYWORDS)) {
      if (!containsAny(text, keywords)) continue;
      mentionCounts.set(attribute, (mentionCounts.get(attribute) ?? 0) + 1);
      const existing = lastSeen.get(attribute);
      if (!existing || reviewDate > existing) {
        lastSeen.set(attribute, reviewDate);
      }
    }
  }

  const rows = Object.keys(ATTRIBUTE_KEYWORDS).map(attribute => ({
    eg_property_id: property_id,
    attribute,
    last_mentioned_at: lastSeen.get(attribute)?.toISOString() ?? null,
    last_confirmed_at: null,
    mention_count: mentionCounts.get(attribute) ?? 0,
    updated_at: today.toISOString(),
  }));

  // Best-effort write; ignore errors so the engine still returns questions.
  await supabase
    .from('property_attribute_freshness')
    .upsert(rows, { onConflict: 'eg_property_id,attribute' })
    .then(({ error }) => {
      if (error) console.warn('[follow-up] backfill write failed:', error.message);
    });

  const map = new Map<string, FreshnessRecord>();
  for (const row of rows) {
    map.set(row.attribute, {
      attribute: row.attribute,
      last_mentioned_at: row.last_mentioned_at,
      last_confirmed_at: null,
      mention_count: row.mention_count,
    });
  }
  return map;
}

/**
 * Detect which attributes the given review text mentions, then upsert
 * last_mentioned_at for each in Property_Attribute_Freshness.
 *
 * Called inside runFollowUpEngine after the new review is fetched.
 */
async function updateFreshnessFromReview(
  supabase: SupabaseClient,
  property_id: string,
  reviewText: string,
  reviewedAt: Date,
): Promise<string[]> {
  const lower = reviewText.toLowerCase();
  const mentioned: string[] = [];

  for (const [attribute, keywords] of Object.entries(ATTRIBUTE_KEYWORDS)) {
    if (containsAny(lower, keywords)) mentioned.push(attribute);
  }

  if (mentioned.length === 0) return mentioned;

  // Upsert last_mentioned_at; increment mention_count via two-step for safety.
  const upsertRows = mentioned.map(attribute => ({
    eg_property_id: property_id,
    attribute,
    last_mentioned_at: reviewedAt.toISOString(),
    updated_at: reviewedAt.toISOString(),
    mention_count: 1,  // will be overwritten below if row exists
  }));

  await supabase
    .from('property_attribute_freshness')
    .upsert(upsertRows, { onConflict: 'eg_property_id,attribute' })
    .then(({ error }) => {
      if (error) console.warn('[follow-up] freshness update failed:', error.message);
    });

  // Increment mention_count separately (UPSERT can't express += 1).
  for (const attribute of mentioned) {
    await supabase.rpc('increment_paf_mention_count', {
      p_property_id: property_id,
      p_attribute: attribute,
    }).then(({ error }) => {
      // RPC may not exist yet — silently ignore; mention_count is non-critical.
      if (error && !error.message.includes('does not exist')) {
        console.warn('[follow-up] mention_count increment failed:', error.message);
      }
    });
  }

  return mentioned;
}

/**
 * Normalise a follow-up answer's quantitative value to a 0.0–5.0 quality score.
 *
 * Slider  → quantitative_value ∈ [0,1]; multiply by 5 → 0.0–5.0
 *           (left pole = worst, right pole = best)
 * Agreement → quantitative_value ∈ [1,5]; linear scale → 0.0–5.0
 *           ((v-1)/4 × 5)
 * QuickTag → no numeric meaning; returns null (excluded from scoring)
 */
function normaliseAnswerToScore(answer: FollowUpAnswer): number | null {
  if (answer.quantitative_value === null) return null;
  if (answer.ui_type === 'Slider') {
    return Math.round(answer.quantitative_value * 50) / 10;
  }
  if (answer.ui_type === 'Agreement') {
    return Math.round(((answer.quantitative_value - 1) / 4) * 50) / 10;
  }
  // QuickTag has no numeric value
  return null;
}

/**
 * Exported: called by the answers route after saving FollowUp_Answers rows.
 * Updates last_confirmed_at AND computes an EMA quality score (avg_score 0–5)
 * for each answered attribute.
 *
 * EMA formula: new_avg = old_avg × 0.6 + new_score × 0.4
 * This weights recent answers at 40% so a single outlier doesn't dominate.
 * QuickTag answers update freshness timestamps but do not affect avg_score.
 */
export async function updateFreshnessFromAnswer(
  supabase: SupabaseClient,
  property_id: string,
  answers: FollowUpAnswer[],
  confirmedAt: Date,
): Promise<void> {
  if (answers.length === 0) return;

  // 1. Fetch current avg_score + score_count for the affected attributes.
  const attributes = answers.map(a => a.feature_name);
  const { data: existing } = await supabase
    .from('property_attribute_freshness')
    .select('attribute, avg_score, score_count')
    .eq('eg_property_id', property_id)
    .in('attribute', attributes);

  const existingMap = new Map(
    ((existing ?? []) as { attribute: string; avg_score: number | null; score_count: number }[])
      .map(r => [r.attribute, r]),
  );

  // 2. Compute new EMA score per answer and build upsert rows.
  const rows = answers.map(answer => {
    const newScore = normaliseAnswerToScore(answer);
    const prev = existingMap.get(answer.feature_name);
    const oldAvg = prev?.avg_score ?? null;
    const oldCount = prev?.score_count ?? 0;

    const newAvg =
      newScore === null
        ? oldAvg                                                        // QuickTag: no change
        : oldAvg === null
          ? newScore                                                     // first score ever
          : Math.round((oldAvg * 0.6 + newScore * 0.4) * 10) / 10;    // EMA

    const newCount = newScore !== null ? oldCount + 1 : oldCount;

    return {
      eg_property_id:   property_id,
      attribute:        answer.feature_name,
      last_confirmed_at: confirmedAt.toISOString(),
      updated_at:       confirmedAt.toISOString(),
      avg_score:        newAvg,
      score_count:      newCount,
      mention_count:    0,
    };
  });

  await supabase
    .from('property_attribute_freshness')
    .upsert(rows, { onConflict: 'eg_property_id,attribute' })
    .then(({ error }) => {
      if (error) console.warn('[follow-up] answer freshness update failed:', error.message);
    });
}

// ─── Layer 2: Blind-spot detection ───────────────────────────────────────────

function runBlindSpotLayer(hotel: Hotel, reviews: Review[]): AttributeGap[] {
  const gaps: AttributeGap[] = [];
  const corpus = reviews
    .map(r => `${r.review_title ?? ''} ${r.review_text ?? ''}`)
    .join(' ')
    .toLowerCase();

  for (const amenity of parseArrayField(hotel.popular_amenities_list)) {
    const attribute = AMENITY_TO_ATTRIBUTE[amenity.toLowerCase()];
    if (!attribute) continue;
    const keywords = ATTRIBUTE_KEYWORDS[attribute] ?? [];
    if (!containsAny(corpus, keywords)) {
      gaps.push({
        attribute,
        raw_score: (RISK_WEIGHTS[attribute] ?? 1) * 0.5,
        final_score: 0,
        source: 'blind_spot',
        amenity_claimed: amenity,
      });
    }
  }

  if (hotel.pet_policy) {
    if (!containsAny(corpus, ATTRIBUTE_KEYWORDS.pet_policy ?? []) && !gaps.find(g => g.attribute === 'pet_policy')) {
      gaps.push({ attribute: 'pet_policy', raw_score: (RISK_WEIGHTS.pet_policy ?? 1) * 0.5, final_score: 0, source: 'blind_spot', amenity_claimed: 'pet_policy' });
    }
  }

  if (hotel.check_in_end_time) {
    if (!containsAny(corpus, ATTRIBUTE_KEYWORDS.check_in ?? []) && !gaps.find(g => g.attribute === 'check_in')) {
      gaps.push({ attribute: 'check_in', raw_score: (RISK_WEIGHTS.check_in ?? 1) * 0.5, final_score: 0, source: 'blind_spot', amenity_claimed: 'check_in_window' });
    }
  }

  return gaps;
}

// ─── Ranking (Layers 1–4 combined) ───────────────────────────────────────────

function buildRankedGaps(
  freshnessMap: Map<string, FreshnessRecord>,
  today: Date,
  userTags: string[],
  hotel: Hotel,
  mergedReviews: Review[],
): AttributeGap[] {
  const gapMap = new Map<string, AttributeGap>();

  // Layer 1 + 3 + 4: decay curve × persona boost × risk weight
  for (const attribute of Object.keys(DECAY_HALF_LIFE_DAYS)) {
    const record = freshnessMap.get(attribute);
    const lastActive = record ? latestDate(record.last_mentioned_at, record.last_confirmed_at) : null;

    const freshness = computeFreshness(lastActive, attribute, today);
    const priority = computePriorityScore(attribute, freshness, userTags);

    // Minimum threshold: freshness must be below 0.95 (at least slightly stale)
    if (freshness >= 0.95) continue;

    const daysSince = lastActive
      ? Math.floor((today.getTime() - lastActive.getTime()) / 86_400_000)
      : undefined;

    gapMap.set(attribute, {
      attribute,
      raw_score: priority,
      final_score: priority,
      source: 'decay',
      decay_days: daysSince,
      freshness_score: freshness,
    });
  }

  // Layer 2: blind spot bonus — merge or add
  for (const bs of runBlindSpotLayer(hotel, mergedReviews)) {
    const existing = gapMap.get(bs.attribute);
    if (existing) {
      existing.final_score += bs.raw_score;
      existing.source = 'both';
      existing.amenity_claimed = bs.amenity_claimed;
    } else {
      gapMap.set(bs.attribute, { ...bs, final_score: bs.raw_score });
    }
  }

  return Array.from(gapMap.values()).sort((a, b) => b.final_score - a.final_score);
}

// ─── Question generation ──────────────────────────────────────────────────────

function detectReviewSentiment(review: ReviewSubmissionRow): ReviewSentiment {
  const rating = normaliseNumber(review.rating);
  if (rating !== null) return rating >= 4 ? 'positive' : 'non_positive';

  const text = buildReviewText(review).toLowerCase();
  const pos = POSITIVE_SENTIMENT_WORDS.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  const neg = NEGATIVE_SENTIMENT_WORDS.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  return pos > neg && pos > 0 ? 'positive' : 'non_positive';
}

function detectAttributeMentions(text: string): AttributeMention[] {
  const sentences = splitSentences(text);
  return Object.entries(ATTRIBUTE_KEYWORDS)
    .map(([attribute, keywords]) => {
      const m = sentences.reduce<AttributeMention>(
        (acc, sentence) => {
          if (!containsAny(sentence, keywords)) return acc;
          return {
            attribute,
            mentions: acc.mentions + 1,
            negative: acc.negative + (containsAny(sentence, NEGATIVE_CUES) ? 1 : 0),
            positive: acc.positive + (containsAny(sentence, POSITIVE_CUES) ? 1 : 0),
          };
        },
        { attribute, mentions: 0, positive: 0, negative: 0 },
      );
      return m;
    })
    .filter(m => m.mentions > 0)
    .sort((a, b) => {
      const sa = a.negative * 3 + a.mentions + (RISK_WEIGHTS[a.attribute] ?? 0);
      const sb = b.negative * 3 + b.mentions + (RISK_WEIGHTS[b.attribute] ?? 0);
      return sb - sa;
    });
}

function buildAgreementQuestion(feature_name: string, statement: string, context: QuestionContext): AgreementQuestion {
  return {
    ui_type: 'Agreement',
    feature_name,
    evidence_text: context.evidence_text,
    reason: context.reason,
    statement,
    nlp_hints: [
      { keywords: ['yes', 'agree', 'accurate', 'true', 'exactly', 'definitely'], direction: 'right' },
      { keywords: ['no', 'disagree', 'not really', 'false', 'wrong', 'inaccurate'], direction: 'left' },
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

function buildProblemStatement(attribute: string, userTags: string[]): string {
  switch (attribute) {
    case 'wifi':
      return hasAnyTag(userTags, ['Business traveler', 'Digital nomad', 'Remote worker', 'Fast WiFi'])
        ? 'The WiFi felt too unstable to trust for work or video calls.'
        : 'The WiFi felt too unreliable to trust during the stay.';
    case 'parking': return 'The parking process created avoidable friction.';
    case 'breakfast':
    case 'breakfast_quality': return 'Breakfast felt less dependable than expected.';
    case 'check_in': return 'Check-in felt harder than it should have been.';
    case 'pet_policy': return 'The hotel felt less pet-friendly in practice than it sounded on paper.';
    case 'noise':
      return hasAnyTag(userTags, ['Quiet', 'Light sleeper'])
        ? 'The room was not quiet enough for restful sleep.'
        : 'Noise disrupted the stay more than it should have.';
    case 'cleanliness': return 'Cleanliness issues affected the stay in a meaningful way.';
    case 'accessibility': return 'Accessibility gaps created real friction during the stay.';
    case 'air_conditioning': return 'Temperature control was harder than it should have been.';
    case 'safety': return 'The property did not feel as secure as expected.';
    case 'construction': return 'Construction or renovation activity was meaningfully disruptive.';
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
  return candidates.find(c => containsAny(lower, c.keywords))?.statement ?? fallback;
}

/**
 * Persona × attribute → QuickTag override config.
 * When the reviewer's persona tag matches a key here, they receive a tailored
 * QuickTag question instead of the generic Slider or Agreement.
 *
 * Key format: `${personaTag}:${attribute}`
 */
const PERSONA_QUICKTAG_OVERRIDES: Record<string, { prompt: string; options: string[] }> = {
  // Quiet / sensory-sensitive users → precise noise source identification
  'Quiet:noise':             { prompt: 'What was the main noise source?', options: ['Street / traffic', 'Hallway / neighbors', 'AC or heating', 'Construction nearby', 'It was quiet'] },
  'Light sleeper:noise':     { prompt: 'What was the main noise source?', options: ['Street / traffic', 'Hallway / neighbors', 'AC or heating', 'Construction nearby', 'It was quiet'] },
  'Neurodivergent:noise':    { prompt: 'Which sensory issues affected your stay?', options: ['Noise', 'Harsh lighting', 'Strong smells', 'Crowded spaces', 'None — it was fine'] },
  'Sensory-sensitive:noise': { prompt: 'Which sensory issues affected your stay?', options: ['Noise', 'Harsh lighting', 'Strong smells', 'Crowded spaces', 'None — it was fine'] },

  // Family / kids → breakfast-specific options
  'Family traveler:breakfast':             { prompt: 'How was breakfast for the family?', options: ['Great variety for kids', 'Limited kid options', 'Crowded / long wait', 'Good healthy options', 'Not worth it'] },
  'Traveling with kids:breakfast':         { prompt: 'How was breakfast for the family?', options: ['Great variety for kids', 'Limited kid options', 'Crowded / long wait', 'Good healthy options', 'Not worth it'] },
  'Traveling with baby/toddler:breakfast': { prompt: 'Could you find suitable food for your baby/toddler?', options: ['Yes, easily', 'Limited options', 'Had to ask staff', 'Not really', "Didn't use breakfast"] },

  // Pet owners → pet experience options
  'Pet owner:pet_policy':       { prompt: 'How was the pet experience?', options: ['Very welcoming', 'Allowed but unwelcoming', 'Extra fees were high', 'Strict restrictions', 'Staff were unhelpful'] },
  'Guide dog owner:pet_policy': { prompt: 'Was the hotel accommodating for your guide dog?', options: ['Very accommodating', 'Acceptable', 'Some friction', 'Not accommodating', 'Had to explain my rights'] },

  // Dietary / food-focused travelers
  'Dietary restrictions:breakfast': { prompt: 'Were your dietary needs met at breakfast?', options: ['Yes, fully', 'Partially', 'Had to ask staff', 'Barely', 'Not at all'] },
  'Foodie:breakfast_quality':       { prompt: 'How would you rate the food quality?', options: ['Exceptional', 'Good', 'Average', 'Disappointing', 'Terrible'] },

  // Accessibility users → specific friction points
  'Wheelchair user:accessibility':   { prompt: 'Which accessibility features worked well?', options: ['Ramp / step-free entry', 'Elevator', 'Accessible bathroom', 'Wide corridors', 'Staff assistance'] },
  'Mobility aid user:accessibility': { prompt: 'Which accessibility features worked well?', options: ['Ramp / step-free entry', 'Elevator', 'Accessible bathroom', 'Wide corridors', 'Staff assistance'] },

  // Parking-focused travelers
  'Road tripper:parking':   { prompt: 'How was the parking experience?', options: ['Easy and free', 'Easy but paid', 'Hard to find', 'Full / unavailable', 'Instructions unclear'] },
  'Parking needed:parking': { prompt: 'How was the parking experience?', options: ['Easy and free', 'Easy but paid', 'Hard to find', 'Full / unavailable', 'Instructions unclear'] },
};

function buildPrimaryQuestion(
  attribute: string,
  userTags: string[],
  mode: 'verification' | 'problem',
  context: QuestionContext,
  gap?: AttributeGap,
): FollowUpQuestion {
  // Layer B: Check persona × attribute QuickTag override first.
  for (const tag of userTags) {
    const override = PERSONA_QUICKTAG_OVERRIDES[`${tag}:${attribute}`];
    if (override) {
      return {
        ui_type:       'QuickTag',
        feature_name:  attribute,
        prompt:        override.prompt,
        options:       override.options,
        evidence_text: context.evidence_text,
        reason:        context.reason,
      };
    }
  }

  // Default: Slider (if configured) → Agreement
  const slider = SLIDER_CONFIG[attribute];
  if (slider) {
    return {
      ui_type:      'Slider',
      feature_name: attribute,
      evidence_text: context.evidence_text,
      reason: context.reason,
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
      : buildVerificationStatement(attribute, userTags, gap ?? { attribute, raw_score: 0, final_score: 0, source: 'decay' }),
    context,
  );
}

function buildReasonQuestion(attribute: string, text: string, userTags: string[], context: QuestionContext): FollowUpQuestion {
  const builder = REASON_PROMPTS[attribute];
  if (builder) return builder(text, userTags, context);
  return buildAgreementQuestion(
    `${attribute}_reason`,
    `The problem with ${ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ')} felt persistent, not like a one-off inconvenience.`,
    context,
  );
}

function selectPositiveGap(rankedGaps: AttributeGap[], mentions: AttributeMention[]): AttributeGap | undefined {
  const mentionedAttrs = new Set(mentions.map(m => m.attribute));
  return rankedGaps.find(g => !mentionedAttrs.has(g.attribute)) ?? rankedGaps[0];
}

function selectPrimaryNegativeAttribute(
  mentions: AttributeMention[],
  rankedGaps: AttributeGap[],
): string | undefined {
  return mentions.find(m => m.negative > 0)?.attribute ?? rankedGaps[0]?.attribute;
}

function buildGenerationSummary(
  reviewSentiment: ReviewSentiment,
  rankedGaps: AttributeGap[],
  questions: FollowUpQuestion[],
  selectedAttribute?: string,
): string {
  const top5 = rankedGaps
    .slice(0, 5)
    .map(g => `${g.attribute}:${g.final_score.toFixed(1)}(fresh=${((g.freshness_score ?? 0) * 100).toFixed(0)}%,${g.source})`)
    .join(', ');
  return [
    'generation_mode=deterministic_decay_v2',
    `review_sentiment=${reviewSentiment}`,
    `question_count=${questions.length}`,
    `selected_attribute=${selectedAttribute ?? 'none'}`,
    `ranked_gaps=${top5 || 'none'}`,
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

// ─── Public API ───────────────────────────────────────────────────────────────

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
    supabase.from('Description_PROC').select('*').eq('eg_property_id', property_id).single(),
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
    supabase.from('User_Personas').select('tags').eq('user_id', user_id).maybeSingle(),
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

  // Step A: Update freshness with attributes mentioned in the new review.
  const reviewText = buildReviewText(currentReview);
  const reviewedAt = currentReview.created_at ? new Date(currentReview.created_at) : today;
  await updateFreshnessFromReview(supabase, property_id, reviewText, reviewedAt);

  // Step B: Load freshness state (from DB; backfills on first run).
  const freshnessMap = await loadOrBackfillFreshness(supabase, property_id, mergedReviews, today);

  // Step C: Build ranked gap list (Layers 1–4).
  const rankedGaps = buildRankedGaps(freshnessMap, today, userTags, hotel, mergedReviews);

  if (rankedGaps.length === 0) {
    return {
      review_id,
      property_id,
      questions: [],
      llm_prompt: 'generation_mode=deterministic_decay_v2\nranked_gaps=none',
    };
  }

  // Step D: Generate questions based on review sentiment.
  const reviewSentiment = detectReviewSentiment(currentReview);
  const mentions = detectAttributeMentions(reviewText);

  let questions: FollowUpQuestion[] = [];
  let selectedAttribute: string | undefined;

  if (reviewSentiment === 'positive') {
    const selectedGap = selectPositiveGap(rankedGaps, mentions);
    if (selectedGap) {
      selectedAttribute = selectedGap.attribute;
      const context = {
        evidence_text: buildEvidenceText(hotel, mergedReviews, selectedGap.attribute, selectedGap),
        reason: buildQuestionReason(selectedGap.attribute, selectedGap, userTags),
      };
      questions = [buildPrimaryQuestion(selectedGap.attribute, userTags, 'verification', context, selectedGap)];
    }
  } else {
    const primaryAttribute = selectPrimaryNegativeAttribute(mentions, rankedGaps);
    if (primaryAttribute) {
      selectedAttribute = primaryAttribute;
      const matchingGap = rankedGaps.find(g => g.attribute === primaryAttribute);
      const mainContext = {
        evidence_text: buildEvidenceText(hotel, mergedReviews, primaryAttribute, matchingGap),
        reason: buildQuestionReason(primaryAttribute, matchingGap, userTags, 'main'),
      };
      const reasonContext = {
        evidence_text: buildEvidenceText(hotel, mergedReviews, primaryAttribute, matchingGap),
        reason: buildQuestionReason(primaryAttribute, matchingGap, userTags, 'narrowing'),
      };
      questions = [
        buildPrimaryQuestion(primaryAttribute, userTags, 'problem', mainContext, matchingGap),
        buildReasonQuestion(primaryAttribute, reviewText, userTags, reasonContext),
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
