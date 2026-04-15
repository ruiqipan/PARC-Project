/**
 * 4-Layer Follow-Up Question Recommendation Engine
 *
 * Layer 1 — Property Memory Decay:   Finds attributes not mentioned in recent reviews.
 * Layer 2 — Blind Spot Detector:     Finds hotel claims unverified by any reviewer.
 * Layer 3 — Persona Matching:        Boosts gaps relevant to the submitting user's tags.
 * Layer 4 — Decision-Risk Ranking:   Final sort by booking deal-breaker weight → top 1–2.
 *
 * Output is fed to an LLM that formats the gaps as "Statements for Confirmation".
 */

import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabase';
import { parseArrayField } from '@/lib/utils';
import type {
  Hotel,
  Review,
  UserPersona,
  FollowUpQuestion,
  FollowUpEngineResponse,
  NlpHint,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttributeGap {
  attribute: string;
  /** Cumulative score before risk weighting. */
  raw_score: number;
  /** Final score after Layer 4 risk multiplication. */
  final_score: number;
  source: 'decay' | 'blind_spot' | 'both';
  decay_days?: number;
  amenity_claimed?: string;
}

// ─── Attribute Vocabulary ─────────────────────────────────────────────────────
//
// Each key is a canonical attribute name used throughout the engine.
// Values are keyword lists matched (case-insensitively, substring) against review text.

const ATTRIBUTE_KEYWORDS: Record<string, string[]> = {
  parking:         ['parking', 'garage', 'valet', 'car park', 'parked'],
  breakfast:       ['breakfast', 'morning meal', 'buffet', 'continental', 'brunch'],
  wifi:            ['wifi', 'wi-fi', 'internet', 'wireless', 'connection speed', 'bandwidth'],
  pet_policy:      ['dog', 'pet', 'animal', 'cat', 'puppy', 'leash', 'pet-friendly', 'pet friendly'],
  check_in:        ['check-in', 'check in', 'check out', 'checkout', 'arrival', 'late arrival', 'front desk', 'reception'],
  safety:          ['safe', 'safety', 'security', 'secure', 'lock', 'keycard', 'emergency'],
  pool:            ['pool', 'swimming', 'swim', 'hot tub', 'jacuzzi', 'heated pool'],
  gym:             ['gym', 'fitness', 'workout', 'exercise', 'treadmill', 'weights'],
  noise:           ['quiet', 'noise', 'noisy', 'loud', 'soundproof', 'silent', 'disturb'],
  cleanliness:     ['clean', 'dirty', 'hygiene', 'spotless', 'stain', 'dusty', 'smell', 'odor'],
  transit:         ['subway', 'metro', 'bus', 'train', 'station', 'transit', 'walk to', 'walkable'],
  accessibility:   ['wheelchair', 'accessible', 'elevator', 'disabled', 'ramp', 'mobility', 'ada'],
  air_conditioning:['ac', 'air conditioning', 'air-conditioning', 'hvac', 'cooling', 'thermostat'],
  construction:    ['construction', 'renovation', 'drilling', 'building work', 'scaffolding'],
  breakfast_quality:['eggs', 'pastry', 'coffee quality', 'breakfast selection', 'buffet variety'],
};

// ─── Layer 1: Decay Configuration ─────────────────────────────────────────────
//
// How quickly (in days) each attribute's information becomes unreliable.
// Volatile attributes (parking rates, construction) decay in days.
// Stable attributes (transit distance) decay over months.

const DECAY_THRESHOLD_DAYS: Record<string, number> = {
  parking:           30,
  breakfast:         14,
  wifi:              30,
  pet_policy:        90,
  check_in:          60,
  safety:            90,
  pool:              45,
  gym:               60,
  noise:             60,
  cleanliness:        7,
  transit:          365,
  accessibility:    180,
  air_conditioning:  90,
  construction:       7,
  breakfast_quality: 14,
};

// ─── Layer 2: Blind Spot Mapping ──────────────────────────────────────────────
//
// Maps amenity keys from Description_PROC.popular_amenities_list to canonical attributes.

const AMENITY_TO_ATTRIBUTE: Record<string, string> = {
  free_parking:        'parking',
  breakfast_available: 'breakfast',
  breakfast_included:  'breakfast',
  internet:            'wifi',
  pool:                'pool',
  kids_pool:           'pool',
  fitness_equipment:   'gym',
  soundproof_room:     'noise',
  no_smoking:          'safety',
  frontdesk_24_hour:   'check_in',
  hot_tub:             'pool',
  spa:                 'gym',
  ac:                  'air_conditioning',
};

// ─── Layer 3: Persona Relevance ───────────────────────────────────────────────
//
// Maps user persona tags (from User_Personas.tags) to the attributes that matter
// most to them. Semantic matching: "Quiet" and "Sleep Quality" both map to noise.

const PERSONA_ATTRIBUTES: Record<string, string[]> = {
  'Business traveler': ['wifi', 'check_in', 'parking', 'noise'],
  'Convention attendee': ['wifi', 'check_in', 'parking', 'noise'],
  'Digital nomad': ['wifi', 'check_in', 'parking', 'noise'],
  'Remote worker': ['wifi', 'check_in', 'parking', 'noise'],
  'Fast WiFi': ['wifi', 'check_in', 'parking', 'noise'],
  'Long-stay traveler': ['wifi', 'cleanliness', 'air_conditioning', 'check_in'],

  'Backpacker': ['parking', 'breakfast', 'wifi'],
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
  'Families': ['pool', 'breakfast', 'safety', 'noise', 'check_in'],

  'Pet owner': ['pet_policy'],
  'Guide dog owner': ['pet_policy', 'accessibility'],

  'Wheelchair user': ['accessibility', 'check_in', 'safety'],
  'Mobility aid user': ['accessibility', 'check_in', 'safety'],
  'Visual impairment': ['accessibility', 'check_in', 'safety'],
  'Hearing impairment': ['accessibility', 'check_in', 'safety'],
  'Step-free access needed': ['accessibility', 'check_in', 'safety'],
  'Elevator access needed': ['accessibility', 'check_in', 'safety'],
  'Accessible bathroom needed': ['accessibility', 'check_in', 'safety'],

  'Neurodivergent': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Sensory-sensitive': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Light sleeper': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Quiet': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Strong AC': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Air quality sensitive': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],
  'Fragrance-sensitive': ['noise', 'air_conditioning', 'cleanliness', 'accessibility'],

  'Safety-conscious': ['safety', 'check_in'],
  'Cleanliness-focused': ['cleanliness', 'safety'],
  'Chronic illness': ['cleanliness', 'safety'],

  'Tourist': ['transit', 'noise', 'breakfast'],
  'Weekend getaway': ['transit', 'noise', 'breakfast'],
  'Event traveler': ['transit', 'noise', 'breakfast'],
  'Adventure traveler': ['transit', 'noise', 'breakfast'],
  'Culture enthusiast': ['transit', 'noise', 'breakfast'],

  'Road tripper': ['parking', 'check_in'],
  'Parking needed': ['parking', 'check_in'],
  'Transit-first': ['transit', 'noise'],
  'Walkable area': ['transit', 'noise'],

  'Breakfast-first': ['breakfast', 'breakfast_quality'],
  'Foodie': ['breakfast', 'breakfast_quality'],
  'Dietary restrictions': ['breakfast', 'breakfast_quality'],

  // The engine has no room-size attribute yet, so bias toward general room quality signals.
  'Spacious room': ['cleanliness', 'air_conditioning'],

  'Solo traveler': ['safety', 'noise', 'check_in'],
  'Eco-conscious': ['transit'],
};

// ─── Layer 4: Deal-Breaker Risk Weights ───────────────────────────────────────
//
// Final multiplier applied to each gap's score. Safety and accessibility are
// booking deal-breakers. Minor amenities (coffee brand) score near 1.

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

// ─── LLM Configuration ────────────────────────────────────────────────────────

/** Slider attributes and their human-readable pole labels. */
const SLIDER_SCALES: Record<string, { left: string; right: string }> = {
  noise:            { left: 'Very Quiet', right: 'Very Noisy' },
  wifi:             { left: 'Slow / Unreliable', right: 'Fast & Reliable' },
  breakfast_quality:{ left: 'Disappointing', right: 'Excellent' },
  cleanliness:      { left: 'Needs Improvement', right: 'Spotless' },
  air_conditioning: { left: 'Ineffective', right: 'Works Perfectly' },
  pool:             { left: 'Below Expectations', right: 'Exceeded Expectations' },
  gym:              { left: 'Basic / Limited', right: 'Well-Equipped' },
  transit:          { left: 'Inconvenient', right: 'Very Convenient' },
};

/** Agreement-axis attributes use a standard Disagree → Agree scale. */
const AGREEMENT_SCALE: NlpHint[] = [];

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Layer 1: Scan reviews for each attribute. Flag attributes whose most recent
 * mention is older than the decay threshold.
 */
function runDecayLayer(reviews: Review[], today: Date): AttributeGap[] {
  const gaps: AttributeGap[] = [];

  for (const [attr, keywords] of Object.entries(ATTRIBUTE_KEYWORDS)) {
    const threshold = DECAY_THRESHOLD_DAYS[attr];
    if (!threshold) continue;

    // Find the most recent review that mentions this attribute.
    let lastMentionDate: Date | null = null;
    for (const review of reviews) {
      const text = `${review.review_title ?? ''} ${review.review_text ?? ''}`.toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        const d = review.acquisition_date ? new Date(review.acquisition_date) : null;
        if (d && (!lastMentionDate || d > lastMentionDate)) {
          lastMentionDate = d;
        }
      }
    }

    const daysSince = lastMentionDate
      ? Math.floor((today.getTime() - lastMentionDate.getTime()) / 86_400_000)
      : Infinity;

    if (daysSince > threshold) {
      // Score = how many decay-cycles have elapsed (capped at 5 to avoid domination).
      const raw_score = Math.min(daysSince === Infinity ? 5 : daysSince / threshold, 5);
      gaps.push({
        attribute: attr,
        raw_score,
        final_score: 0,
        source: 'decay',
        decay_days: isFinite(daysSince) ? daysSince : undefined,
      });
    }
  }

  return gaps;
}

