export const TOPIC_KEYWORDS: Record<string, string[]> = {
  wifi: ['wifi', 'wi-fi', 'internet', 'connection', 'bandwidth', 'signal', 'network', 'online', 'streaming', 'speed'],
  parking: ['parking', 'garage', 'valet', 'car park', 'lot', 'park my car', 'self-park', 'fee for parking'],
  breakfast: ['breakfast', 'morning meal', 'buffet', 'continental', 'brunch', 'complimentary breakfast', 'included breakfast'],
  noise: ['noise', 'noisy', 'quiet', 'loud', 'sound', 'thin walls', 'soundproof', 'traffic noise', 'disturbance', 'sleep'],
  cleanliness: ['clean', 'dirty', 'spotless', 'hygiene', 'smell', 'mold', 'mould', 'dust', 'stain', 'filthy', 'tidy', 'immaculate'],
  gym: ['gym', 'fitness', 'workout', 'exercise', 'pool', 'swimming pool', 'spa', 'sauna', 'jacuzzi'],
  ac: ['ac', 'air conditioning', 'hvac', 'temperature', 'heat', 'heater', 'cold', 'freezing', 'stuffy', 'aircon', 'climate control'],
  checkin: ['check-in', 'check in', 'checkin', 'front desk', 'reception', 'late check', 'early check', '24 hour', 'concierge', 'staff'],
  accessibility: ['wheelchair', 'accessible', 'elevator', 'lift', 'ramp', 'disability', 'mobility', 'disabled', 'handicap'],
  service: ['service', 'staff', 'helpful', 'rude', 'friendly', 'attentive', 'responsive', 'housekeeping', 'concierge'],
  value: ['value', 'worth', 'price', 'expensive', 'cheap', 'overpriced', 'reasonable', 'affordable', 'cost'],
};

export const TOPIC_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi Quality',
  parking: 'Parking',
  breakfast: 'Breakfast',
  noise: 'Noise Level',
  cleanliness: 'Cleanliness',
  gym: 'Gym & Pool',
  ac: 'Air Conditioning',
  checkin: 'Check-in Experience',
  accessibility: 'Accessibility',
  service: 'Staff & Service',
  value: 'Value for Money',
};

export const POSITIVE_WORDS = [
  'great', 'excellent', 'good', 'fast', 'clean', 'perfect', 'amazing', 'wonderful',
  'fantastic', 'love', 'loved', 'best', 'superb', 'outstanding', 'recommend', 'comfortable',
];

export const NEGATIVE_WORDS = [
  'bad', 'poor', 'slow', 'dirty', 'broken', 'terrible', 'awful', 'horrible',
  'worst', 'disappointing', 'disappointed', 'avoid', 'never', 'problem', 'issue', 'complaint',
];
