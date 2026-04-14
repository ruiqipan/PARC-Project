import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parse a DB field that may be a real array, a JSON-stringified array, or null. */
export function parseArrayField(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean).map(String);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch {}
    }
    return [trimmed];
  }
  return [];
}

/**
 * Convert HTML to plain text, preserving block-level structure as newlines.
 * <br>, </p>, </li> → newline; <li> → removed (content kept); all other tags stripped.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse an array field (real array or stringified JSON) and split any HTML
 * list structures into individual plain-text lines.
 */
export function parseHtmlItems(val: unknown): string[] {
  return parseArrayField(val)
    .flatMap(item => stripHtml(item).split('\n').map(s => s.trim()).filter(Boolean));
}

/** Human-readable labels for popular_amenities_list keys. */
export const AMENITY_LABELS: Record<string, string> = {
  ac: 'Air Conditioning',
  balcony: 'Balcony',
  bar: 'Bar',
  barbecue: 'BBQ',
  breakfast_available: 'Breakfast Available',
  breakfast_included: 'Breakfast Included',
  business_services: 'Business Services',
  crib: 'Crib Available',
  elevator: 'Elevator',
  extra_bed: 'Extra Bed',
  fitness_equipment: 'Fitness Center',
  free_parking: 'Free Parking',
  frontdesk_24_hour: '24-Hour Front Desk',
  grocery: 'Grocery',
  heater: 'Heating',
  hot_tub: 'Hot Tub',
  housekeeping: 'Housekeeping',
  internet: 'Free WiFi',
  kids_pool: "Kids' Pool",
  kitchen: 'Kitchen',
  laundry: 'Laundry',
  microwave: 'Microwave',
  no_smoking: 'Non-Smoking',
  outdoor_space: 'Outdoor Space',
  pool: 'Pool',
  restaurant: 'Restaurant',
  room_service: 'Room Service',
  soundproof_room: 'Soundproof Rooms',
  spa: 'Spa',
  toys: 'Kids Toys',
  tv: 'TV',
};

/** Human-readable labels for rating sub-categories. */
export const RATING_LABELS: Record<string, string> = {
  overall: 'Overall',
  checkin: 'Check-in',
  service: 'Service',
  location: 'Location',
  roomcomfort: 'Room Comfort',
  roomquality: 'Room Quality',
  communication: 'Communication',
  onlinelisting: 'Online Listing',
  valueformoney: 'Value for Money',
  hotelcondition: 'Hotel Condition',
  ecofriendliness: 'Eco-Friendliness',
  roomcleanliness: 'Room Cleanliness',
  roomamenitiesscore: 'Room Amenities',
  convenienceoflocation: 'Location Convenience',
  neighborhoodsatisfaction: 'Neighborhood',
};

/** Category labels for property_amenity_* columns. */
export const AMENITY_CATEGORY_LABELS: Record<string, string> = {
  property_amenity_accessibility: 'Accessibility',
  property_amenity_activities_nearby: 'Activities Nearby',
  property_amenity_business_services: 'Business Services',
  property_amenity_conveniences: 'Conveniences',
  property_amenity_family_friendly: 'Family Friendly',
  property_amenity_food_and_drink: 'Food & Drink',
  property_amenity_guest_services: 'Guest Services',
  property_amenity_internet: 'Internet',
  property_amenity_langs_spoken: 'Languages Spoken',
  property_amenity_more: 'Additional Info',
  property_amenity_outdoor: 'Outdoor',
  property_amenity_parking: 'Parking & Transport',
  property_amenity_spa: 'Spa & Wellness',
  property_amenity_things_to_do: 'Things to Do',
};
