import { NextRequest, NextResponse } from 'next/server';

const USER_ID_COOKIE = 'parc_user_id';
const USERNAME_COOKIE = 'parc_username';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const userId = request.cookies.get(USER_ID_COOKIE)?.value;
  const username = request.cookies.get(USERNAME_COOKIE)?.value;
  const hasSession = Boolean(userId && username);

  if (!hasSession && pathname !== '/login' && pathname !== '/pitch') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