/**
 * Layer 2: For each amenity the hotel officially claims, check whether ANY review
 * in the corpus actually confirms it. Unconfirmed claims are blind spots.
 */
function runBlindSpotLayer(hotel: Hotel, reviews: Review[]): AttributeGap[] {
  const gaps: AttributeGap[] = [];

  // Build a single lowercase corpus from all reviews for fast searching.
  const corpus = reviews
    .map(r => `${r.review_title ?? ''} ${r.review_text ?? ''}`)
    .join(' ')
    .toLowerCase();

  const amenities = parseArrayField(hotel.popular_amenities_list);

  for (const amenity of amenities) {
    const attribute = AMENITY_TO_ATTRIBUTE[amenity.toLowerCase()];
    if (!attribute) continue;

    const keywords = ATTRIBUTE_KEYWORDS[attribute] ?? [];
    const isVerified = keywords.some(kw => corpus.includes(kw));

    if (!isVerified) {
      gaps.push({
        attribute,
        raw_score: 3,  // Flat blind-spot score; risk weight + persona do the ranking.
        final_score: 0,
        source: 'blind_spot',
        amenity_claimed: amenity,
      });
    }
  }

  // Also flag unverified pet_policy when the hotel has an explicit policy doc.
  if (hotel.pet_policy) {
    const kws = ATTRIBUTE_KEYWORDS.pet_policy ?? [];
    if (!kws.some(kw => corpus.includes(kw)) && !gaps.find(g => g.attribute === 'pet_policy')) {
      gaps.push({ attribute: 'pet_policy', raw_score: 3, final_score: 0, source: 'blind_spot', amenity_claimed: 'pet_policy' });
    }
  }

  // Flag unverified late check-in when the hotel lists a specific check-in window.
  if (hotel.check_in_end_time) {
    const kws = ATTRIBUTE_KEYWORDS.check_in ?? [];
    if (!kws.some(kw => corpus.includes(kw)) && !gaps.find(g => g.attribute === 'check_in')) {
      gaps.push({ attribute: 'check_in', raw_score: 3, final_score: 0, source: 'blind_spot', amenity_claimed: 'check_in_window' });
    }
  }

  return gaps;
}

