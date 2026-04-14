// ─── Core Data Types (mapped from Description_PROC.csv + Reviews_PROC.csv) ───

export interface Hotel {
  id: string;
  eg_property_id: string;
  name: string;
  slug: string;
  city: string;
  province?: string;
  country: string;
  star_rating: number;
  expedia_rating: number;
  area_description?: string;
  property_description?: string;
  popular_amenities_list?: string;
  amenities: string[];
  thumbnail_url?: string;
  price_per_night?: number;
  review_count?: number;
  // Policy fields from Description_PROC
  check_in_start_time?: string;
  check_in_end_time?: string;
  check_out_time?: string;
  check_out_policy?: string;
  pet_policy?: string;
  children_and_extra_bed_policy?: string;
  check_in_instructions?: string;
  know_before_you_go?: string;
}

export interface Review {
  id: string;
  hotel_id: string;
  eg_property_id: string;
  reviewer_name?: string;
  traveler_persona?: TravelerPersona;
  rating: number;
  review_title?: string;
  review_text: string;
  acquisition_date: string;
  lob?: string;
  helpful_count?: number;
}

export interface Room {
  id: string;
  hotel_id: string;
  name: string;
  type: 'king' | 'twin' | 'family' | 'accessible' | 'suite' | 'standard';
  capacity: number;
  price_per_night?: number;
  amenities: string[];
  image_url?: string;
  description?: string;
}

// ─── Question / Recommendation System ────────────────────────────────────────

export type GapType = 'missing' | 'conflicting' | 'stale' | 'periodic' | 'complaint_followup';
export type TravelerPersona = 'business' | 'family' | 'solo' | 'couple' | 'car' | 'accessibility';
export type AnswerType = 'good' | 'bad' | 'unknown';
export type VoteType = 'up' | 'down';

export interface Gap {
  topic: string;
  gap_type: GapType;
  confidence_score: number;
  evidence: string;
}

export interface Question {
  id: string;
  hotel_id: string;
  room_type_id?: string;
  topic: string;
  gap_type: GapType;
  question_text: string;
  target_personas: TravelerPersona[];
  confidence_score: number;
  upvotes: number;
  downvotes: number;
  response_count: number;
  is_active: boolean;
  created_at?: string;
}

export interface GeneratedQuestion {
  text: string;
  topic: string;
  gap_type: GapType;
  selection_case: 'A' | 'B' | 'C';
  why_this_user: string;
}

// ─── User Session ─────────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  persona: TravelerPersona;
  special_needs: string[];
  created_at?: string;
}

// ─── Structured Insight (output after answering) ─────────────────────────────

export interface PropertyInsight {
  topic: string;
  label: string;
  good_count: number;
  bad_count: number;
  unknown_count: number;
  latest_response: AnswerType;
  summary: string;
}
