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

import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabase';
import { AMENITY_LABELS, parseArrayField, parseHtmlItems, stripHtml } from '@/lib/utils';
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
  hotel_grounding_score?: number;
  review_mention_count?: number;
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

interface AttributeContextSignal {
  review_evidence: ReviewEvidence;
  has_hotel_claim: boolean;
  matters_to_user: boolean;
  grounding_score: number;
  priority_multiplier: number;
}

type TopicSource = 'intersection' | 'review_only' | 'persona_only' | 'blind_spot';

interface TopicDefinition {
  key: string;
  attribute: string;
  persona_tags: string[];
  review_keywords: string[];
  supported_evidence_sources: Array<'reviews' | 'hotel_description' | 'amenity' | 'policy'>;
  hotel_fields?: Array<keyof Hotel>;
  hotel_amenities?: string[];
}

type PersonaTopicBundle = Record<string, string[]>;

interface CandidateTopic {
  topic_key: string;
  attribute: string;
  topic_source: TopicSource;
  review_mentions: number;
  review_negative_mentions: number;
  review_positive_mentions: number;
  persona_match_count: number;
  hotel_grounding_score: number;
  freshness_score: number;
  risk_score: number;
  blind_spot: boolean;
  gap?: AttributeGap;
}

interface DynamicQuestionCopyRequest {
  id: string;
  attribute: string;
  ui_type: FollowUpQuestion['ui_type'];
  path: 'positive_primary' | 'negative_primary' | 'negative_narrowing';
  topic_source: TopicSource;
  review_sentiment: ReviewSentiment;
  user_tags: string[];
  submitted_review: string;
  evidence_text: string | null;
  reason: string;
  review_mentions: number;
  review_negative_mentions: number;
}

interface GeneratedQuestionCopy {
  id: string;
  primary_text?: string | null;
  narrowing_text?: string | null;
}