/**
 * Layer 3: Boost gap scores for attributes that directly matter to the user's
 * persona. Exact tag match OR semantic cluster match (Quiet → noise).
 */
function applyPersonaBoost(gaps: AttributeGap[], userTags: string[]): AttributeGap[] {
  const normalised = userTags.map(t => t.trim());

  return gaps.map(gap => {
    let boost = 0;
    for (const tag of normalised) {
      // Exact lookup in PERSONA_ATTRIBUTES table.
      const relevant = PERSONA_ATTRIBUTES[tag] ?? [];
      if (relevant.includes(gap.attribute)) {
        boost += 2;
      }
    }
    return { ...gap, raw_score: gap.raw_score + boost };
  });
}

/**
 * Layer 4: Merge duplicates (same attribute appearing in both decay and
 * blind-spot lists), apply deal-breaker risk weights, and return the top 2.
 */
function rankByRisk(gaps: AttributeGap[]): AttributeGap[] {
  // Merge: if the same attribute appears in multiple gap lists, combine scores.
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
    } else {
      merged.set(gap.attribute, { ...gap });
    }
  }

  // Apply risk weights and sort descending.
  const ranked = Array.from(merged.values())
    .map(gap => ({
      ...gap,
      final_score: gap.raw_score * (RISK_WEIGHTS[gap.attribute] ?? 1),
    }))
    .sort((a, b) => b.final_score - a.final_score);

  return ranked.slice(0, 2);
}

