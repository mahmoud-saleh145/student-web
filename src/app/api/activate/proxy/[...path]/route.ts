import type { NextRequest, NextResponse } from 'next/server';

import { isAllowedActivationBody, isAllowedActivationRequest } from '@/activation/lib/proxy-allowlist';
import {
  isActivationRefreshCoolingDown,
  isActivationSessionEnded,
  noteActivationRefreshFailure,
  singleFlightActivationRefresh,
} from '@/activation/server/refresh-state';
import { activationError, activationJson, refuseCrossSite } from '@/activation/server/respond';
import {
  clearActivationSessionCookies,
  getActivationAccessToken,
  getActivationRefreshToken,
  isActivationProfile,
  setActivationProfileCookie,
  setActivationSessionCookies,
} from '@/activation/server/session';
import { asApiError, httpStatusFor } from '@/lib/errors';
import { contentLocale } from '@/lib/locale';
import { isDefinitiveRefreshRejection, mayApplyRefreshResult, type RefreshOutcome } from '@/lib/refresh-lock';
import { backendRequest } from '@/lib/session';

/**
 * The activation portal's backend-for-frontend.
 *
 * Three properties, each enforced here on the server rather than by a page:
 *
 *   1. ALLOW-LIST. Only the routes in `proxy-allowlist.ts` are forwarded:
 *      catalogue, course information, code redemption, library catalogue and
 *      wallet. Lesson detail, playback tickets, attachment tickets and the
 *      library reader's `parts/:id/open` are not in it, so nothing reachable
 *      through this route can return a manifest, a licence, or a signed PDF.
 *      Only GET and POST exist at all.
 *
 *   2. NO DEVICE. No `X-Device-Id` (or any device header) is ever attached, so
 *      the portal cannot register, present or consume a playback device.
 *
 *   3. ITS OWN SESSION. Tokens come from the portal's cookies and are
 *      refreshed with the portal's own single-flight state; the learning
 *      website's cookies are never read or written.
 *
 * Authorisation itself stays with the backend: every forwarded request carries
 * the student's token, and the backend decides visibility, eligibility,
 * redemption and balance. Nothing here grants anything.
 */

const REFRESH_UNAVAILABLE = 'Your session could not be renewed right now. Please try again.';

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Params) {
  return handle(request, params, 'GET');
}

export async function POST(request: NextRequest, { params }: Params) {
  return handle(request, params, 'POST');
}

async function handle(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  method: 'GET' | 'POST',
): Promise<NextResponse> {
  const { path } = await params;
  const pathStr = path.join('/');

  if (!isAllowedActivationRequest(method, pathStr)) {
    return activationError(403, 'PATH_NOT_ALLOWED', 'Path not allowed');
  }

  if (method !== 'GET') {
    const refused = refuseCrossSite(request);
    if (refused) return refused;
  }

  const accessToken = await getActivationAccessToken();
  const refreshToken = await getActivationRefreshToken();
  if (!accessToken && !refreshToken) {
    return activationError(401, 'UNAUTHORIZED', 'Not signed in');
  }

  let body: unknown;
  if (method === 'POST') {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return activationError(400, 'INVALID_JSON', 'Invalid JSON body');
      }
    }
    if (!isAllowedActivationBody(pathStr, body)) {
      return activationError(403, 'PATH_NOT_ALLOWED', 'Method not allowed');
    }
  }

  const locale = contentLocale(request.headers.get('accept-language'));
  const queryString = new URL(request.url).searchParams.toString();
  const backendPath = `/${pathStr}${queryString ? `?${queryString}` : ''}`;

  const send = (token: string) => backendRequest({ method, path: backendPath, body, accessToken: token, locale });

  // --- attempt 1 -------------------------------------------------------------
  if (accessToken) {
    try {
      const result = await send(accessToken);
      const response = activationJson({ success: true, data: result.data, meta: result.meta });
      syncProfile(response, method, pathStr, result.data);
      return response;
    } catch (e) {
      const apiErr = asApiError(e);
      if (apiErr.status !== 401) return activationError(httpStatusFor(apiErr), apiErr.code, apiErr.message, apiErr.errors);
    }
  }

  // --- refresh ---------------------------------------------------------------
  if (!refreshToken) return activationError(401, 'UNAUTHORIZED', 'Not signed in');

  // A recent failure unrelated to the token. Reported as retryable, never as a
  // 401: a 401 ends the session on the client, and nothing has said it is over.
  if (isActivationRefreshCoolingDown()) {
    return activationError(503, 'SESSION_REFRESH_UNAVAILABLE', REFRESH_UNAVAILABLE);
  }

  const outcome = await singleFlightActivationRefresh(refreshToken, () => performRefresh(refreshToken));

  if (!outcome.ok) {
    if (isDefinitiveRefreshRejection(outcome)) {
      const response = activationError(outcome.status || 401, outcome.code, outcome.message);
      clearActivationSessionCookies(response);
      return response;
    }
    noteActivationRefreshFailure();
    return activationError(503, 'SESSION_REFRESH_UNAVAILABLE', REFRESH_UNAVAILABLE);
  }

  // Signed out, or signed in again, while the refresh was in flight: writing
  // these cookies would resurrect a dead session or overwrite a newer one.
  if (isActivationSessionEnded(refreshToken) || !mayApplyRefreshResult(await getActivationRefreshToken(), refreshToken)) {
    return activationError(401, 'SESSION_CHANGED', 'Session changed during refresh');
  }

  // --- attempt 2: exactly one retry with the new access token ----------------
  // A state-changing request reaches this point only if attempt 1 was refused
  // with 401 before the backend acted on it, so the retry cannot double-apply.
  try {
    const result = await send(outcome.accessToken);
    const response = activationJson({ success: true, data: result.data, meta: result.meta });
    setActivationSessionCookies(response, outcome);
    syncProfile(response, method, pathStr, result.data);
    return response;
  } catch (e) {
    const apiErr = asApiError(e);
    const response = activationError(httpStatusFor(apiErr), apiErr.code, apiErr.message, apiErr.errors);
    if (apiErr.status === 401) {
      clearActivationSessionCookies(response);
    } else {
      // The rotation happened server-side; losing it would re-present a spent
      // refresh token next time, which the backend treats as token reuse.
      setActivationSessionCookies(response, outcome);
    }
    return response;
  }
}

/** A successful `auth/me` is the authoritative user: refresh the display snapshot. */
function syncProfile(response: NextResponse, method: string, pathStr: string, data: unknown): void {
  if (method !== 'GET' || pathStr.replace(/^\/+|\/+$/g, '') !== 'auth/me') return;
  if (isActivationProfile(data)) setActivationProfileCookie(response, data);
}

async function performRefresh(refreshToken: string): Promise<RefreshOutcome> {
  try {
    // No device headers here either.
    const result = await backendRequest<{ accessToken: string; refreshToken: string }>({
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken },
    });
    return { ok: true, accessToken: result.data.accessToken, refreshToken: result.data.refreshToken };
  } catch (e) {
    const apiErr = asApiError(e);
    return { ok: false, status: httpStatusFor(apiErr), code: apiErr.code, message: apiErr.message };
  }
}
