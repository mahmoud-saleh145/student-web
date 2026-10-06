import { NextResponse, type NextRequest } from 'next/server';

import { cookieNames } from '@/lib/cookie-names';
import { isPublicPage } from '@/lib/route-guard';

/**
 * Sends a visitor with no session to sign in before a protected page renders.
 *
 * Presence of a session cookie is all that is checked here — it is a routing
 * decision, not an authorisation one. The backend still authorises every
 * request, and an expired or revoked session that slips past this check is
 * ended by the client the first time the API answers 401.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPage(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(cookieNames.refreshToken) || request.cookies.has(cookieNames.accessToken);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: API routes answer for themselves, and static assets need no session.
  matcher: ['/((?!api/|_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|txt|xml|webmanifest)$).*)'],
};
