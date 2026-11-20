import { NextResponse, type NextRequest } from 'next/server';

import { serverConfig } from '@/lib/config';
import { hasWebRequestHeader } from '@/lib/web-request';

import { ACTIVATION_CACHE_CONTROL } from '../lib/proxy-allowlist';
import { isSameOriginRequest } from '../lib/same-origin';

/**
 * How the portal's route handlers answer.
 *
 * One error shape (the same one the learning website's routes use, so the
 * shared client and error components read it unchanged), and `no-store` on
 * everything: a portal answer is about one student's entitlements and wallet,
 * and must never be replayed from a cache.
 *
 * The message is this app's own fixed text or the backend's message for a
 * known error code. It never contains a token, a code the student typed, or a
 * backend stack trace.
 */

export function activationJson(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', ACTIVATION_CACHE_CONTROL);
  return response;
}

export function activationError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): NextResponse {
  // A transport failure carries status 0, which Response rejects outright.
  const safe = status >= 400 && status <= 599 ? status : 502;
  return activationJson(
    { success: false, error: { code, message, fields }, statusCode: safe, code, message, errors: fields },
    safe,
  );
}

/**
 * CSRF gate for every state-changing portal route. Returns the refusal, or
 * null when the request may proceed.
 */
export function refuseCrossSite(request: NextRequest): NextResponse | null {
  if (!hasWebRequestHeader(request.headers) || !isSameOriginRequest(request.headers, serverConfig.appOrigin)) {
    return activationError(403, 'CSRF_PROTECTION', 'CSRF protection');
  }
  return null;
}
