import { NextResponse, type NextRequest } from 'next/server';

import { activationCookieNames } from '@/activation/lib/cookie-names';
import { ACTIVATION_LOGIN, ACTIVATION_ROOT, isActivationPath, isActivationPublicPage } from '@/activation/lib/routes';
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

  // The activation portal is its own tree with its own session and sign-in.
  // It is decided here, before any of the learning website's rules, so that a
  // portal visitor is never sent to `/login` and the portal keeps working if
  // the pages below are ever switched off.
  if (isActivationPath(pathname)) return activationGate(request);

  if (isPublicPage(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(cookieNames.refreshToken) || request.cookies.has(cookieNames.accessToken);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

/**
 * The portal's own gate: a portal session cookie, or the portal's sign-in.
 *
 * As above, presence only — the backend authorises every request the portal
 * makes. The learning website's cookies are not consulted: being signed in
 * there is not being signed in here.
 */
function activationGate(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession =
    request.cookies.has(activationCookieNames.refreshToken) || request.cookies.has(activationCookieNames.accessToken);

  if (isActivationPublicPage(pathname) || hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = ACTIVATION_LOGIN;
  url.search = '';
  if (pathname.replace(/\/+$/, '') !== ACTIVATION_ROOT) url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: API routes answer for themselves, and static assets need no
  // session.
  //
  // `.pfb`, `.bcmap` and `.ttf` are here because the protected viewer fetches
  // pdf.js's standard fonts and CMaps from `/pdfjs/**` at runtime. Without them
  // those fetches ran through this middleware and were answered with the login
  // page instead of font data - which fails silently and leaves each device
  // falling back to its own fonts, so one PDF overlapped on some screens and
  // rendered correctly on others.
  //
  // This MUST stay a literal: Next.js statically analyses the matcher and
  // rejects an imported identifier ("Invalid segment configuration export
  // detected"). `lib/middleware-match.ts` carries the same list for the tests to
  // exercise, and a test asserts the two agree.
  matcher: [
    '/((?!api/|_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|txt|xml|webmanifest|pfb|bcmap|ttf)$).*)',
  ],
};
