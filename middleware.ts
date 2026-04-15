import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const uid = request.cookies.get('parc_anon_uid')?.value;

  // First-time visitor: generate a UID and redirect to onboarding
  if (!uid) {
    const newId = crypto.randomUUID();
    const isHome = request.nextUrl.pathname === '/';

    const destination = isHome
      ? NextResponse.redirect(new URL('/onboarding', request.url))
      : NextResponse.next();

    destination.cookies.set('parc_anon_uid', newId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
    });

    return destination;
  }

  return NextResponse.next();
}

export const config = {
  // Run on home and onboarding only — skip static assets and API routes
  matcher: ['/', '/onboarding'],
};
