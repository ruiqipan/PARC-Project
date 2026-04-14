import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { detectGaps } from '@/lib/gap-detector';
import { SEED_ROOMS, ROOM_IMAGES, DEMO_PERSONAS, HOTEL_THUMBNAIL_FALLBACK } from '@/lib/seed-data';
import { Review } from '@/types';

// POST /api/seed — seeds rooms + pre-generates questions for all hotels
// Only callable in development or with a secret header
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const secret = req.headers.get('x-seed-secret');
    if (secret !== process.env.SEED_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const supabase = createServerClient();
  const results: string[] = [];

  // ── 1. Fetch all hotels ────────────────────────────────────────────────────
  const { data: hotels, error: hotelsError } = await supabase
    .from('hotels')
    .select('id, eg_property_id, name, city, slug, thumbnail_url')
    .limit(20);

  if (hotelsError || !hotels) {
    return NextResponse.json({ error: 'Failed to fetch hotels', detail: hotelsError }, { status: 500 });
  }

  results.push(`Found ${hotels.length} hotels`);

  for (const hotel of hotels) {
    // ── 2. Ensure slug is set ──────────────────────────────────────────────
    if (!hotel.slug) {
      await supabase
        .from('hotels')
        .update({ slug: `hotel-${hotel.eg_property_id || hotel.id}` })
        .eq('id', hotel.id);
    }

    // ── 3. Set fallback thumbnail ──────────────────────────────────────────
    if (!hotel.thumbnail_url) {
      await supabase
        .from('hotels')
        .update({ thumbnail_url: HOTEL_THUMBNAIL_FALLBACK })
        .eq('id', hotel.id);
    }

    // ── 4. Seed rooms (skip if already exist) ─────────────────────────────
    const { count: roomCount } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotel.id);

    if ((roomCount ?? 0) === 0) {
      const roomsToInsert = SEED_ROOMS.map(r => ({
        hotel_id: hotel.id,
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        amenities: r.amenities,
        image_url: ROOM_IMAGES[r.type] || ROOM_IMAGES.standard,
        description: `Comfortable ${r.name} at ${hotel.name || 'this property'}.`,
      }));

      await supabase.from('rooms').insert(roomsToInsert);
      results.push(`Seeded ${roomsToInsert.length} rooms for hotel ${hotel.id}`);
    }

    // ── 5. Assign random personas to reviews ─────────────────────────────
    const { data: reviews } = await supabase
      .from('reviews')
      .select('id, traveler_persona')
      .eq('hotel_id', hotel.id)
      .is('traveler_persona', null)
      .limit(200);

    if (reviews && reviews.length > 0) {
      for (const review of reviews) {
        const persona = DEMO_PERSONAS[Math.floor(Math.random() * DEMO_PERSONAS.length)];
        await supabase
          .from('reviews')
          .update({ traveler_persona: persona })
          .eq('id', review.id);
      }
      results.push(`Assigned personas to ${reviews.length} reviews for hotel ${hotel.id}`);
    }

    // ── 6. Pre-generate questions via gap detection ───────────────────────
    const { count: qCount } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotel.id)
      .eq('is_active', true);

    if ((qCount ?? 0) < 2) {
      const { data: allReviews } = await supabase
        .from('reviews')
        .select('review_text, acquisition_date, traveler_persona')
        .eq('hotel_id', hotel.id)
        .limit(100);

      const gaps = detectGaps((allReviews as Review[]) || []);

      if (gaps.length > 0) {
        const questionsToInsert = gaps.slice(0, 5).map(gap => ({
          hotel_id: hotel.id,
          topic: gap.topic,
          gap_type: gap.gap_type,
          question_text: getQuestionTemplate(gap.topic, gap.gap_type),
          target_personas: getTargetPersonas(gap.topic),
          confidence_score: gap.confidence_score,
          is_active: true,
        }));

        await supabase.from('questions').insert(questionsToInsert);
        results.push(`Generated ${questionsToInsert.length} questions for hotel ${hotel.id}`);
      }
    }
  }

  return NextResponse.json({ success: true, results });
}

function getQuestionTemplate(topic: string, gapType: string): string {
  const templates: Record<string, Record<string, string>> = {
    missing: {
      wifi: "How would you rate the Wi-Fi quality during your stay?",
      parking: "Was parking available and easy to use at this property?",
      breakfast: "Did you try the breakfast? Was it worth it?",
      noise: "How was the noise level — quiet enough for a good night's sleep?",
      gym: "Did you use the gym or pool? Are they in good condition?",
      ac: "Was the room temperature easy to control?",
      checkin: "How smooth was the check-in process?",
      accessibility: "Was the hotel accessible and easy to navigate?",
      cleanliness: "How clean was your room and the common areas?",
      service: "How would you rate the staff and overall service?",
      value: "Did the hotel feel good value for the price paid?",
    },
    conflicting: {
      wifi: "We've seen mixed reports on Wi-Fi speed — was it fast or slow during your stay?",
      noise: "Some guests found it quiet, others noisy — what was your experience?",
      breakfast: "Breakfast reviews are mixed — was it good or disappointing?",
      parking: "Some guests had trouble parking — was it easy for you?",
      cleanliness: "Cleanliness reviews vary — how clean did you find the hotel?",
      service: "Staff reviews vary widely — how was your experience?",
    },
    stale: {
      wifi: "Wi-Fi reviews are mostly older — is it still reliable?",
      gym: "The gym was last reviewed a while ago — is it still open and well-maintained?",
      breakfast: "Breakfast offerings may have changed — is it still available or included?",
      checkin: "Check-in experience reviews are old — how was it during your recent stay?",
      parking: "Parking info may be outdated — what was your experience?",
    },
    periodic: {
      cleanliness: "Quick check-in on cleanliness — still up to standard?",
      wifi: "Just confirming: is the Wi-Fi still reliable?",
      service: "Still checking: how is the overall service quality?",
    },
  };

  return (
    templates[gapType]?.[topic] ||
    templates['missing']?.[topic] ||
    `How was the ${topic} during your stay?`
  );
}

function getTargetPersonas(topic: string): string[] {
  const map: Record<string, string[]> = {
    wifi: ['business', 'solo'],
    parking: ['car'],
    breakfast: ['family', 'couple'],
    noise: ['business', 'family', 'solo'],
    cleanliness: ['family', 'accessibility'],
    gym: ['solo', 'couple'],
    ac: ['family', 'accessibility'],
    checkin: ['business', 'car'],
    accessibility: ['accessibility'],
    service: [],
    value: [],
  };
  return map[topic] || [];
}