// ─── LLM Prompt Builder ───────────────────────────────────────────────────────

function buildLlmPrompt(
  propertyId: string,
  hotel: Hotel,
  userTags: string[],
  topGaps: AttributeGap[],
): string {
  const gapDescriptions = topGaps
    .map((g, i) => {
      const decay = g.decay_days != null
        ? `Last mentioned ${g.decay_days} days ago.`
        : 'Never confirmed in reviews.';
      const claimed = g.amenity_claimed
        ? ` Hotel officially claims: "${g.amenity_claimed}".`
        : '';
      return `${i + 1}. Attribute: ${g.attribute} | Source: ${g.source} | ${decay}${claimed} | Risk weight: ${RISK_WEIGHTS[g.attribute] ?? 1}/10`;
    })
    .join('\n');

  const personaTags = userTags.length > 0 ? userTags.join(', ') : 'No tags (general traveler)';

  return `You are a hotel review analytics assistant generating micro-survey follow-up questions.

A guest just submitted a review for hotel property "${propertyId}" (${hotel.city ?? 'unknown city'}, ${hotel.country ?? 'unknown country'}).

GUEST PERSONA TAGS: ${personaTags}

INFORMATION GAPS (ranked by priority):
${gapDescriptions}

Your task: Generate exactly ${topGaps.length} "Statement${topGaps.length > 1 ? 's' : ''} for Confirmation" — one per gap — formatted as a JSON object.

Rules:
- Each statement must be confirmable from the guest's direct experience at this hotel.
- Use "Agreement" ui_type for binary/directional validations (e.g. dog-friendliness, late check-in).
- Use "Slider" ui_type for degree/spectrum attributes (e.g. noise level, wifi speed, cleanliness).
- Statements must be specific and low-friction — the guest taps once to confirm, not write an essay.
- Do NOT invent facts. Only reference the gap attributes provided above.
- Tailor the phrasing to the guest's persona tags where relevant.

Respond with ONLY valid JSON matching this exact schema (no markdown fences):
{
  "questions": [
    {
      "ui_type": "Agreement" | "Slider",
      "feature_name": "<short attribute key, e.g. WiFi>",
      "statement": "<for Agreement: the statement to validate>",
      "prompt": "<for Slider: the question above the slider>",
      "left_label": "<for Slider: left/low pole label>",
      "right_label": "<for Slider: right/high pole label>",
      "nlp_hints": [
        { "keywords": ["word1", "word2"], "direction": "left" | "right" }
      ]
    }
  ]
}

For Agreement questions, omit prompt/left_label/right_label fields.
For Slider questions, omit statement field.`;
}

