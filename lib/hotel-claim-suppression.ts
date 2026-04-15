import type { Hotel, Review } from '@/types';
import { parseArrayField, stripHtml } from '@/lib/utils';

export type HotelClaimKey =
  | 'internet'
  | 'free_parking'
  | 'breakfast'
  | 'business_services'
  | 'crib'
  | 'extra_bed'
  | 'elevator'
  | 'pool'
  | 'fitness_equipment'
  | 'spa'
  | 'soundproof_room'
  | 'ac'
  | 'pet_policy';

export interface StoredFollowUpAnswer {
  review_id: string;
  feature_name: string;
  ui_type: 'Slider' | 'Agreement' | 'QuickTag';
  quantitative_value: number | null;
  qualitative_note: string | null;
}

export interface HotelClaimSuppression {
  suppressedClaimKeys: HotelClaimKey[];
}

type Signal = -1 | 0 | 1;

interface ClaimDefinition {
  claim: HotelClaimKey;
  featureNames: string[];
  popularAmenityKeys: string[];
  hotelFields: string[];
  keywords: string[];
  supportTerms: string[];
  contradictTerms: string[];
}

const HIDE_THRESHOLD = 3;

const POSITIVE_SLIDER_FEATURES = new Set([
  'wifi',
  'parking',
  'breakfast',
  'work_environment',
  'pet_policy',
  'extra_bed_policy',
  'crib_setup',
  'elevator_access',
  'bathroom_accessibility',
  'pool',
  'gym',
  'ac',
  'room_comfort',
]);