interface CustomTagInterpretation {
  tag: string;
  inferred_persona_tags: string[];
  inferred_topics: string[];
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Attribute metadata ───────────────────────────────────────────────────────

const ATTRIBUTE_KEYWORDS: Record<string, string[]> = {
  parking:           ['parking', 'garage', 'valet', 'car park', 'parked', 'lot'],
  breakfast:         ['breakfast', 'morning meal', 'buffet', 'continental', 'brunch'],
  wifi:              ['wifi', 'wi-fi', 'internet', 'wireless', 'connection speed', 'bandwidth', 'signal'],
  work_environment:  ['desk', 'workspace', 'workstation', 'laptop', 'video call', 'zoom', 'meeting', 'business center', 'co-working', 'coworking', 'outlet', 'power outlet'],
  pet_policy:        ['dog', 'pet', 'animal', 'cat', 'puppy', 'leash', 'pet-friendly', 'pet friendly'],
  pet_fees:          ['pet fee', 'dog fee', 'pet charge', 'pet deposit', 'charge for dog', 'fee for dog'],
  pet_restrictions:  ['pet restriction', 'breed restriction', 'size limit', 'weight limit', 'dogs only', 'pet rule'],
  check_in:          ['check-in', 'check in', 'check out', 'checkout', 'arrival', 'late arrival', 'front desk', 'reception'],
  safety:            ['safe', 'safety', 'security', 'secure', 'lock', 'keycard', 'emergency'],
  pool:              ['pool', 'swimming', 'swim', 'hot tub', 'jacuzzi', 'heated pool'],
  gym:               ['gym', 'fitness', 'workout', 'exercise', 'treadmill', 'weights'],
  noise:             ['quiet', 'noise', 'noisy', 'loud', 'soundproof', 'silent', 'disturb'],
  cleanliness:       ['clean', 'dirty', 'hygiene', 'spotless', 'stain', 'dusty', 'smell', 'odor', 'odour', 'mold', 'mildew'],
  room_comfort:      ['comfortable', 'comfort', 'comfortable bed', 'mattress', 'pillows', 'sleep quality', 'cozy', 'spacious room'],
  transit:           ['subway', 'metro', 'bus', 'train', 'station', 'transit', 'walk to', 'walkable'],
  accessibility:     ['wheelchair', 'accessible', 'elevator', 'disabled', 'ramp', 'mobility', 'ada', 'step-free'],
  elevator_access:   ['elevator', 'lift', 'elevator access'],
  bathroom_accessibility: ['accessible bathroom', 'roll-in shower', 'grab bar', 'shower seat', 'bathroom accessibility', 'accessible shower'],
  air_conditioning:  ['ac', 'air conditioning', 'air-conditioning', 'hvac', 'cooling', 'thermostat'],
  construction:      ['construction', 'renovation', 'drilling', 'building work', 'scaffolding'],
  breakfast_quality: ['eggs', 'pastry', 'coffee quality', 'breakfast selection', 'buffet variety'],
  extra_bed_policy:  ['extra bed', 'rollaway', 'additional bed', 'sofa bed', 'bed for child'],
  crib_setup:        ['crib', 'cot', 'pack and play', 'pack-and-play', 'baby bed'],
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
  work_environment:  45,
  pool:              45,
  check_in:          60,
  gym:               60,
  noise:             60,
  extra_bed_policy:  90,
  crib_setup:        90,
  air_conditioning:  90,
  pet_policy:        90,
  pet_fees:          90,
  pet_restrictions:  120,
  safety:            90,
  accessibility:     180,
  elevator_access:   180,
  bathroom_accessibility: 180,
  room_comfort:      60,
  transit:           365,
};

const AMENITY_TO_ATTRIBUTE: Record<string, string> = {
  free_parking:       'parking',
  breakfast_available:'breakfast',
  breakfast_included: 'breakfast',
  business_services:  'work_environment',
  internet:           'wifi',
  pool:               'pool',
  kids_pool:          'pool',
  crib:               'crib_setup',
  extra_bed:          'extra_bed_policy',
  fitness_equipment:  'gym',
  elevator:           'elevator_access',
  soundproof_room:    'noise',
  no_smoking:         'safety',
  frontdesk_24_hour:  'check_in',
  hot_tub:            'pool',
  spa:                'gym',
  ac:                 'air_conditioning',
};

const PERSONA_TOPIC_BUNDLES: PersonaTopicBundle = {
  'Business traveler':              ['wifi', 'work_environment', 'check_in', 'parking', 'noise'],
  'Convention attendee':            ['wifi', 'work_environment', 'check_in', 'parking', 'noise'],
  'Digital nomad':                  ['wifi', 'work_environment', 'check_in', 'noise', 'room_comfort'],
  'Remote worker':                  ['wifi', 'work_environment', 'check_in', 'noise', 'room_comfort'],
  'Fast WiFi':                      ['wifi', 'work_environment'],
  'Long-stay traveler':             ['wifi', 'work_environment', 'cleanliness', 'air_conditioning', 'room_comfort', 'check_in'],
  Backpacker:                       ['parking', 'breakfast', 'wifi', 'check_in'],
  'Budget traveler':                ['parking', 'breakfast', 'wifi', 'check_in'],
  'Luxury traveler':                ['pool', 'gym', 'cleanliness', 'breakfast_quality', 'room_comfort'],
  'Wellness traveler':              ['pool', 'gym', 'cleanliness', 'breakfast_quality', 'room_comfort'],
  'Pool access':                    ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Gym access':                     ['pool', 'gym', 'cleanliness', 'breakfast_quality'],
  'Spa & relaxation':               ['pool', 'gym', 'cleanliness', 'breakfast_quality', 'room_comfort'],
  'Couple traveler':                ['noise', 'cleanliness', 'breakfast_quality', 'room_comfort'],
  'Family traveler':                ['cleanliness', 'extra_bed_policy', 'crib_setup', 'breakfast', 'noise', 'pool', 'check_in', 'safety'],
  'Group traveler':                 ['cleanliness', 'extra_bed_policy', 'breakfast', 'noise', 'pool', 'check_in', 'safety'],
  'Traveling with baby/toddler':    ['cleanliness', 'crib_setup', 'extra_bed_policy', 'breakfast', 'noise', 'check_in', 'safety'],
  'Traveling with kids':            ['cleanliness', 'extra_bed_policy', 'crib_setup', 'breakfast', 'noise', 'pool', 'check_in', 'safety'],
  'Traveling with teens':           ['cleanliness', 'extra_bed_policy', 'breakfast', 'noise', 'pool', 'check_in', 'safety'],
  'Caregiver traveler':             ['cleanliness', 'extra_bed_policy', 'crib_setup', 'breakfast', 'noise', 'check_in', 'safety'],
  'Senior traveler':                ['cleanliness', 'extra_bed_policy', 'check_in', 'safety', 'elevator_access', 'bathroom_accessibility'],
  Families:                         ['cleanliness', 'extra_bed_policy', 'crib_setup', 'breakfast', 'noise', 'pool', 'check_in', 'safety'],
  'Pet owner':                      ['pet_policy', 'pet_fees', 'pet_restrictions'],
  'Guide dog owner':                ['pet_policy', 'pet_restrictions', 'accessibility', 'elevator_access', 'bathroom_accessibility'],
  'Wheelchair user':                ['accessibility', 'elevator_access', 'bathroom_accessibility', 'check_in', 'safety'],
  'Mobility aid user':              ['accessibility', 'elevator_access', 'bathroom_accessibility', 'check_in', 'safety'],
  'Visual impairment':              ['accessibility', 'check_in', 'safety'],
  'Hearing impairment':             ['accessibility', 'check_in', 'safety'],
  'Step-free access needed':        ['accessibility', 'elevator_access', 'check_in', 'safety'],
  'Elevator access needed':         ['elevator_access', 'accessibility', 'check_in'],
  'Accessible bathroom needed':     ['bathroom_accessibility', 'accessibility', 'check_in'],
  Neurodivergent:                   ['noise', 'air_conditioning', 'cleanliness', 'room_comfort', 'accessibility'],
  'Sensory-sensitive':              ['noise', 'air_conditioning', 'cleanliness', 'room_comfort', 'accessibility'],
  'Light sleeper':                  ['noise', 'air_conditioning', 'room_comfort', 'cleanliness'],
  Quiet:                            ['noise', 'room_comfort', 'air_conditioning'],
  'Strong AC':                      ['air_conditioning', 'room_comfort'],
  'Air quality sensitive':          ['air_conditioning', 'cleanliness', 'room_comfort'],
  'Fragrance-sensitive':            ['cleanliness', 'air_conditioning', 'room_comfort'],
  'Safety-conscious':               ['safety', 'check_in'],
  'Cleanliness-focused':            ['cleanliness', 'room_comfort', 'safety'],
  'Chronic illness':                ['cleanliness', 'room_comfort', 'safety', 'bathroom_accessibility'],
  Tourist:                          ['transit', 'noise', 'breakfast'],
  'Weekend getaway':                ['transit', 'noise', 'breakfast', 'room_comfort'],
  'Event traveler':                 ['transit', 'noise', 'breakfast', 'check_in'],
  'Adventure traveler':             ['transit', 'noise', 'breakfast', 'parking'],
  'Culture enthusiast':             ['transit', 'noise', 'breakfast'],
  'Road tripper':                   ['parking', 'check_in'],
  'Parking needed':                 ['parking', 'check_in'],
  'Transit-first':                  ['transit', 'noise'],
  'Walkable area':                  ['transit', 'noise'],
  'Breakfast-first':                ['breakfast', 'breakfast_quality'],
  Foodie:                           ['breakfast', 'breakfast_quality'],
  'Dietary restrictions':           ['breakfast', 'breakfast_quality'],
  'Spacious room':                  ['room_comfort', 'cleanliness', 'air_conditioning'],
  'Solo traveler':                  ['safety', 'noise', 'check_in', 'wifi'],
  'Eco-conscious':                  ['transit'],
};

const CUSTOM_TAG_TOPIC_HINTS: Array<{ keywords: string[]; topics: string[] }> = [
  { keywords: ['business', 'conference', 'remote', 'work', 'cowork', 'co-work', 'zoom', 'meeting', 'laptop', 'workspace', 'desk'], topics: ['wifi', 'work_environment', 'check_in', 'noise'] },
  { keywords: ['family', 'kids', 'children', 'child', 'baby', 'toddler', 'teen', 'parent', 'caregiver'], topics: ['cleanliness', 'extra_bed_policy', 'crib_setup', 'breakfast', 'noise', 'pool', 'check_in'] },
  { keywords: ['pet', 'dog', 'cat', 'service animal', 'guide dog'], topics: ['pet_policy', 'pet_fees', 'pet_restrictions'] },
  { keywords: ['wheelchair', 'mobility', 'accessible', 'accessibility', 'step-free', 'elevator', 'lift', 'bathroom'], topics: ['accessibility', 'elevator_access', 'bathroom_accessibility', 'check_in'] },
  { keywords: ['quiet', 'sleep', 'light sleeper', 'rest', 'sensory', 'neurodivergent', 'fragrance', 'air quality'], topics: ['noise', 'air_conditioning', 'room_comfort', 'cleanliness'] },
  { keywords: ['clean', 'cleanliness', 'hygiene', 'allergy', 'illness'], topics: ['cleanliness', 'room_comfort', 'safety'] },
  { keywords: ['safe', 'safety', 'secure', 'security'], topics: ['safety', 'check_in'] },
  { keywords: ['breakfast', 'food', 'dining', 'dietary', 'restaurant'], topics: ['breakfast', 'breakfast_quality'] },
  { keywords: ['parking', 'car', 'garage', 'road trip'], topics: ['parking', 'check_in'] },
  { keywords: ['walkable', 'transit', 'metro', 'subway', 'train', 'bus', 'location'], topics: ['transit', 'noise'] },
  { keywords: ['pool', 'swim', 'hot tub'], topics: ['pool'] },
  { keywords: ['gym', 'fitness', 'workout', 'spa', 'wellness'], topics: ['gym', 'pool', 'room_comfort'] },
  { keywords: ['temperature', 'ac', 'air conditioning', 'cooling', 'hvac'], topics: ['air_conditioning', 'room_comfort'] },
  { keywords: ['spacious', 'comfort', 'bed', 'mattress', 'pillow'], topics: ['room_comfort', 'cleanliness'] },
];

function buildCustomTagClassificationSystemPrompt(): string {
  return `You classify custom hotel-traveler persona tags into existing PARC persona types and follow-up topics.

Return valid JSON only.

Rules:
1. Work only from the literal custom tag text.
2. Map each custom tag to the most relevant existing persona tags when the meaning is clear.
3. Also map each custom tag to the most relevant follow-up topics.
4. Be conservative. If the meaning is vague, return fewer matches.
5. Do not invent new persona tags or new topics.

Allowed persona tags:
${Object.keys(PERSONA_TOPIC_BUNDLES).join(', ')}

Allowed follow-up topics:
${Object.keys(TOPIC_DEFINITIONS).join(', ')}

Return this shape:
{
  "items": [
    {
      "tag": "string",
      "inferred_persona_tags": ["string"],
      "inferred_topics": ["string"]
    }
  ]
}`;
}

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
  work_environment:   7,
  parking:            7,
  construction:       7,
  noise:              6,
  breakfast:          5,
  extra_bed_policy:   6,
  crib_setup:         6,
  pool:               4,
  transit:            4,
  air_conditioning:   3,
  room_comfort:       5,
  gym:                3,
  breakfast_quality:  2,
  elevator_access:    8,
  bathroom_accessibility: 9,
  pet_fees:           6,
  pet_restrictions:   7,
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  parking:           'parking',
  breakfast:         'breakfast',
  wifi:              'WiFi',
  work_environment:  'working environment',
  pet_policy:        'pet-friendliness',
  pet_fees:          'pet fees',
  pet_restrictions:  'pet restrictions',
  check_in:          'check-in',
  safety:            'safety',
  pool:              'pool',
  gym:               'gym',
  noise:             'noise level',
  cleanliness:       'cleanliness',
  room_comfort:      'room comfort',
  transit:           'location convenience',
  accessibility:     'accessibility',
  elevator_access:   'elevator access',
  bathroom_accessibility: 'bathroom accessibility',
  air_conditioning:  'air conditioning',
  construction:      'construction disruption',
  breakfast_quality: 'breakfast quality',
  extra_bed_policy:  'extra bed policy',
  crib_setup:        'crib setup',
};

const ATTRIBUTE_STAT_PHRASES: Record<string, { positive: string; negative: string }> = {
  wifi: { positive: 'described it as reliable', negative: 'described it as unreliable' },
  noise: { positive: 'said the room stayed quiet', negative: 'said noise was disruptive' },
  cleanliness: { positive: 'said the room felt clean', negative: 'said cleanliness was an issue' },
  parking: { positive: 'said parking felt straightforward', negative: 'said parking created friction' },
  breakfast: { positive: 'said breakfast felt dependable', negative: 'said breakfast fell short' },
  breakfast_quality: { positive: 'said breakfast quality felt strong', negative: 'said breakfast quality fell short' },
  check_in: { positive: 'said check-in felt smooth', negative: 'said check-in felt difficult' },
  work_environment: { positive: 'said the hotel worked well for focused work', negative: 'said working from the hotel felt difficult' },
  pet_policy: { positive: 'said the hotel felt pet-friendly', negative: 'said the pet experience felt restrictive' },
  pet_fees: { positive: 'said pet fees felt clear and manageable', negative: 'said pet fees felt frustrating or unclear' },
  pet_restrictions: { positive: 'said the pet rules felt workable', negative: 'said pet restrictions got in the way' },
  accessibility: { positive: 'said accessibility worked well in practice', negative: 'said accessibility gaps created friction' },
  elevator_access: { positive: 'said elevator access felt dependable', negative: 'said elevator access created friction' },
  bathroom_accessibility: { positive: 'said bathroom accessibility worked in practice', negative: 'said bathroom accessibility created friction' },
  air_conditioning: { positive: 'said temperature control felt easy', negative: 'said temperature control was hard to manage' },
  safety: { positive: 'said the property felt secure', negative: 'said the property felt less secure than expected' },
  pool: { positive: 'said the pool was worth using', negative: 'said the pool experience disappointed' },
  gym: { positive: 'said the gym felt usable', negative: 'said the gym felt underwhelming' },
  transit: { positive: 'said getting around felt convenient', negative: 'said getting around took more effort than expected' },
  construction: { positive: 'said construction was barely noticeable', negative: 'said construction was disruptive' },
  room_comfort: { positive: 'said the room felt comfortable', negative: 'said room comfort fell short' },
  extra_bed_policy: { positive: 'said extra bed arrangements felt clear', negative: 'said extra bed arrangements created friction' },
  crib_setup: { positive: 'said crib setup felt straightforward', negative: 'said crib setup was harder than expected' },
};

