import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { AnswerType } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      questionId,
      hotelId,
      sessionId,
      answer,
      commentText,
    } = body as {
      questionId?: string;
      hotelId?: string;
      sessionId?: string;
      answer: AnswerType;
      commentText?: string;
    };

    if (!answer || !['good', 'bad', 'unknown'].includes(answer)) {
      return NextResponse.json({ error: 'Invalid answer value' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('responses')
      .insert({
        question_id: questionId || null,
        hotel_id: hotelId || null,
        session_id: sessionId || null,
        answer,
        comment_text: commentText || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch updated insight counts for this question (for the "You helped X" UI)
    let insight = null;
    if (questionId) {
      const { data: counts } = await supabase
        .from('responses')
        .select('answer')
        .eq('question_id', questionId);

      if (counts) {
        const good = counts.filter(r => r.answer === 'good').length;
        const bad = counts.filter(r => r.answer === 'bad').length;
        const unknown = counts.filter(r => r.answer === 'unknown').length;
        insight = { good, bad, unknown, total: counts.length };
      }
    }

    return NextResponse.json({ success: true, response: data, insight });
  } catch (err) {
    console.error('[/api/responses]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