// ─── LLM Call ─────────────────────────────────────────────────────────────────

/** Parse and validate the LLM JSON output into FollowUpQuestion objects. */
function parseLlmOutput(raw: string): FollowUpQuestion[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.questions)) {
    throw new Error('LLM response missing "questions" array');
  }
  // Trust the LLM output shape — the zod-style validation is skipped to keep
  // this dependency-free. The route handler catches parse errors and falls back.
  return parsed.questions as FollowUpQuestion[];
}

/** Deterministic fallback: build a simple question from a gap without LLM. */
function buildFallbackQuestion(gap: AttributeGap): FollowUpQuestion {
  if (SLIDER_SCALES[gap.attribute]) {
    const scale = SLIDER_SCALES[gap.attribute];
    return {
      ui_type: 'Slider',
      feature_name: gap.attribute.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      prompt: `How would you rate the ${gap.attribute.replace(/_/g, ' ')} at this hotel?`,
      left_label: scale.left,
      right_label: scale.right,
      nlp_hints: [],
    };
  }
  return {
    ui_type: 'Agreement',
    feature_name: gap.attribute.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    statement: `This hotel handles ${gap.attribute.replace(/_/g, ' ')} well`,
    nlp_hints: [],
  };
}

async function callLlm(prompt: string): Promise<FollowUpQuestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.4,  // Low temp: consistent, non-hallucinated phrasing.
    messages: [
      {
        role: 'system',
        content: 'You are a hotel review analytics assistant. Respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty content');

  return parseLlmOutput(content);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EngineInput {
  review_id: string;
  property_id: string;
  user_id: string;
}

/**
 * Execute the full 4-layer pipeline and return the follow-up payload.
 *
 * All DB reads use the service-role client (server-only). The function is
 * intentionally decoupled from the Route Handler for testability.
 */
export async function runFollowUpEngine(input: EngineInput): Promise<FollowUpEngineResponse> {
  const { review_id, property_id, user_id } = input;
  const supabase = createServerClient();
  const today = new Date();

  // ── Fetch all required data in parallel ──────────────────────────────────

  const [
    { data: hotelData, error: hotelError },
    { data: reviewsData },
    { data: personaData },
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
      .from('User_Personas')
      .select('tags, categories')
      .eq('user_id', user_id)
      .maybeSingle(),
  ]);

  if (hotelError || !hotelData) {
    throw new Error(`Property "${property_id}" not found in Description_PROC`);
  }

  const hotel = hotelData as Hotel;
  const reviews = (reviewsData ?? []) as Review[];
  const userTags: string[] = (personaData as UserPersona | null)?.tags ?? [];

  // ── Run the 4-layer funnel ────────────────────────────────────────────────

  // Layer 1: Decay
  const decayGaps = runDecayLayer(reviews, today);

  // Layer 2: Blind spots
  const blindSpotGaps = runBlindSpotLayer(hotel, reviews);

  // Layer 3: Persona boost (applied to combined candidate list)
  const allGaps = applyPersonaBoost([...decayGaps, ...blindSpotGaps], userTags);

  // Layer 4: Risk ranking → top 1–2
  const topGaps = rankByRisk(allGaps);

  if (topGaps.length === 0) {
    // Unlikely but possible for a hotel with exhaustive recent reviews and no claims.
    return {
      review_id,
      property_id,
      questions: [],
      llm_prompt: '(no gaps identified — pipeline returned empty)',
    };
  }

  // ── LLM formatting ────────────────────────────────────────────────────────

  const llm_prompt = buildLlmPrompt(property_id, hotel, userTags, topGaps);

  let questions: FollowUpQuestion[];
  try {
    questions = await callLlm(llm_prompt);
  } catch {
    // Graceful fallback: produce deterministic questions from the gap metadata
    // so the UI is never left empty due to an LLM outage.
    questions = topGaps.map(buildFallbackQuestion);
  }

  return { review_id, property_id, questions, llm_prompt };
}
