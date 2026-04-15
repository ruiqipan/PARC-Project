import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  isValidUsername,
  normalizeUsername,
  SESSION_MAX_AGE,
  USERNAME_COOKIE,
  USER_ID_COOKIE,
} from '@/lib/session';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const rawUsername = typeof (body as Record<string, unknown>)?.username === 'string'
    ? (body as Record<string, string>).username
    : '';
  const username = normalizeUsername(rawUsername);

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Username must be 2-32 characters and use only letters, numbers, spaces, hyphens, or underscores.' },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    const { data: existing, error: lookupError } = await supabase
      .from('User_Personas')
      .select('user_id, username')
      .eq('username', username)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    const userId = existing?.user_id ?? crypto.randomUUID();
    const resolvedUsername = existing?.username ?? username;

    if (!existing) {
      const { error: createError } = await supabase
        .from('User_Personas')
        .insert({
          user_id: userId,
          username: resolvedUsername,
          tags: [],
          categories: [],
        });

      if (createError) {
        throw createError;
      }
    }

    const response = NextResponse.json({
      ok: true,
      redirectTo: '/onboarding',
      userId,
      username: resolvedUsername,
    });

    response.cookies.set(USER_ID_COOKIE, userId, {
      path: '/',
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
    });
    response.cookies.set(USERNAME_COOKIE, resolvedUsername, {
      path: '/',
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
    });

    return response;
  } catch (error) {
    console.error('[session/login] failed:', error);
    return NextResponse.json({ error: 'Unable to start session right now.' }, { status: 500 });
  }
}