const REVIEW_STAT_MIN_MENTIONS = 5;
const REVIEW_STAT_MIN_CONSENSUS = 0.75;
const GENERIC_STALE_ATTRIBUTE_PENALTY = 0.58;
const HOTEL_CLAIM_PRIORITY_BONUS = 0.22;
const LIGHT_REVIEW_SIGNAL_BONUS = 0.12;
const STRONG_REVIEW_SIGNAL_BONUS = 0.2;
const PERSONA_GROUNDING_BONUS = 0.08;
const FOLLOW_UP_GENERATION_MODEL = 'gpt-4o-mini';

const FOLLOW_UP_COPY_SYSTEM_PROMPT = `You write hotel review follow-up questions at request time.

Return valid JSON only.

Rules:
1. Never invent facts, amenities, complaints, or praise beyond the provided data.
2. If the review sentiment is negative, the follow-up must stay anchored to the user's negative experience in the submitted review.
3. If the review sentiment is positive, the follow-up may integrate the user's persona tags with the provided review and evidence.
4. Use the provided evidence_text and reason only as grounding. Do not quote or cite anything not included there.
5. Keep each question concise and natural.
6. For Slider questions, primary_text must be a direct question.
7. For Agreement questions, primary_text must be a short statement suitable for a Yes / Neutral / No response.
8. narrowing_text should only be present for negative_narrowing items, and it must stay on the same topic as the negative experience.
9. Ask about hotel facts, availability, consistency, clarity, quality, timing, or process. Do not center the wording on the user's feelings.
10. Avoid emotional or self-focused phrasing such as "were you disappointed", "did this impact your satisfaction", "how did that make you feel", or "were you upset".
11. Prefer wording like "Was breakfast available each morning?", "Did breakfast seem included in the rate?", "Were breakfast options clearly communicated?", or "Was the WiFi stable enough for calls?".
12. Do not add markdown, numbering, or explanations.

Return this shape:
{
  "items": [
    {
      "id": "string",
      "primary_text": "string",
      "narrowing_text": "string | null"
    }
  ]
}`;

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