const CLAIM_DEFINITIONS: ClaimDefinition[] = [
  {
    claim: 'internet',
    featureNames: ['wifi', 'work_environment'],
    popularAmenityKeys: ['internet'],
    hotelFields: ['property_amenity_internet', 'property_amenity_business_services'],
    keywords: ['wifi', 'wi-fi', 'internet', 'connection'],
    supportTerms: ['fast', 'reliable', 'stable', 'strong', 'worked', 'good', 'great', 'excellent', 'free'],
    contradictTerms: ['slow', 'spotty', 'weak', 'bad', 'unreliable', 'broken', 'down', 'did not work', 'didnt work', 'could not connect', 'couldnt connect', 'disconnect'],
  },
  {
    claim: 'free_parking',
    featureNames: ['parking'],
    popularAmenityKeys: ['free_parking'],
    hotelFields: ['property_amenity_parking'],
    keywords: ['parking', 'garage', 'car park', 'carpark'],
    supportTerms: ['easy', 'free', 'convenient', 'simple', 'available', 'plenty', 'ample'],
    contradictTerms: ['hard', 'difficult', 'limited', 'full', 'expensive', 'paid', 'fee', 'crowded', 'no parking'],
  },
  {
    claim: 'breakfast',
    featureNames: ['breakfast'],
    popularAmenityKeys: ['breakfast_available', 'breakfast_included'],
    hotelFields: ['property_amenity_food_and_drink', 'property_amenity_family_friendly'],
    keywords: ['breakfast'],
    supportTerms: ['good', 'great', 'fresh', 'plenty', 'varied', 'tasty', 'complimentary', 'free breakfast', 'breakfast included'],
    contradictTerms: ['bad', 'poor', 'limited', 'cold', 'missing', 'not included', 'no breakfast', 'overpriced', 'had to pay', 'extra charge', 'additional charge', 'not complimentary'],
  },
  {
    claim: 'business_services',
    featureNames: ['work_environment', 'wifi', 'check_in'],
    popularAmenityKeys: ['business_services', 'frontdesk_24_hour'],
    hotelFields: ['property_amenity_business_services', 'property_amenity_internet', 'check_in_instructions'],
    keywords: ['desk', 'workspace', 'work', 'business center', 'cowork', 'laptop'],
    supportTerms: ['quiet', 'comfortable', 'productive', 'easy', 'convenient', 'good', 'great'],
    contradictTerms: ['cramped', 'awkward', 'difficult', 'uncomfortable', 'no desk', 'nowhere to work'],
  },
  {
    claim: 'crib',
    featureNames: ['crib_setup'],
    popularAmenityKeys: ['crib'],
    hotelFields: ['property_amenity_family_friendly', 'children_and_extra_bed_policy'],
    keywords: ['crib', 'cot', 'baby bed'],
    supportTerms: ['available', 'provided', 'ready', 'easy', 'helpful'],
    contradictTerms: ['missing', 'unavailable', 'not available', 'denied', 'broken', 'fee', 'charged'],
  },
  {
    claim: 'extra_bed',
    featureNames: ['extra_bed_policy'],
    popularAmenityKeys: ['extra_bed'],
    hotelFields: ['property_amenity_family_friendly', 'children_and_extra_bed_policy'],
    keywords: ['extra bed', 'rollaway', 'roll away', 'sofa bed'],
    supportTerms: ['available', 'provided', 'easy', 'helpful'],
    contradictTerms: ['not available', 'unavailable', 'denied', 'fee', 'charged', 'missing'],
  },
  {
    claim: 'elevator',
    featureNames: ['elevator_access', 'bathroom_accessibility'],
    popularAmenityKeys: ['elevator'],
    hotelFields: ['property_amenity_accessibility'],
    keywords: ['elevator', 'lift', 'accessible', 'wheelchair', 'step-free', 'step free'],
    supportTerms: ['accessible', 'easy', 'smooth', 'worked', 'convenient'],
    contradictTerms: ['broken', 'stairs', 'not accessible', 'inaccessible', 'difficult', 'no elevator'],
  },
  {
    claim: 'pool',
    featureNames: ['pool'],
    popularAmenityKeys: ['pool', 'kids_pool'],
    hotelFields: ['property_amenity_outdoor', 'property_amenity_things_to_do', 'property_amenity_family_friendly'],
    keywords: ['pool', 'kids pool', 'swim'],
    supportTerms: ['clean', 'warm', 'open', 'great', 'good', 'fun'],
    contradictTerms: ['closed', 'dirty', 'cold', 'crowded', 'small', 'broken'],
  },
  {
    claim: 'fitness_equipment',
    featureNames: ['gym'],
    popularAmenityKeys: ['fitness_equipment'],
    hotelFields: ['property_amenity_spa', 'property_amenity_things_to_do'],
    keywords: ['gym', 'fitness', 'workout'],
    supportTerms: ['good', 'great', 'clean', 'well equipped', 'open'],
    contradictTerms: ['small', 'closed', 'broken', 'limited', 'crowded'],
  },
  {
    claim: 'spa',
    featureNames: ['gym'],
    popularAmenityKeys: ['spa'],
    hotelFields: ['property_amenity_spa'],
    keywords: ['spa', 'sauna', 'steam room'],
    supportTerms: ['good', 'great', 'relaxing', 'clean', 'open'],
    contradictTerms: ['closed', 'dirty', 'broken', 'limited'],
  },
  {
    claim: 'soundproof_room',
    featureNames: ['noise'],
    popularAmenityKeys: ['soundproof_room'],
    hotelFields: ['property_amenity_conveniences', 'property_description'],
    keywords: ['quiet', 'noise', 'noisy', 'soundproof', 'thin walls'],
    supportTerms: ['quiet', 'peaceful', 'silent', 'soundproof'],
    contradictTerms: ['noisy', 'loud', 'thin walls', 'heard everything', 'noise', 'not soundproof'],
  },
  {
    claim: 'ac',
    featureNames: ['ac', 'room_comfort'],
    popularAmenityKeys: ['ac'],
    hotelFields: ['property_amenity_conveniences', 'property_description'],
    keywords: ['ac', 'air conditioning', 'aircon', 'air con'],
    supportTerms: ['cold', 'cool', 'worked', 'great', 'good'],
    contradictTerms: ['hot', 'broken', 'did not work', 'didnt work', 'weak', 'not working'],
  },
  {
    claim: 'pet_policy',
    featureNames: ['pet_policy', 'pet_fees', 'pet_restrictions'],
    popularAmenityKeys: [],
    hotelFields: ['pet_policy'],
    keywords: ['pet', 'dog', 'cat', 'animal', 'service animal', 'guide dog'],
    supportTerms: ['welcoming', 'friendly', 'easy', 'allowed', 'accommodating'],
    contradictTerms: ['fee', 'charged', 'restrictive', 'not allowed', 'unwelcoming', 'difficult'],
  },
];

