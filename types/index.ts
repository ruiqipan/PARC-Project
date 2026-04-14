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
}
