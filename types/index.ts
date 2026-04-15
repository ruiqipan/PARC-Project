// ─── User_Personas ────────────────────────────────────────────────────────────

export interface UserPersona {
  id: string;
  user_id: string;
  username: string;
  tags: string[];
  categories: string[];
  updated_at: string;
}

export type ReviewSourceType = 'reviews_proc' | 'review_submissions';

export interface ReviewEnrichment {
  reviewKey: string;
  generatedTitle: string | null;
  generatedTags: string[];
  titleWasAiGenerated: boolean;
  tagsWereAiGenerated: boolean;
  sourceTextHash: string;
}

// ─── Persona Matching ─────────────────────────────────────────────────────────

/**
 * A single resolved cluster-match between the viewing user's tag and a
 * reviewer's inferred tag.  Used to generate the "Shares your focus" /
 * "Similar preference" badge on each ReviewCard.
 */
export interface PersonaMatch {
  /** Original tag from the viewing user's persona. */
  userTag: string;
  /** Original tag inferred from the reviewer's data (lob / rated dimensions). */
  reviewerTag: string;
  /** Human-readable cluster label, e.g. "Rest & Quiet", "Business Travel". */
  clusterLabel: string;
  /** Internal cluster ID, e.g. "rest", "business". Used to pick badge copy. */
  clusterId: string;
}

// ─── Follow-Up Engine Response ────────────────────────────────────────────────

/** Complete payload returned by POST /api/reviews/follow-up. */
export interface FollowUpEngineResponse {
  review_id: string;
  property_id: string;
  questions: FollowUpQuestion[];
  /** Exact prompt sent to the LLM — included for transparency and debugging. */
  llm_prompt: string;
}

// ─── Follow-Up Question Payload (from 4-Layer Recommendation Engine) ─────────

/**
 * NLP hint: maps a keyword cluster to a directional nudge on the semantic slider.
 * e.g. "bright" → right, "soft" → left.
 */
export interface NlpHint {
  /** Words/phrases that trigger this nudge. Matched case-insensitively. */
  keywords: string[];
  /** Which pole of the slider this sentiment maps to. */
  direction: 'left' | 'right';
}

/** A degree-based question rendered as a continuous slider between two poles. */
export interface SemanticSliderQuestion {
  ui_type: 'Slider';
  /** Machine-readable key stored in FollowUp_Answers.feature_name */
  feature_name: string;
  /** Real-data provenance line shown above the prompt. */
  evidence_text: string | null;
  /** Short explanation of why this question is being asked now. */
  reason: string;
  /** Human-readable prompt shown above the slider */
  prompt: string;
  /** Left-pole label (e.g. "Soft") */
  left_label: string;
  /** Right-pole label (e.g. "Office White") */
  right_label: string;
  /**
   * Keyword clusters used by the NLP bridge to auto-update slider value from
   * voice input. The hook checks each keyword against the transcript and
   * animates the thumb toward the matching pole.
   */
  nlp_hints: NlpHint[];
}

/** A statement-validation question rendered as a 1–5 Disagree→Agree axis. */
export interface AgreementQuestion {
  ui_type: 'Agreement';
  feature_name: string;
  evidence_text: string | null;
  reason: string;
  /**
   * Full statement the user is asked to validate.
   * e.g. "This hotel is very dog friendly"
  */
  statement: string;
  nlp_hints: NlpHint[];
}

/** A multi-select recognition grid of pre-defined option chips. */
export interface QuickTagQuestion {
  ui_type: 'QuickTag';
  feature_name: string;
  evidence_text: string | null;
  reason: string;
  prompt: string;
  /** Pre-defined options the user can tap — no typing required. */
  options: string[];
}

export type FollowUpQuestion =
  | SemanticSliderQuestion
  | AgreementQuestion
  | QuickTagQuestion;

/** A single answered question, written to FollowUp_Answers. */
export interface FollowUpAnswer {
  feature_name: string;
  ui_type: FollowUpQuestion['ui_type'];
  /** Normalised 0–1 value for Slider; 1–5 integer for Agreement; unused for QuickTag. */
  quantitative_value: number | null;
  /** Selected chips (QuickTag) or optional voice/text transcription. */
  qualitative_note: string | null;
}

// ─── Description_PROC ────────────────────────────────────────────────────────

export interface Hotel {
  eg_property_id: string;
  guestrating_avg_expedia: number | null;
  city: string | null;
  province: string | null;
  country: string | null;
  star_rating: string | number | null;
  area_description: string | null;
  property_description: string | null;
  popular_amenities_list: string[] | null;
  // Amenity sub-category columns (may be arrays or stringified JSON)
  property_amenity_accessibility: unknown;
  property_amenity_activities_nearby: unknown;
  property_amenity_business_services: unknown;
  property_amenity_conveniences: unknown;
  property_amenity_family_friendly: unknown;
  property_amenity_food_and_drink: unknown;
  property_amenity_guest_services: unknown;
  property_amenity_internet: unknown;
  property_amenity_langs_spoken: unknown;
  property_amenity_more: unknown;
  property_amenity_outdoor: unknown;
  property_amenity_parking: unknown;
  property_amenity_spa: unknown;
  property_amenity_things_to_do: unknown;
  // Policy fields
  check_in_start_time: string | null;
  check_in_end_time: string | null;
  check_out_time: string | null;
  check_out_policy: unknown;
  pet_policy: unknown;
  children_and_extra_bed_policy: unknown;
  check_in_instructions: unknown;
  know_before_you_go: unknown;
}

// ─── Reviews_PROC ─────────────────────────────────────────────────────────────

export interface RatingBreakdown {
  overall?: number;
  checkin?: number;
  service?: number;
  location?: number;
  roomcomfort?: number;
  roomquality?: number;
  communication?: number;
  onlinelisting?: number;
  valueformoney?: number;
  hotelcondition?: number;
  ecofriendliness?: number;
  roomcleanliness?: number;
  roomamenitiesscore?: number;
  convenienceoflocation?: number;
  neighborhoodsatisfaction?: number;
}

export interface Review {
  eg_property_id: string;
  acquisition_date: string | null;
  lob: string | null;
  rating: RatingBreakdown | null;
  review_title: string | null;
  review_text: string | null;
  source_type?: ReviewSourceType;
  review_key?: string;
  generated_title?: string | null;
  generated_tags?: string[];
  title_was_ai_generated?: boolean;
  tags_was_ai_generated?: boolean;
  source_text_hash?: string;
  // populated for Review_Submissions entries
  reviewer_name?: string | null;
  reviewer_tags?: string[];
}