const CLAIM_BY_POPULAR_AMENITY = new Map(
  CLAIM_DEFINITIONS.flatMap(definition =>
    definition.popularAmenityKeys.map(key => [key, definition.claim] as const),
  ),
);

const CLAIMS_BY_FEATURE = new Map<string, HotelClaimKey[]>();
for (const definition of CLAIM_DEFINITIONS) {
  for (const featureName of definition.featureNames) {
    const existing = CLAIMS_BY_FEATURE.get(featureName) ?? [];
    existing.push(definition.claim);
    CLAIMS_BY_FEATURE.set(featureName, existing);
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map(segment => normalizeText(segment))
    .filter(Boolean);
}

function containsAny(text: string, phrases: string[]): boolean {
  return phrases.some(phrase => text.includes(normalizeText(phrase)));
}

function getHotelFieldItems(hotel: Hotel, fieldKey: string): string[] {
  const value = (hotel as unknown as Record<string, unknown>)[fieldKey];
  if (typeof value === 'string' && !value.trim().startsWith('[')) {
    return [stripHtml(value)];
  }

  return parseArrayField(value).map(item => stripHtml(item));
}

function scoreTextAgainstClaim(text: string, claim: ClaimDefinition): Signal {
  const sentences = splitIntoSentences(text);
  let supportVotes = 0;
  let contradictVotes = 0;

  for (const sentence of sentences) {
    if (!containsAny(sentence, claim.keywords)) {
      continue;
    }

    const supports = containsAny(sentence, claim.supportTerms);
    const contradicts = containsAny(sentence, claim.contradictTerms);

    if (contradicts && !supports) {
      contradictVotes += 1;
      continue;
    }

    if (supports && !contradicts) {
      supportVotes += 1;
      continue;
    }

    if (sentence.includes('not ') || sentence.includes("n't ")) {
      contradictVotes += 1;
    }
  }

  if (contradictVotes > supportVotes) {
    return -1;
  }

  if (supportVotes > contradictVotes) {
    return 1;
  }

  return 0;
}

function stripReasonSuffix(featureName: string): string {
  return featureName.endsWith('_reason') ? featureName.slice(0, -7) : featureName;
}

function getAnswerSignal(answer: StoredFollowUpAnswer, claim: ClaimDefinition): Signal {
  const baseFeatureName = stripReasonSuffix(answer.feature_name);
  if (!claim.featureNames.includes(baseFeatureName)) {
    return 0;
  }

  if (answer.ui_type === 'Agreement' && typeof answer.quantitative_value === 'number') {
    if (answer.quantitative_value >= 4) {
      return 1;
    }
    if (answer.quantitative_value <= 2) {
      return -1;
    }
  }

  if (
    answer.ui_type === 'Slider' &&
    typeof answer.quantitative_value === 'number' &&
    POSITIVE_SLIDER_FEATURES.has(baseFeatureName)
  ) {
    if (answer.quantitative_value >= 0.65) {
      return 1;
    }
    if (answer.quantitative_value <= 0.35) {
      return -1;
    }
  }

  if (answer.qualitative_note) {
    return scoreTextAgainstClaim(answer.qualitative_note, claim);
  }

  return 0;
}

function getSubmissionReviewSignalMap(
  reviews: Review[],
  claim: ClaimDefinition,
): Map<string, Signal> {
  const perReview = new Map<string, Signal>();

  for (const review of reviews) {
    if (review.source_type !== 'review_submissions' || !review.review_key) {
      continue;
    }

    const text = [review.review_title, review.review_text].filter(Boolean).join('. ');
    if (!text) {
      continue;
    }

    const signal = scoreTextAgainstClaim(text, claim);
    if (signal === 0) {
      continue;
    }

    perReview.set(review.review_key, signal);
  }

  return perReview;
}

function getAnswerSignalMap(
  answers: StoredFollowUpAnswer[],
  claim: ClaimDefinition,
): Map<string, number> {
  const perReview = new Map<string, number>();

  for (const answer of answers) {
    const signal = getAnswerSignal(answer, claim);
    if (signal === 0) {
      continue;
    }

    const key = answer.review_id;
    perReview.set(key, (perReview.get(key) ?? 0) + signal);
  }

  return perReview;
}

function countCombinedSignals(
  reviewSignals: Map<string, Signal>,
  answerSignals: Map<string, number>,
): { support: number; contradict: number } {
  const combined = new Map<string, number>();

  for (const [reviewId, signal] of reviewSignals.entries()) {
    combined.set(reviewId, signal);
  }

  for (const [reviewId, signal] of answerSignals.entries()) {
    combined.set(reviewId, (combined.get(reviewId) ?? 0) + signal);
  }

  let support = 0;
  let contradict = 0;

  for (const total of combined.values()) {
    if (total > 0) {
      support += 1;
    } else if (total < 0) {
      contradict += 1;
    }
  }

  return { support, contradict };
}

function shouldHideClaim(support: number, contradict: number): boolean {
  if (contradict < HIDE_THRESHOLD) {
    return false;
  }

  if (support >= HIDE_THRESHOLD && support >= contradict) {
    return false;
  }

  return contradict > support;
}

export function computeHotelClaimSuppression(
  hotel: Hotel,
  reviews: Review[],
  followUpAnswers: StoredFollowUpAnswer[],
): HotelClaimSuppression {
  const listedClaims = new Set<HotelClaimKey>();

  for (const amenityKey of hotel.popular_amenities_list ?? []) {
    const claim = CLAIM_BY_POPULAR_AMENITY.get(amenityKey);
    if (claim) {
      listedClaims.add(claim);
    }
  }

  if (hotel.pet_policy) {
    listedClaims.add('pet_policy');
  }

  if (hotel.children_and_extra_bed_policy) {
    const childrenPolicyText = normalizeText(getHotelFieldItems(hotel, 'children_and_extra_bed_policy').join(' '));
    if (
      (hotel.popular_amenities_list ?? []).includes('crib') ||
      containsAny(childrenPolicyText, ['crib', 'cot', 'baby bed'])
    ) {
      listedClaims.add('crib');
    }
    if (
      (hotel.popular_amenities_list ?? []).includes('extra_bed') ||
      containsAny(childrenPolicyText, ['extra bed', 'rollaway', 'roll away', 'sofa bed'])
    ) {
      listedClaims.add('extra_bed');
    }
  }

  for (const definition of CLAIM_DEFINITIONS) {
    if (listedClaims.has(definition.claim)) {
      continue;
    }

    const isMentionedInHotelFields = definition.hotelFields.some(fieldKey => {
      const fieldText = normalizeText(getHotelFieldItems(hotel, fieldKey).join(' '));
      return fieldText.length > 0 && containsAny(fieldText, definition.keywords);
    });

    if (isMentionedInHotelFields) {
      listedClaims.add(definition.claim);
    }
  }

  const suppressedClaimKeys = CLAIM_DEFINITIONS.filter(definition => {
    if (!listedClaims.has(definition.claim)) {
      return false;
    }

    const reviewSignals = getSubmissionReviewSignalMap(reviews, definition);
    const answerSignals = getAnswerSignalMap(followUpAnswers, definition);
    const { support, contradict } = countCombinedSignals(reviewSignals, answerSignals);

    return shouldHideClaim(support, contradict);
  }).map(definition => definition.claim);

  return { suppressedClaimKeys };
}

export function isPopularAmenitySuppressed(
  amenityKey: string,
  suppression: HotelClaimSuppression,
): boolean {
  const claim = CLAIM_BY_POPULAR_AMENITY.get(amenityKey);
  return claim ? suppression.suppressedClaimKeys.includes(claim) : false;
}

export function filterHotelFieldItems(
  fieldKey: string,
  items: string[],
  suppression: HotelClaimSuppression,
): string[] {
  if (suppression.suppressedClaimKeys.length === 0 || items.length === 0) {
    return items;
  }

  return items.filter(item => {
    const normalizedItem = normalizeText(item);

    return !suppression.suppressedClaimKeys.some(claimKey => {
      const definition = CLAIM_DEFINITIONS.find(candidate => candidate.claim === claimKey);
      if (!definition || !definition.hotelFields.includes(fieldKey)) {
        return false;
      }

      return containsAny(normalizedItem, definition.keywords);
    });
  });
}
