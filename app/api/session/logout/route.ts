import { NextResponse } from 'next/server';
import { USERNAME_COOKIE, USER_ID_COOKIE } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ ok: true, redirectTo: '/login' });

  response.cookies.delete(USER_ID_COOKIE);
  response.cookies.delete(USERNAME_COOKIE);

  return response;
}
