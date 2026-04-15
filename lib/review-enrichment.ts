import 'server-only';

import { createHash } from 'node:crypto';
import type { Review, ReviewSourceType } from '@/types';

export const REVIEW_ENRICHMENT_MODEL = 'gpt-5-nano';

export const ALLOWED_AI_REVIEW_TAGS = [
  'Accessibility',
  'Adventure traveler',
  'Breakfast',
  'Budget',
  'Business services',
  'Business traveler',
  'Check-in',
  'Cleanliness',
  'Communication',
  'Couple traveler',
  'Dog friendly',
  'Eco-friendly',
  'Family',
  'Family traveler',
  'Fast WiFi',
  'Foodie',
  'Gym',
  'Kids',
  'Leisure',
  'Location',
  'Luxury',
  'Neighborhood',
  'Parking',
  'Pet owner',
  'Pool',
  'Quiet',
  'Relaxation',
  'Service',
  'Tourist',
  'Value for money',
  'Vacation',
  'WiFi',
] as const;

export type AllowedAiReviewTag = (typeof ALLOWED_AI_REVIEW_TAGS)[number];

const CANONICAL_TAG_LOOKUP = new Map<string, AllowedAiReviewTag>(
  ALLOWED_AI_REVIEW_TAGS.map(tag => [tag.toLowerCase(), tag])
);

const AI_REVIEW_TAG_ALIASES: Record<string, AllowedAiReviewTag> = {
  accessibility: 'Accessibility',
  accessible: 'Accessibility',
  adventure: 'Adventure traveler',
  adventurer: 'Adventure traveler',
  breakfast: 'Breakfast',
  budget: 'Budget',
  affordable: 'Budget',
  business: 'Business traveler',
  work: 'Business traveler',
  coworking: 'Business services',
  workspace: 'Business services',
  desk: 'Business services',
  conference: 'Business services',
  checkin: 'Check-in',
  'check-in': 'Check-in',
  cleanliness: 'Cleanliness',
  clean: 'Cleanliness',
  communication: 'Communication',
  communicative: 'Communication',
  couple: 'Couple traveler',
  couples: 'Couple traveler',
  dog: 'Dog friendly',
  dogs: 'Dog friendly',
  eco: 'Eco-friendly',
  sustainable: 'Eco-friendly',
  family: 'Family',
  families: 'Family',
  kids: 'Kids',
  children: 'Kids',
  'family traveler': 'Family traveler',
  'fast wifi': 'Fast WiFi',
  wifi: 'WiFi',
  'wi-fi': 'WiFi',
  internet: 'WiFi',
  foodie: 'Foodie',
  dining: 'Foodie',
  restaurant: 'Foodie',
  restaurants: 'Foodie',
  food: 'Foodie',
  gym: 'Gym',
  fitness: 'Gym',
  leisure: 'Leisure',
  location: 'Location',
  luxury: 'Luxury',
  neighborhood: 'Neighborhood',
  neighbourhood: 'Neighborhood',
  parking: 'Parking',
  pet: 'Pet owner',
  pets: 'Pet owner',
  pool: 'Pool',
  quiet: 'Quiet',
  peaceful: 'Quiet',
  relaxation: 'Relaxation',
  relaxing: 'Relaxation',
  service: 'Service',
  staff: 'Service',
  tourist: 'Tourist',
  tourism: 'Tourist',
  value: 'Value for money',
  'value for money': 'Value for money',
  vacation: 'Vacation',
};

function normalizeAiReviewTag(tag: string): AllowedAiReviewTag | null {
  const trimmed = tag.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const directMatch = CANONICAL_TAG_LOOKUP.get(lower) ?? AI_REVIEW_TAG_ALIASES[lower];
  if (directMatch) {
    return directMatch;
  }

  if (lower.includes('wifi') || lower.includes('wi-fi')) {
    return lower.includes('fast') ? 'Fast WiFi' : 'WiFi';
  }

  if (lower.includes('business')) {
    return 'Business traveler';
  }

  if (lower.includes('restaurant') || lower.includes('dining') || lower.includes('food')) {
    return 'Foodie';
  }

  if (lower.includes('quiet') || lower.includes('peace')) {
    return 'Quiet';
  }

  if (lower.includes('location') || lower.includes('walkable')) {
    return 'Location';
  }

  if (lower.includes('clean')) {
    return 'Cleanliness';
  }

  if (lower.includes('staff') || lower.includes('service')) {
    return 'Service';
  }

  if (lower.includes('pool')) {
    return 'Pool';
  }

  if (lower.includes('gym') || lower.includes('fitness')) {
    return 'Gym';
  }

  if (lower.includes('family') || lower.includes('kid') || lower.includes('child')) {
    return 'Family traveler';
  }

  return null;
}

export function normalizeAllowedAiReviewTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeAiReviewTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);

    if (result.length >= 3) {
      break;
    }
  }

  return result;
}

function sanitizeReviewSourcePart(value: string | null): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim();
}

export function buildReviewSourceText(reviewTitle: string | null, reviewText: string | null): string {
  return [sanitizeReviewSourcePart(reviewTitle), sanitizeReviewSourcePart(reviewText)]
    .filter(Boolean)
    .join('\n\n');
}

export function computeSourceTextHash(reviewTitle: string | null, reviewText: string | null): string {
  return createHash('sha256')
    .update(buildReviewSourceText(reviewTitle, reviewText))
    .digest('hex');
}

export function buildReviewsProcReviewKey(review: Pick<Review, 'eg_property_id' | 'acquisition_date' | 'lob' | 'review_title' | 'review_text'>): string {
  const raw = [
    'reviews_proc',
    review.eg_property_id ?? '',
    review.acquisition_date ?? '',
    review.lob ?? '',
    review.review_title ?? '',
    review.review_text ?? '',
  ].join('|');

  return createHash('sha256').update(raw).digest('hex');
}

export function buildReviewKey(sourceType: ReviewSourceType, review: Pick<Review, 'review_key' | 'eg_property_id' | 'acquisition_date' | 'lob' | 'review_title' | 'review_text'>): string {
  if (sourceType === 'review_submissions' && review.review_key) {
    return review.review_key;
  }

  return buildReviewsProcReviewKey(review);
}