const TOPIC_DEFINITION_INPUTS: Record<string, Omit<TopicDefinition, 'persona_tags'>> = {
  wifi: {
    key: 'wifi',
    attribute: 'wifi',
    review_keywords: ATTRIBUTE_KEYWORDS.wifi,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_internet'],
    hotel_amenities: ['internet'],
  },
  work_environment: {
    key: 'work_environment',
    attribute: 'work_environment',
    review_keywords: ATTRIBUTE_KEYWORDS.work_environment,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_business_services', 'property_amenity_internet', 'property_amenity_conveniences'],
    hotel_amenities: ['business_services', 'internet'],
  },
  parking: {
    key: 'parking',
    attribute: 'parking',
    review_keywords: ATTRIBUTE_KEYWORDS.parking,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_parking'],
    hotel_amenities: ['free_parking'],
  },
  breakfast: {
    key: 'breakfast',
    attribute: 'breakfast',
    review_keywords: ATTRIBUTE_KEYWORDS.breakfast,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_food_and_drink'],
    hotel_amenities: ['breakfast_available', 'breakfast_included'],
  },
  breakfast_quality: {
    key: 'breakfast_quality',
    attribute: 'breakfast_quality',
    review_keywords: ATTRIBUTE_KEYWORDS.breakfast_quality,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_food_and_drink'],
    hotel_amenities: ['breakfast_available', 'breakfast_included'],
  },
  check_in: {
    key: 'check_in',
    attribute: 'check_in',
    review_keywords: ATTRIBUTE_KEYWORDS.check_in,
    supported_evidence_sources: ['reviews', 'hotel_description', 'policy'],
    hotel_fields: ['property_description', 'check_in_instructions'],
    hotel_amenities: ['frontdesk_24_hour'],
  },
  cleanliness: {
    key: 'cleanliness',
    attribute: 'cleanliness',
    review_keywords: ATTRIBUTE_KEYWORDS.cleanliness,
    supported_evidence_sources: ['reviews', 'hotel_description'],
    hotel_fields: ['property_description'],
  },
  noise: {
    key: 'noise',
    attribute: 'noise',
    review_keywords: ATTRIBUTE_KEYWORDS.noise,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'area_description'],
    hotel_amenities: ['soundproof_room'],
  },
  safety: {
    key: 'safety',
    attribute: 'safety',
    review_keywords: ATTRIBUTE_KEYWORDS.safety,
    supported_evidence_sources: ['reviews', 'hotel_description', 'policy'],
    hotel_fields: ['property_description', 'know_before_you_go', 'check_in_instructions'],
    hotel_amenities: ['no_smoking'],
  },
  pool: {
    key: 'pool',
    attribute: 'pool',
    review_keywords: ATTRIBUTE_KEYWORDS.pool,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_outdoor', 'property_amenity_things_to_do'],
    hotel_amenities: ['pool', 'kids_pool', 'hot_tub'],
  },
  accessibility: {
    key: 'accessibility',
    attribute: 'accessibility',
    review_keywords: ATTRIBUTE_KEYWORDS.accessibility,
    supported_evidence_sources: ['reviews', 'hotel_description', 'policy', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_accessibility'],
    hotel_amenities: ['elevator'],
  },
  elevator_access: {
    key: 'elevator_access',
    attribute: 'elevator_access',
    review_keywords: ATTRIBUTE_KEYWORDS.elevator_access,
    supported_evidence_sources: ['reviews', 'hotel_description', 'policy', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_accessibility'],
    hotel_amenities: ['elevator'],
  },
  bathroom_accessibility: {
    key: 'bathroom_accessibility',
    attribute: 'bathroom_accessibility',
    review_keywords: ATTRIBUTE_KEYWORDS.bathroom_accessibility,
    supported_evidence_sources: ['reviews', 'hotel_description', 'policy'],
    hotel_fields: ['property_description', 'property_amenity_accessibility'],
  },
  pet_policy: {
    key: 'pet_policy',
    attribute: 'pet_policy',
    review_keywords: ATTRIBUTE_KEYWORDS.pet_policy,
    supported_evidence_sources: ['reviews', 'policy'],
    hotel_fields: ['pet_policy'],
  },
  pet_fees: {
    key: 'pet_fees',
    attribute: 'pet_fees',
    review_keywords: ATTRIBUTE_KEYWORDS.pet_fees,
    supported_evidence_sources: ['reviews', 'policy'],
    hotel_fields: ['pet_policy'],
  },
  pet_restrictions: {
    key: 'pet_restrictions',
    attribute: 'pet_restrictions',
    review_keywords: ATTRIBUTE_KEYWORDS.pet_restrictions,
    supported_evidence_sources: ['reviews', 'policy'],
    hotel_fields: ['pet_policy'],
  },
  extra_bed_policy: {
    key: 'extra_bed_policy',
    attribute: 'extra_bed_policy',
    review_keywords: ATTRIBUTE_KEYWORDS.extra_bed_policy,
    supported_evidence_sources: ['reviews', 'policy', 'amenity'],
    hotel_fields: ['children_and_extra_bed_policy', 'property_amenity_family_friendly'],
    hotel_amenities: ['extra_bed'],
  },
  crib_setup: {
    key: 'crib_setup',
    attribute: 'crib_setup',
    review_keywords: ATTRIBUTE_KEYWORDS.crib_setup,
    supported_evidence_sources: ['reviews', 'policy', 'amenity'],
    hotel_fields: ['children_and_extra_bed_policy', 'property_amenity_family_friendly'],
    hotel_amenities: ['crib'],
  },
  air_conditioning: {
    key: 'air_conditioning',
    attribute: 'air_conditioning',
    review_keywords: ATTRIBUTE_KEYWORDS.air_conditioning,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_conveniences'],
    hotel_amenities: ['ac'],
  },
  room_comfort: {
    key: 'room_comfort',
    attribute: 'room_comfort',
    review_keywords: ATTRIBUTE_KEYWORDS.room_comfort,
    supported_evidence_sources: ['reviews', 'hotel_description'],
    hotel_fields: ['property_description'],
  },
  transit: {
    key: 'transit',
    attribute: 'transit',
    review_keywords: ATTRIBUTE_KEYWORDS.transit,
    supported_evidence_sources: ['reviews', 'hotel_description'],
    hotel_fields: ['area_description', 'property_description'],
  },
  gym: {
    key: 'gym',
    attribute: 'gym',
    review_keywords: ATTRIBUTE_KEYWORDS.gym,
    supported_evidence_sources: ['reviews', 'hotel_description', 'amenity'],
    hotel_fields: ['property_description', 'property_amenity_spa'],
    hotel_amenities: ['fitness_equipment', 'spa'],
  },
  construction: {
    key: 'construction',
    attribute: 'construction',
    review_keywords: ATTRIBUTE_KEYWORDS.construction,
    supported_evidence_sources: ['reviews', 'hotel_description', 'policy'],
    hotel_fields: ['property_description', 'know_before_you_go'],
  },
};

const TOPIC_DEFINITIONS: Record<string, TopicDefinition> = Object.fromEntries(
  Object.entries(TOPIC_DEFINITION_INPUTS).map(([key, definition]) => [
    key,
    {
      ...definition,
      persona_tags: Object.entries(PERSONA_TOPIC_BUNDLES)
        .filter(([, topics]) => topics.includes(key))
        .map(([tag]) => tag),
    },
  ]),
) as Record<string, TopicDefinition>;

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
  work_environment: {
    prompt: () => 'How workable did the room or shared spaces feel for laptop time, calls, or focused work?',
    left_label: 'Hard to Work',
    right_label: 'Work-Friendly',
    nlp_hints: [
      { keywords: ['cramped', 'no desk', 'no outlet', 'awkward', 'hard to work'], direction: 'left' },
      { keywords: ['desk', 'workspace', 'comfortable', 'productive', 'good for work'], direction: 'right' },
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
  room_comfort: {
    prompt: () => 'How comfortable did the room setup feel for relaxing or sleeping?',
    left_label: 'Uncomfortable',
    right_label: 'Comfortable',
    nlp_hints: [
      { keywords: ['uncomfortable', 'hard bed', 'bad mattress', 'stiff', 'couldn’t sleep'], direction: 'left' },
      { keywords: ['comfortable', 'cozy', 'good bed', 'slept well', 'relaxing'], direction: 'right' },
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
  work_environment: (text, _userTags, context) =>
    buildAgreementQuestion(
      'work_environment_reason',
      pickReasonStatement(text, [
        { keywords: ['desk', 'workspace', 'table'], statement: 'Lack of a usable desk or workspace was the main work setup problem.' },
        { keywords: ['outlet', 'plug', 'power'], statement: 'Power access made working from the hotel harder than expected.' },
        { keywords: ['call', 'meeting', 'noise'], statement: 'Noise or privacy made calls and focused work harder than expected.' },
      ], 'The hotel was harder to work from than it first appeared.'),
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
  pet_fees: (text, _userTags, context) =>
    buildAgreementQuestion(
      'pet_fees_reason',
      pickReasonStatement(text, [
        { keywords: ['fee', 'charge', 'cost', 'deposit'], statement: 'Unexpected cost was the main pet-travel frustration.' },
        { keywords: ['unclear', 'confusing'], statement: 'The pet-fee policy was harder to understand than it should have been.' },
      ], 'Pet fees felt more frustrating than straightforward.'),
      context,
    ),
  pet_restrictions: (text, _userTags, context) =>
    buildAgreementQuestion(
      'pet_restrictions_reason',
      pickReasonStatement(text, [
        { keywords: ['size', 'weight', 'breed'], statement: 'Size or breed rules created the biggest pet-travel friction.' },
        { keywords: ['rule', 'restrict', 'policy'], statement: 'Policy restrictions mattered more than cost.' },
      ], 'The pet rules felt harder to work around than expected.'),
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
  elevator_access: (text, _userTags, context) =>
    buildAgreementQuestion(
      'elevator_access_reason',
      pickReasonStatement(text, [
        { keywords: ['wait', 'slow', 'crowded'], statement: 'Elevator waits or reliability were the main issue.' },
        { keywords: ['stairs', 'step'], statement: 'Needing to work around stairs made access harder than expected.' },
      ], 'Elevator access affected actual usability, not just convenience.'),
      context,
    ),
  bathroom_accessibility: (text, _userTags, context) =>
    buildAgreementQuestion(
      'bathroom_accessibility_reason',
      pickReasonStatement(text, [
        { keywords: ['shower', 'bathroom'], statement: 'Bathroom layout was the biggest accessibility issue.' },
        { keywords: ['grab bar', 'seat'], statement: 'Missing or awkward support features made the bathroom harder to use.' },
      ], 'Bathroom accessibility affected real usability during the stay.'),
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
  extra_bed_policy: (text, _userTags, context) =>
    buildAgreementQuestion(
      'extra_bed_policy_reason',
      pickReasonStatement(text, [
        { keywords: ['extra bed', 'rollaway', 'sofa bed'], statement: 'The extra bed setup was harder to arrange than expected.' },
        { keywords: ['unclear', 'policy', 'confusing'], statement: 'The extra bed policy was less clear than it should have been.' },
      ], 'The extra bed policy or setup created more friction than expected.'),
      context,
    ),
  crib_setup: (text, _userTags, context) =>
    buildAgreementQuestion(
      'crib_setup_reason',
      pickReasonStatement(text, [
        { keywords: ['crib', 'cot', 'pack and play'], statement: 'Getting a crib confirmed or delivered took more effort than expected.' },
        { keywords: ['unclear', 'policy'], statement: 'The crib setup policy was less clear than it should have been.' },
      ], 'Crib setup was harder to arrange than expected.'),
      context,
    ),
  room_comfort: (text, _userTags, context) =>
    buildAgreementQuestion(
      'room_comfort_reason',
      pickReasonStatement(text, [
        { keywords: ['bed', 'mattress', 'pillow'], statement: 'Bed comfort drove most of the room-comfort issue.' },
        { keywords: ['space', 'cramped', 'tight'], statement: 'The room layout felt less comfortable than expected.' },
      ], 'Room comfort issues affected the stay more than a tiny one-off detail.'),
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

function getTopicDefinition(topic: string): TopicDefinition {
  return TOPIC_DEFINITIONS[topic] ?? {
    key: topic,
    attribute: topic,
    persona_tags: [],
    review_keywords: ATTRIBUTE_KEYWORDS[topic] ?? [],
    supported_evidence_sources: ['reviews', 'hotel_description'],
  };
}

function normalisePersonaTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function getPresetPersonaTag(tag: string): string | null {
  const normalised = normalisePersonaTag(tag);
  return Object.keys(PERSONA_TOPIC_BUNDLES).find(
    candidate => normalisePersonaTag(candidate) === normalised,
  ) ?? null;
}

function getPresetTopicsForTag(tag: string): string[] {
  const exactKey = getPresetPersonaTag(tag);

  return exactKey ? PERSONA_TOPIC_BUNDLES[exactKey] ?? [] : [];
}

function inferTopicsFromCustomTagHeuristics(tag: string): string[] {
  const lower = normalisePersonaTag(tag);
  if (!lower) return [];

  const matchedTopics = new Set<string>();

  for (const [topic, definition] of Object.entries(TOPIC_DEFINITIONS)) {
    const directTerms = new Set<string>([
      topic,
      topic.replace(/_/g, ' '),
      getAttributeLabel(topic).toLowerCase(),
      ...definition.review_keywords,
      ...(definition.hotel_amenities ?? []).map(item => item.replace(/_/g, ' ')),
    ]);

    for (const term of directTerms) {
      const candidate = term.trim().toLowerCase();
      if (!candidate) continue;
      if (lower.includes(candidate) || candidate.includes(lower)) {
        matchedTopics.add(topic);
        break;
      }
    }
  }

  for (const hint of CUSTOM_TAG_TOPIC_HINTS) {
    if (hint.keywords.some(keyword => lower.includes(keyword))) {
      for (const topic of hint.topics) {
        matchedTopics.add(topic);
      }
    }
  }

  return Array.from(matchedTopics);
}

function mergeUniqueStrings(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function parseCustomTagInterpretation(item: unknown): CustomTagInterpretation | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  if (typeof candidate.tag !== 'string') {
    return null;
  }

  const inferredPersonaTags = Array.isArray(candidate.inferred_persona_tags)
    ? candidate.inferred_persona_tags.filter(
        (value): value is string => typeof value === 'string' && Boolean(getPresetPersonaTag(value)),
      )
    : [];
  const inferredTopics = Array.isArray(candidate.inferred_topics)
    ? candidate.inferred_topics.filter(
        (value): value is string => typeof value === 'string' && value in TOPIC_DEFINITIONS,
      )
    : [];

  return {
    tag: candidate.tag,
    inferred_persona_tags: inferredPersonaTags,
    inferred_topics: inferredTopics,
  };
}

async function classifyCustomTags(
  customTags: string[],
): Promise<Map<string, CustomTagInterpretation>> {
  if (customTags.length === 0) {
    return new Map();
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: 'system', content: buildCustomTagClassificationSystemPrompt() },
        {
          role: 'user',
          content: JSON.stringify({ tags: customTags }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return new Map();
    }

    const parsed = JSON.parse(content) as { items?: unknown[] };
    const map = new Map<string, CustomTagInterpretation>();
    for (const rawItem of parsed.items ?? []) {
      const interpretation = parseCustomTagInterpretation(rawItem);
      if (!interpretation) continue;
      map.set(normalisePersonaTag(interpretation.tag), interpretation);
    }
    return map;
  } catch (error) {
    console.warn('[follow-up] custom tag classification failed:', error);
    return new Map();
  }
}

function getTopicsForPersonaTag(
  tag: string,
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): string[] {
  const presetTopics = getPresetTopicsForTag(tag);
  if (presetTopics.length > 0) {
    return presetTopics;
  }

  const customInterpretation = customTagInterpretations.get(normalisePersonaTag(tag));
  const inferredTopicsFromTypes = (customInterpretation?.inferred_persona_tags ?? [])
    .flatMap(inferredTag => getPresetTopicsForTag(inferredTag));

  return mergeUniqueStrings(
    customInterpretation?.inferred_topics ?? [],
    inferredTopicsFromTypes,
    inferTopicsFromCustomTagHeuristics(tag),
  );
}

function getPersonaTopicCounts(
  userTags: string[],
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tag of userTags) {
    for (const topic of getTopicsForPersonaTag(tag, customTagInterpretations)) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return counts;
}

function getMatchingPersonaTagsForTopic(
  topic: string,
  userTags: string[],
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): string[] {
  return userTags.filter(tag => getTopicsForPersonaTag(tag, customTagInterpretations).includes(topic));
}

function getHotelFieldItems(hotel: Hotel, field: keyof Hotel): string[] {
  const value = hotel[field];
  if (!value) return [];

  if (field === 'property_description' || field === 'area_description') {
    return splitDisplaySentences(String(value));
  }

  const htmlItems = parseHtmlItems(value);
  if (htmlItems.length > 0) {
    return htmlItems;
  }

  return parseArrayField(value).flatMap(item => splitDisplaySentences(item));
}

function getHotelTopicTexts(hotel: Hotel, topic: string, gap?: AttributeGap): string[] {
  const definition = getTopicDefinition(topic);
  const items = new Set<string>();

  for (const field of definition.hotel_fields ?? []) {
    for (const item of getHotelFieldItems(hotel, field)) {
      if (item) items.add(item);
    }
  }

  for (const amenity of parseArrayField(hotel.popular_amenities_list)) {
    const amenityKey = amenity.toLowerCase();
    const matchesDefinition = (definition.hotel_amenities ?? []).includes(amenityKey);
    const matchesGap = gap?.amenity_claimed?.toLowerCase() === amenityKey;
    const matchesAttribute = AMENITY_TO_ATTRIBUTE[amenityKey] === topic;
    if (matchesDefinition || matchesGap || matchesAttribute) {
      items.add(AMENITY_LABELS[amenityKey] ?? amenity.replace(/_/g, ' '));
    }
  }

  return Array.from(items);
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

function findHotelClaimSentence(hotel: Hotel, attribute: string, gap?: AttributeGap): string | null {
  const keywords = getTopicDefinition(attribute).review_keywords;

  for (const item of getHotelTopicTexts(hotel, attribute, gap)) {
    if (!containsAny(item.toLowerCase(), keywords)) continue;
    const quote = sanitiseQuote(item);
    if (quote) return quote;
  }

  return null;
}

function hasStructuredHotelClaim(hotel: Hotel, attribute: string, gap?: AttributeGap): boolean {
  const definition = getTopicDefinition(attribute);
  const amenityAttributeMatch = parseArrayField(hotel.popular_amenities_list).some(amenity => {
    const amenityKey = amenity.toLowerCase();
    return (
      AMENITY_TO_ATTRIBUTE[amenityKey] === attribute
      || (definition.hotel_amenities ?? []).includes(amenityKey)
    );
  });

  if (amenityAttributeMatch || Boolean(gap?.amenity_claimed)) {
    return true;
  }

  if (attribute === 'pet_policy' && Boolean(hotel.pet_policy)) {
    return true;
  }

  if (attribute === 'check_in' && Boolean(hotel.check_in_end_time)) {
    return true;
  }

  return (definition.hotel_fields ?? []).some(field => getHotelFieldItems(hotel, field).length > 0);
}

function buildStructuredHotelClaimText(hotel: Hotel, attribute: string, gap?: AttributeGap): string | null {
  if (gap?.amenity_claimed) {
    const amenityClaim = gap.amenity_claimed;
    const amenityLabel = AMENITY_LABELS[amenityClaim.toLowerCase()] ?? amenityClaim.replace(/_/g, ' ');
    return `The hotel lists ${amenityLabel} as an amenity.`;
  }

  if (attribute === 'pet_policy' || attribute === 'pet_fees' || attribute === 'pet_restrictions') {
    return hotel.pet_policy
      ? 'The hotel lists pet-related policies for guests traveling with animals.'
      : null;
  }

  if (attribute === 'check_in' && hotel.check_in_end_time) {
    return `The hotel lists a check-in window ending at ${hotel.check_in_end_time}.`;
  }

  if (attribute === 'extra_bed_policy' && hotel.children_and_extra_bed_policy) {
    return 'The hotel lists policies for extra beds and family sleeping arrangements.';
  }

  if (attribute === 'crib_setup' && hotel.children_and_extra_bed_policy) {
    return 'The hotel lists child sleep setup details, including crib-related policies.';
  }

  if (attribute === 'bathroom_accessibility' && getHotelFieldItems(hotel, 'property_amenity_accessibility').length > 0) {
    return 'The hotel lists accessibility information for bathroom or in-room use.';
  }

  if (attribute === 'elevator_access' && hasStructuredHotelClaim(hotel, attribute, gap)) {
    return 'The hotel lists elevator or step-free access details.';
  }

  if (hasStructuredHotelClaim(hotel, attribute, gap)) {
    return `The hotel lists ${getAttributeLabel(attribute)} as part of the stay experience.`;
  }

  return null;
}

function buildHotelClaimEvidence(hotel: Hotel, attribute: string, gap?: AttributeGap): string | null {
  const sentence = findHotelClaimSentence(hotel, attribute, gap);
  if (sentence) {
    return `The hotel states that "${sentence}"`;
  }

  return buildStructuredHotelClaimText(hotel, attribute, gap);
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

function attributeMattersToUser(
  attribute: string,
  userTags: string[],
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): boolean {
  return getMatchingPersonaTagsForTopic(attribute, userTags, customTagInterpretations).length > 0;
}

function buildAttributeContextSignal(
  hotel: Hotel,
  reviews: Review[],
  attribute: string,
  userTags: string[],
  gap?: AttributeGap,
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): AttributeContextSignal {
  const review_evidence = collectReviewEvidence(reviews, attribute);
  const has_hotel_claim = Boolean(findHotelClaimSentence(hotel, attribute, gap)) || hasStructuredHotelClaim(hotel, attribute, gap);
  const matters_to_user = attributeMattersToUser(attribute, userTags, customTagInterpretations);

  let grounding_score = 0;
  let priority_multiplier = 1;

  if (has_hotel_claim) {
    grounding_score += 1;
    priority_multiplier += HOTEL_CLAIM_PRIORITY_BONUS;
  }

  if (review_evidence.mention_count >= 2) {
    grounding_score += 0.75;
    priority_multiplier += LIGHT_REVIEW_SIGNAL_BONUS;
  }

  if (review_evidence.mention_count >= REVIEW_STAT_MIN_MENTIONS) {
    grounding_score += 0.5;
    priority_multiplier += STRONG_REVIEW_SIGNAL_BONUS;
  }

  if (review_evidence.representative_quote) {
    grounding_score += 0.25;
  }

  if (matters_to_user) {
    grounding_score += 0.35;
    priority_multiplier += PERSONA_GROUNDING_BONUS;
  }

  if (!has_hotel_claim && review_evidence.mention_count === 0 && !matters_to_user) {
    priority_multiplier *= GENERIC_STALE_ATTRIBUTE_PENALTY;
  }

  return {
    review_evidence,
    has_hotel_claim,
    matters_to_user,
    grounding_score,
    priority_multiplier,
  };
}

function getPersonaReasonFragment(
  attribute: string,
  userTags: string[],
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): string {
  const matches = getMatchingPersonaTagsForTopic(attribute, userTags, customTagInterpretations);
  if (matches.length === 0) {
    return 'your travel priorities';
  }

  if (matches.length === 1) {
    return `"${matches[0]}"`;
  }

  return `"${matches[0]}" and similar priorities`;
}

function buildQuestionReason(
  attribute: string,
  gap: AttributeGap | undefined,
  userTags: string[],
  variant: 'main' | 'narrowing' = 'main',
  topicSource: TopicSource = 'persona_only',
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): string {
  if (variant === 'narrowing') {
    if (topicSource === 'intersection' || topicSource === 'review_only') {
      return `You raised possible ${getAttributeLabel(attribute)} friction in your review, so this follow-up narrows down what future guests should know.`;
    }

    return `This follow-up narrows down how ${getAttributeLabel(attribute)} affects travelers with ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)}.`;
  }

  if (topicSource === 'intersection') {
    const freshnessNote = gap?.decay_days
      ? ` Recent reviews have not refreshed it in ${summariseDuration(gap.decay_days)}.`
      : '';
    return `You mentioned ${getAttributeLabel(attribute)} and your profile suggests ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)}, so a fresh signal here helps similar guests.${freshnessNote}`;
  }

  if (topicSource === 'review_only') {
    const freshnessNote = gap?.decay_days
      ? ` Recent reviews have not refreshed it in ${summariseDuration(gap.decay_days)}.`
      : '';
    return `You mentioned ${getAttributeLabel(attribute)} in your review, so clarifying it helps future guests make a better call.${freshnessNote}`;
  }

  if (topicSource === 'blind_spot') {
    return `Travelers with ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)} often care about ${getAttributeLabel(attribute)}, but the hotel's listing has not been well confirmed by recent reviews.`;
  }

  if (gap?.source === 'both' && gap.decay_days && gap.amenity_claimed) {
    return `Travelers with ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)} often care about ${getAttributeLabel(attribute)}, and the hotel advertises it without a fresh review signal in ${summariseDuration(gap.decay_days)}.`;
  }

  if (gap?.source === 'decay' && gap.decay_days) {
    return `You did not mention ${getAttributeLabel(attribute)} directly, but it is a common decision point for travelers with ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)} and reviews have not refreshed it in ${summariseDuration(gap.decay_days)}.`;
  }

  if (gap?.source !== 'decay' && gap?.amenity_claimed) {
    return `You did not mention ${getAttributeLabel(attribute)} directly, but it is a common decision point for travelers with ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)}.`;
  }

  if (attributeMattersToUser(attribute, userTags, customTagInterpretations)) {
    return `You did not mention ${getAttributeLabel(attribute)} directly, but it is a common decision point for travelers with ${getPersonaReasonFragment(attribute, userTags, customTagInterpretations)}.`;
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
function computePriorityScore(
  attribute: string,
  freshness: number,
  userTags: string[],
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): number {
  const riskWeight = RISK_WEIGHTS[attribute] ?? 1;
  const staleness = 1 - freshness;
  const personaMultiplier = userTags.reduce((acc, tag) => {
    return acc + (getTopicsForPersonaTag(tag, customTagInterpretations).includes(attribute) ? 0.3 : 0);
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
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): AttributeGap[] {
  const gapMap = new Map<string, AttributeGap>();
  const contextSignals = new Map<string, AttributeContextSignal>();

  const getContextSignal = (attribute: string, gap?: AttributeGap): AttributeContextSignal => {
    const existing = contextSignals.get(attribute);
    if (existing) return existing;
    const signal = buildAttributeContextSignal(hotel, mergedReviews, attribute, userTags, gap, customTagInterpretations);
    contextSignals.set(attribute, signal);
    return signal;
  };

  // Layer 1 + 3 + 4: decay curve × persona boost × risk weight
  for (const attribute of Object.keys(DECAY_HALF_LIFE_DAYS)) {
    const record = freshnessMap.get(attribute);
    const lastActive = record ? latestDate(record.last_mentioned_at, record.last_confirmed_at) : null;

    const freshness = computeFreshness(lastActive, attribute, today);
    const contextSignal = getContextSignal(attribute);
    const priority = computePriorityScore(attribute, freshness, userTags, customTagInterpretations) * contextSignal.priority_multiplier;

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
      hotel_grounding_score: contextSignal.grounding_score,
      review_mention_count: contextSignal.review_evidence.mention_count,
    });
  }

  // Layer 2: blind spot bonus — merge or add
  for (const bs of runBlindSpotLayer(hotel, mergedReviews)) {
    const contextSignal = getContextSignal(bs.attribute, bs);
    const existing = gapMap.get(bs.attribute);
    if (existing) {
      existing.final_score += bs.raw_score;
      existing.source = 'both';
      existing.amenity_claimed = bs.amenity_claimed;
      existing.hotel_grounding_score = Math.max(existing.hotel_grounding_score ?? 0, contextSignal.grounding_score);
      existing.review_mention_count = contextSignal.review_evidence.mention_count;
    } else {
      gapMap.set(bs.attribute, {
        ...bs,
        final_score: bs.raw_score,
        hotel_grounding_score: contextSignal.grounding_score,
        review_mention_count: contextSignal.review_evidence.mention_count,
      });
    }
  }

  return Array.from(gapMap.values()).sort((a, b) => {
    const scoreDelta = b.final_score - a.final_score;
    if (Math.abs(scoreDelta) > 0.75) {
      return scoreDelta;
    }

    const groundingDelta = (b.hotel_grounding_score ?? 0) - (a.hotel_grounding_score ?? 0);
    if (Math.abs(groundingDelta) > 0.1) {
      return groundingDelta;
    }

    const mentionDelta = (b.review_mention_count ?? 0) - (a.review_mention_count ?? 0);
    if (mentionDelta !== 0) {
      return mentionDelta;
    }

    return scoreDelta;
  });
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
  return Object.entries(TOPIC_DEFINITIONS)
    .map(([attribute, definition]) => {
      const m = sentences.reduce<AttributeMention>(
        (acc, sentence) => {
          if (!containsAny(sentence, definition.review_keywords)) return acc;
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
    case 'work_environment':
      return 'The hotel felt genuinely workable for laptop time, calls, or focused work.';
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
    case 'pet_fees':
      return 'Pet fees felt clear and reasonable before arrival.';
    case 'pet_restrictions':
      return 'The pet rules felt clear and workable in practice.';
    case 'noise':
      return hasAnyTag(userTags, ['Quiet', 'Light sleeper'])
        ? 'The room stayed quiet enough for real rest at night.'
        : 'Noise levels stayed manageable throughout the stay.';
    case 'cleanliness':
      return 'The room felt consistently clean, not just surface-level tidy.';
    case 'accessibility':
      return 'The accessibility setup felt practical and dependable in real use.';
    case 'elevator_access':
      return 'Elevator access felt reliable and easy to use throughout the stay.';
    case 'bathroom_accessibility':
      return 'Bathroom accessibility felt practical and dependable in real use.';
    case 'air_conditioning':
      return 'The room temperature and AC felt easy to manage comfortably.';
    case 'room_comfort':
      return 'The room felt comfortable enough for real rest, not just acceptable on paper.';
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
    case 'extra_bed_policy':
      return 'Extra bed options felt clear and workable for the stay.';
    case 'crib_setup':
      return 'Crib or child sleep setup felt easy to arrange in practice.';
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
    case 'work_environment':
      return 'The hotel did not provide a comfortable working environment.';
    case 'parking': return 'The parking process created avoidable friction.';
    case 'breakfast':
    case 'breakfast_quality': return 'Breakfast felt less dependable than expected.';
    case 'check_in': return 'Check-in felt harder than it should have been.';
    case 'pet_policy': return 'The hotel felt less pet-friendly in practice than it sounded on paper.';
    case 'pet_fees': return 'Pet fees felt more confusing or expensive than expected.';
    case 'pet_restrictions': return 'Pet restrictions made the stay harder to plan.';
    case 'noise':
      return hasAnyTag(userTags, ['Quiet', 'Light sleeper'])
        ? 'The room was not quiet enough for restful sleep.'
        : 'Noise disrupted the stay more than it should have.';
    case 'cleanliness': return 'Cleanliness issues affected the stay in a meaningful way.';
    case 'accessibility': return 'Accessibility gaps created real friction during the stay.';
    case 'elevator_access': return 'Elevator access created real friction during the stay.';
    case 'bathroom_accessibility': return 'Bathroom accessibility made the stay harder than it should have been.';
    case 'air_conditioning': return 'Temperature control was harder than it should have been.';
    case 'room_comfort': return 'Room comfort fell short in a way that affected the stay.';
    case 'safety': return 'The property did not feel as secure as expected.';
    case 'construction': return 'Construction or renovation activity was meaningfully disruptive.';
    case 'extra_bed_policy': return 'The extra bed policy or setup created friction for the stay.';
    case 'crib_setup': return 'Crib or child sleep setup was harder than expected.';
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
  generatedText?: string | null,
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
      prompt: generatedText ?? slider.prompt(userTags),
      left_label: slider.left_label,
      right_label: slider.right_label,
      nlp_hints: slider.nlp_hints,
    };
  }
  return buildAgreementQuestion(
    attribute,
    generatedText ?? (
      mode === 'problem'
        ? buildProblemStatement(attribute, userTags)
        : buildVerificationStatement(attribute, userTags, gap ?? { attribute, raw_score: 0, final_score: 0, source: 'decay' })
    ),
    context,
  );
}

function buildReasonQuestion(
  attribute: string,
  text: string,
  userTags: string[],
  context: QuestionContext,
  generatedText?: string | null,
): FollowUpQuestion {
  if (generatedText) {
    return buildAgreementQuestion(`${attribute}_reason`, generatedText, context);
  }

  const builder = REASON_PROMPTS[attribute];
  if (builder) return builder(text, userTags, context);
  return buildAgreementQuestion(
    `${attribute}_reason`,
    `The problem with ${ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ')} felt persistent, not like a one-off inconvenience.`,
    context,
  );
}

function getQuestionUiType(attribute: string): FollowUpQuestion['ui_type'] {
  return SLIDER_CONFIG[attribute] ? 'Slider' : 'Agreement';
}

function getBlindSpotAmenityClaim(hotel: Hotel, topic: string): string | undefined {
  const definition = getTopicDefinition(topic);
  const amenity = parseArrayField(hotel.popular_amenities_list).find(item => {
    const amenityKey = item.toLowerCase();
    return (
      AMENITY_TO_ATTRIBUTE[amenityKey] === topic
      || (definition.hotel_amenities ?? []).includes(amenityKey)
    );
  });

  if (amenity) return amenity;
  if (topic === 'pet_policy' || topic === 'pet_fees' || topic === 'pet_restrictions') return 'pet_policy';
  if (topic === 'check_in') return 'check_in_window';
  if (topic === 'extra_bed_policy') return 'extra_bed';
  if (topic === 'crib_setup') return 'crib';
  if (topic === 'elevator_access') return 'elevator';
  return undefined;
}

function buildCandidateTopics(
  mentions: AttributeMention[],
  freshnessMap: Map<string, FreshnessRecord>,
  today: Date,
  userTags: string[],
  hotel: Hotel,
  mergedReviews: Review[],
  rankedGaps: AttributeGap[],
  customTagInterpretations: Map<string, CustomTagInterpretation> = new Map(),
): CandidateTopic[] {
  const reviewMentionMap = new Map(mentions.map(mention => [mention.attribute, mention]));
  const personaTopicCounts = getPersonaTopicCounts(userTags, customTagInterpretations);
  const rankedGapMap = new Map(rankedGaps.map(gap => [gap.attribute, gap]));
  const candidateKeys = new Set<string>([
    ...reviewMentionMap.keys(),
    ...personaTopicCounts.keys(),
  ]);

  const candidates: CandidateTopic[] = [];

  for (const topic of candidateKeys) {
    const definition = TOPIC_DEFINITIONS[topic];
    if (!definition) continue;

    const reviewMention = reviewMentionMap.get(topic);
    const personaMatchCount = personaTopicCounts.get(topic) ?? 0;
    const existingGap = rankedGapMap.get(topic);
    const reviewEvidence = collectReviewEvidence(mergedReviews, topic);
    const hotelSupport = Boolean(findHotelClaimSentence(hotel, topic, existingGap)) || hasStructuredHotelClaim(hotel, topic, existingGap);
    const blindSpot = hotelSupport && reviewEvidence.mention_count === 0;
    const record = freshnessMap.get(topic);
    const lastActive = record ? latestDate(record.last_mentioned_at, record.last_confirmed_at) : null;
    const freshness = computeFreshness(lastActive, topic, today);
    const syntheticGap: AttributeGap | undefined = blindSpot
      ? {
          attribute: topic,
          raw_score: 0,
          final_score: 0,
          source: existingGap?.source === 'decay' ? 'both' : 'blind_spot',
          decay_days: lastActive ? Math.floor((today.getTime() - lastActive.getTime()) / 86_400_000) : undefined,
          freshness_score: freshness,
          amenity_claimed: getBlindSpotAmenityClaim(hotel, topic),
        }
      : undefined;
    const gap = existingGap ?? syntheticGap;
    const contextSignal = buildAttributeContextSignal(hotel, mergedReviews, topic, userTags, gap, customTagInterpretations);

    const eligible = Boolean(reviewMention)
      || (personaMatchCount > 0 && (hotelSupport || reviewEvidence.mention_count > 0 || blindSpot));

    if (!eligible) continue;

    const topicSource: TopicSource = reviewMention && personaMatchCount > 0
      ? 'intersection'
      : reviewMention
        ? 'review_only'
        : blindSpot
          ? 'blind_spot'
          : 'persona_only';

    candidates.push({
      topic_key: topic,
      attribute: definition.attribute,
      topic_source: topicSource,
      review_mentions: reviewMention?.mentions ?? 0,
      review_negative_mentions: reviewMention?.negative ?? 0,
      review_positive_mentions: reviewMention?.positive ?? 0,
      persona_match_count: personaMatchCount,
      hotel_grounding_score: contextSignal.grounding_score,
      freshness_score: gap?.freshness_score ?? freshness,
      risk_score: RISK_WEIGHTS[topic] ?? 0,
      blind_spot: blindSpot,
      gap,
    });
  }

  return candidates;
}

function compareCandidateTieBreakers(a: CandidateTopic, b: CandidateTopic): number {
  const groundingDelta = b.hotel_grounding_score - a.hotel_grounding_score;
  if (Math.abs(groundingDelta) > 0.01) return groundingDelta;

  const freshnessDelta = a.freshness_score - b.freshness_score;
  if (Math.abs(freshnessDelta) > 0.01) return freshnessDelta;

  const riskDelta = b.risk_score - a.risk_score;
  if (riskDelta !== 0) return riskDelta;

  const personaDelta = b.persona_match_count - a.persona_match_count;
  if (personaDelta !== 0) return personaDelta;

  return b.review_mentions - a.review_mentions;
}

function getPositiveSourceRank(source: TopicSource): number {
  switch (source) {
    case 'intersection': return 4;
    case 'review_only': return 3;
    case 'blind_spot': return 2;
    case 'persona_only': return 1;
    default: return 0;
  }
}

function getNegativeSourceRank(source: TopicSource): number {
  switch (source) {
    case 'intersection': return 4;
    case 'review_only': return 3;
    case 'blind_spot': return 2;
    case 'persona_only': return 1;
    default: return 0;
  }
}

function selectPositiveCandidates(candidates: CandidateTopic[]): CandidateTopic[] {
  const sorted = [...candidates].sort((a, b) => {
    const sourceDelta = getPositiveSourceRank(b.topic_source) - getPositiveSourceRank(a.topic_source);
    if (sourceDelta !== 0) return sourceDelta;

    const positiveDelta = b.review_positive_mentions - a.review_positive_mentions;
    if (positiveDelta !== 0) return positiveDelta;

    return compareCandidateTieBreakers(a, b);
  });

  const selected: CandidateTopic[] = [];
  const seen = new Set<string>();

  for (const candidate of sorted) {
    if (seen.has(candidate.attribute)) continue;
    if (selected.length === 0) {
      selected.push(candidate);
      seen.add(candidate.attribute);
      continue;
    }

    const supportsPositiveExpansion = candidate.topic_source === 'intersection'
      || candidate.topic_source === 'blind_spot'
      || candidate.topic_source === 'persona_only';

    if (!supportsPositiveExpansion) continue;

    selected.push(candidate);
    seen.add(candidate.attribute);
    if (selected.length === 2) break;
  }

  return selected;
}

function getReviewAnchoredCandidates(candidates: CandidateTopic[]): CandidateTopic[] {
  return candidates.filter(candidate =>
    candidate.topic_source === 'intersection' || candidate.topic_source === 'review_only',
  );
}

function selectNegativeCandidate(candidates: CandidateTopic[]): CandidateTopic | undefined {
  const reviewAnchoredCandidates = getReviewAnchoredCandidates(candidates);
  const directPainCandidates = reviewAnchoredCandidates.filter(candidate =>
    (candidate.topic_source === 'intersection' || candidate.topic_source === 'review_only')
    && candidate.review_negative_mentions > 0,
  );

  if (directPainCandidates.length > 0) {
    return [...directPainCandidates].sort((a, b) => {
      const sourceDelta = getNegativeSourceRank(b.topic_source) - getNegativeSourceRank(a.topic_source);
      if (sourceDelta !== 0) return sourceDelta;
      const negativeDelta = b.review_negative_mentions - a.review_negative_mentions;
      if (negativeDelta !== 0) return negativeDelta;
      return compareCandidateTieBreakers(a, b);
    })[0];
  }

  if (reviewAnchoredCandidates.length > 0) {
    return [...reviewAnchoredCandidates].sort((a, b) => {
      const sourceDelta = getNegativeSourceRank(b.topic_source) - getNegativeSourceRank(a.topic_source);
      if (sourceDelta !== 0) return sourceDelta;
      return compareCandidateTieBreakers(a, b);
    })[0];
  }

  return undefined;
}

function buildGenerationSummary(
  reviewSentiment: ReviewSentiment,
  candidateTopics: CandidateTopic[],
  rankedGaps: AttributeGap[],
  questions: FollowUpQuestion[],
  selectedAttribute?: string,
): string {
  const topCandidates = candidateTopics
    .slice(0, 5)
    .map(candidate => `${candidate.topic_key}:${candidate.topic_source}(ground=${candidate.hotel_grounding_score.toFixed(2)},fresh=${(candidate.freshness_score * 100).toFixed(0)}%,risk=${candidate.risk_score})`)
    .join(', ');
  const top5 = rankedGaps
    .slice(0, 5)
    .map(g => `${g.attribute}:${g.final_score.toFixed(1)}(fresh=${((g.freshness_score ?? 0) * 100).toFixed(0)}%,${g.source})`)
    .join(', ');
  return [
    'generation_mode=deterministic_decay_v2',
    `review_sentiment=${reviewSentiment}`,
    `question_count=${questions.length}`,
    `selected_attribute=${selectedAttribute ?? 'none'}`,
    `candidate_topics=${topCandidates || 'none'}`,
    `ranked_gaps=${top5 || 'none'}`,
  ].join('\n');
}

function sanitizeDynamicQuestionText(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return null;
  const unwrapped =
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const sanitized = unwrapped.length > 220 ? `${unwrapped.slice(0, 217).trimEnd()}...` : unwrapped;
  const lower = sanitized.toLowerCase();
  const bannedPhrases = [
    'were you disappointed',
    'did the lack of',
    'impact your overall satisfaction',
    'affect your overall satisfaction',
    'how did that make you feel',
    'were you upset',
    'did this disappoint you',
  ];

  if (bannedPhrases.some(phrase => lower.includes(phrase))) {
    return null;
  }

  return sanitized;
}

function parseGeneratedQuestionCopy(item: unknown): GeneratedQuestionCopy | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  if (typeof candidate.id !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    primary_text: typeof candidate.primary_text === 'string' ? candidate.primary_text : null,
    narrowing_text: typeof candidate.narrowing_text === 'string' ? candidate.narrowing_text : null,
  };
}

async function generateDynamicQuestionCopy(
  requests: DynamicQuestionCopyRequest[],
): Promise<Map<string, GeneratedQuestionCopy>> {
  if (requests.length === 0) {
    return new Map();
  }

  try {
    const completion = await openai.chat.completions.create({
      model: FOLLOW_UP_GENERATION_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.5,
      messages: [
        { role: 'system', content: FOLLOW_UP_COPY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ items: requests }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return new Map();
    }

    const parsed = JSON.parse(content) as { items?: unknown[] };
    const result = new Map<string, GeneratedQuestionCopy>();

    for (const rawItem of parsed.items ?? []) {
      const item = parseGeneratedQuestionCopy(rawItem);
      if (!item) continue;
      result.set(item.id, {
        id: item.id,
        primary_text: sanitizeDynamicQuestionText(item.primary_text),
        narrowing_text: sanitizeDynamicQuestionText(item.narrowing_text),
      });
    }

    return result;
  } catch (error) {
    console.warn('[follow-up] dynamic question generation failed:', error);
    return new Map();
  }
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
  const customTags = userTags.filter(tag => !getPresetPersonaTag(tag));
  const customTagInterpretations = await classifyCustomTags(customTags);
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
  const rankedGaps = buildRankedGaps(freshnessMap, today, userTags, hotel, mergedReviews, customTagInterpretations);

  // Step D: Generate questions based on review sentiment.
  const reviewSentiment = detectReviewSentiment(currentReview);
  const mentions = detectAttributeMentions(reviewText);
  const candidateTopics = buildCandidateTopics(
    mentions,
    freshnessMap,
    today,
    userTags,
    hotel,
    mergedReviews,
    rankedGaps,
    customTagInterpretations,
  );

  if (candidateTopics.length === 0) {
    return {
      review_id,
      property_id,
      questions: [],
      llm_prompt: buildGenerationSummary(reviewSentiment, [], rankedGaps, [], undefined),
    };
  }

  let questions: FollowUpQuestion[] = [];
  let selectedAttribute: string | undefined;

  if (reviewSentiment === 'positive') {
    const positiveCandidates = selectPositiveCandidates(candidateTopics);
    if (positiveCandidates.length > 0) {
      selectedAttribute = positiveCandidates[0].attribute;
      const dynamicCopy = await generateDynamicQuestionCopy(
        positiveCandidates.map(candidate => ({
          id: `${candidate.attribute}:primary`,
          attribute: candidate.attribute,
          ui_type: getQuestionUiType(candidate.attribute),
          path: 'positive_primary',
          topic_source: candidate.topic_source,
          review_sentiment: reviewSentiment,
          user_tags: userTags,
          submitted_review: reviewText,
          evidence_text: buildEvidenceText(hotel, mergedReviews, candidate.attribute, candidate.gap),
          reason: buildQuestionReason(candidate.attribute, candidate.gap, userTags, 'main', candidate.topic_source, customTagInterpretations),
          review_mentions: candidate.review_mentions,
          review_negative_mentions: candidate.review_negative_mentions,
        })),
      );

      questions = positiveCandidates.map(candidate => {
        const evidenceText = buildEvidenceText(hotel, mergedReviews, candidate.attribute, candidate.gap);
        const reasonText = buildQuestionReason(candidate.attribute, candidate.gap, userTags, 'main', candidate.topic_source, customTagInterpretations);
        const context = {
          evidence_text: evidenceText,
          reason: reasonText,
        };
        const generated = dynamicCopy.get(`${candidate.attribute}:primary`)?.primary_text ?? null;
        return buildPrimaryQuestion(candidate.attribute, userTags, 'verification', context, candidate.gap, generated);
      });
    }
  } else {
    const selectedCandidate = selectNegativeCandidate(candidateTopics);
    if (selectedCandidate) {
      selectedAttribute = selectedCandidate.attribute;
      const evidenceText = buildEvidenceText(hotel, mergedReviews, selectedCandidate.attribute, selectedCandidate.gap);
      const mainReason = buildQuestionReason(selectedCandidate.attribute, selectedCandidate.gap, userTags, 'main', selectedCandidate.topic_source, customTagInterpretations);
      const narrowingReason = buildQuestionReason(selectedCandidate.attribute, selectedCandidate.gap, userTags, 'narrowing', selectedCandidate.topic_source, customTagInterpretations);
      const shouldAskNarrowingQuestion = selectedCandidate.review_negative_mentions > 0
        || selectedCandidate.review_mentions > 1
        || selectedCandidate.topic_source === 'intersection';

      const dynamicRequests: DynamicQuestionCopyRequest[] = [
        {
          id: `${selectedCandidate.attribute}:primary`,
          attribute: selectedCandidate.attribute,
          ui_type: getQuestionUiType(selectedCandidate.attribute),
          path: 'negative_primary',
          topic_source: selectedCandidate.topic_source,
          review_sentiment: reviewSentiment,
          user_tags: userTags,
          submitted_review: reviewText,
          evidence_text: evidenceText,
          reason: mainReason,
          review_mentions: selectedCandidate.review_mentions,
          review_negative_mentions: selectedCandidate.review_negative_mentions,
        },
      ];

      if (shouldAskNarrowingQuestion) {
        dynamicRequests.push({
          id: `${selectedCandidate.attribute}:narrowing`,
          attribute: selectedCandidate.attribute,
          ui_type: 'Agreement',
          path: 'negative_narrowing',
          topic_source: selectedCandidate.topic_source,
          review_sentiment: reviewSentiment,
          user_tags: userTags,
          submitted_review: reviewText,
          evidence_text: evidenceText,
          reason: narrowingReason,
          review_mentions: selectedCandidate.review_mentions,
          review_negative_mentions: selectedCandidate.review_negative_mentions,
        });
      }

      const dynamicCopy = await generateDynamicQuestionCopy(dynamicRequests);

      const mainContext = {
        evidence_text: evidenceText,
        reason: mainReason,
      };
      const reasonContext = {
        evidence_text: evidenceText,
        reason: narrowingReason,
      };
      questions = [
        buildPrimaryQuestion(
          selectedCandidate.attribute,
          userTags,
          'problem',
          mainContext,
          selectedCandidate.gap,
          dynamicCopy.get(`${selectedCandidate.attribute}:primary`)?.primary_text ?? null,
        ),
      ];

      if (shouldAskNarrowingQuestion) {
        questions.push(
          buildReasonQuestion(
            selectedCandidate.attribute,
            reviewText,
            userTags,
            reasonContext,
            dynamicCopy.get(`${selectedCandidate.attribute}:narrowing`)?.narrowing_text
              ?? dynamicCopy.get(`${selectedCandidate.attribute}:narrowing`)?.primary_text
              ?? null,
          ),
        );
      }
    }
  }

  return {
    review_id,
    property_id,
    questions,
    llm_prompt: buildGenerationSummary(reviewSentiment, candidateTopics, rankedGaps, questions, selectedAttribute),
  };
}
