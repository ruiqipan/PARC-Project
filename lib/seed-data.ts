// Seed data for rooms and augmented hotel details.
// Reviews and property descriptions come from the official Expedia CSVs.

export const SEED_ROOMS = [
  // ── Generic room types (associated by hotel eg_property_id from CSV) ─────────
  // When seeding, the backend script matches these to real hotel IDs.
  // For demo purposes, we cycle through 3 room types per hotel.
  { name: 'Deluxe King Room', type: 'king', capacity: 2, amenities: ['King bed', 'Work desk', 'City view', 'Mini fridge', 'Free WiFi'] },
  { name: 'Twin Room', type: 'twin', capacity: 2, amenities: ['Two twin beds', 'Work desk', 'Free WiFi', 'Rain shower'] },
  { name: 'Family Suite', type: 'family', capacity: 4, amenities: ['King bed + sofa bed', 'Kitchenette', 'Extra towels', 'Child-friendly'] },
  { name: 'Accessible King Room', type: 'accessible', capacity: 2, amenities: ['King bed', 'Roll-in shower', 'Grab bars', 'Low fixtures', 'Wide doorways'] },
  { name: 'Executive Suite', type: 'suite', capacity: 2, amenities: ['King bed', 'Separate living area', 'Lounge access', 'Premium WiFi', 'Bathtub'] },
];

export const HOTEL_THUMBNAIL_FALLBACK =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80';

export const ROOM_IMAGES: Record<string, string> = {
  king: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=80',
  twin: 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=600&q=80',
  family: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600&q=80',
  accessible: 'https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?w=600&q=80',
  suite: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80',
  standard: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600&q=80',
};

// Persona tags to randomly assign to imported reviews for demo variety
export const PERSONA_BY_LOB: Record<string, string> = {
  hotel: 'solo',
  vacation_rental: 'family',
  business: 'business',
};

export const DEMO_PERSONAS = [
  'business', 'family', 'solo', 'couple', 'car', 'accessibility',
] as const;
