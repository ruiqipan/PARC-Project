import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { VoteType } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionId, sessionId, vote } = body as {
      questionId: string;
      sessionId?: string;
      vote: VoteType;
    };

    if (!questionId || !['up', 'down'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid feedback payload' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('question_feedback')
      .insert({ question_id: questionId, session_id: sessionId || null, vote });

    if (error) throw error;

    // Return updated vote counts
    const { data: counts } = await supabase
      .from('question_feedback')
      .select('vote')
      .eq('question_id', questionId);

    const upvotes = counts?.filter(r => r.vote === 'up').length ?? 0;
    const downvotes = counts?.filter(r => r.vote === 'down').length ?? 0;

    return NextResponse.json({ success: true, upvotes, downvotes });
  } catch (err) {
    console.error('[/api/feedback]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
