import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const userId = req.cookies.get('parc_anon_uid')?.value;
    console.log('[personas] userId from cookie:', userId);
    if (!userId) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
    }

    const body = await req.json();
    console.log('[personas] body:', JSON.stringify(body));
    const { tags, categories } = body;

    const supabase = createServerClient();
    console.log('[personas] calling upsert...');
    const { error } = await supabase
      .from('User_Personas')
      .upsert(
        { user_id: userId, tags, categories, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[personas] Supabase error:', JSON.stringify(error));
      return NextResponse.json({ error: error.message, details: error }, { status: 500 });
    }

    console.log('[personas] upsert success');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[personas] Unexpected error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
