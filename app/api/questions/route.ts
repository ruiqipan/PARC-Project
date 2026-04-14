import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateFollowUpQuestions } from '@/lib/question-generator';
import { detectGaps } from '@/lib/gap-detector';
import { Review, TravelerPersona } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hotelId, reviewText, persona } = body as {
      hotelId: string;
      reviewText: string;
      persona?: TravelerPersona;
    };

    if (!hotelId || !reviewText?.trim()) {
      return NextResponse.json({ error: 'hotelId and reviewText are required' }, { status: 400 });
    }

    const supabase = createServerClient(); // throws if env vars missing

    // Fetch hotel description for context
    const { data: hotel } = await supabase
      .from('hotels')
      .select('property_description, name, city')
      .eq('id', hotelId)
      .single();

    // Fetch recent reviews for gap detection
    const { data: reviews } = await supabase
      .from('reviews')
      .select('review_text, acquisition_date, traveler_persona')
      .eq('hotel_id', hotelId)
      .order('acquisition_date', { ascending: false })
      .limit(100);

    const propertyDescription =
      hotel?.property_description ||
      `${hotel?.name || 'This hotel'} in ${hotel?.city || 'the city'}`;

    const detectedGaps = detectGaps((reviews as Review[]) || []);

    const questions = await generateFollowUpQuestions({
      reviewText,
      propertyDescription,
      detectedGaps,
      persona,
    });

    return NextResponse.json({ questions, gaps: detectedGaps.slice(0, 3) });
  } catch (err) {
    console.error('[/api/questions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
