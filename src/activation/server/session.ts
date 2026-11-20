import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

import { serverConfig } from '@/lib/config';

import { activationCookieNames } from '../lib/cookie-names';

/**
 * The portal session on the server: reading and writing its cookies.
 *
 * Same attributes as the learning website's session cookies (HttpOnly, Secure
 * in production, SameSite=Lax) under the portal's own names. Tokens never
 * reach page scripts, a URL or a log line: they live in these cookies and are
 * attached to backend requests by the portal's route handlers only.
 *
 * There is intentionally no device cookie and no device header anywhere in
 * the portal. See `lib/cookie-names.ts`.
 */

const ACCESS_MAX_AGE_S = 60 * 60 * 12;
const REFRESH_MAX_AGE_S = 60 * 60 * 24 * 30;

export interface ActivationProfile {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: serverConfig.secureCookies,
    path: '/',
    maxAge,
  };
}

export function setActivationSessionCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  response.cookies.set(activationCookieNames.accessToken, tokens.accessToken, cookieOptions(ACCESS_MAX_AGE_S));
  response.cookies.set(activationCookieNames.refreshToken, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE_S));
}

export function setActivationProfileCookie(response: NextResponse, user: ActivationProfile): void {
  response.cookies.set(
    activationCookieNames.profile,
    JSON.stringify({
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
    }),
    cookieOptions(REFRESH_MAX_AGE_S),
  );
}

export function clearActivationSessionCookies(response: NextResponse): void {
  for (const name of Object.values(activationCookieNames)) {
    response.cookies.set(name, '', cookieOptions(0));
  }
}

export async function getActivationAccessToken(): Promise<string | null> {
  return (await cookies()).get(activationCookieNames.accessToken)?.value ?? null;
}

export async function getActivationRefreshToken(): Promise<string | null> {
  return (await cookies()).get(activationCookieNames.refreshToken)?.value ?? null;
}

/** The display snapshot written at sign-in; identity is still `auth/me`. */
export async function getActivationProfile(): Promise<ActivationProfile | null> {
  const jar = await cookies();
  // The profile is a label for a session, not a session. Without a token
  // cookie beside it there is nobody signed in — and saying otherwise would
  // send the sign-in page to a portal the middleware then sends straight back.
  if (!jar.get(activationCookieNames.accessToken)?.value && !jar.get(activationCookieNames.refreshToken)?.value) {
    return null;
  }
  const raw = jar.get(activationCookieNames.profile)?.value;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ActivationProfile> | null;
    if (!value || typeof value.id !== 'string' || typeof value.fullName !== 'string') return null;
    return {
      id: value.id,
      fullName: value.fullName,
      phone: typeof value.phone === 'string' ? value.phone : '',
      role: typeof value.role === 'string' ? value.role : 'STUDENT',
      status: typeof value.status === 'string' ? value.status : 'ACTIVE',
      avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    };
  } catch {
    return null;
  }
}

export function isActivationProfile(value: unknown): value is ActivationProfile {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.fullName === 'string' &&
    typeof v.phone === 'string' &&
    typeof v.role === 'string' &&
    typeof v.status === 'string'
  );
}
