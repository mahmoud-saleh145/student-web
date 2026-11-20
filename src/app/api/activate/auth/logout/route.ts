import type { NextRequest } from 'next/server';

import { markActivationSessionEnded } from '@/activation/server/refresh-state';
import { activationJson, refuseCrossSite } from '@/activation/server/respond';
import { clearActivationSessionCookies, getActivationAccessToken, getActivationRefreshToken } from '@/activation/server/session';
import { backendRequest } from '@/lib/session';

/**
 * Signs the browser out of the activation portal — and of nothing else.
 *
 * It calls the backend's `/auth/logout`, which ends only the session the
 * presented token belongs to. It never calls `/auth/logout-all`: that would
 * sign the student out of the mobile app too.
 *
 * Only the portal's cookies are cleared. The learning website's session, if
 * the same browser has one, is untouched.
 */
export async function POST(request: NextRequest) {
  const refused = refuseCrossSite(request);
  if (refused) return refused;

  // Before the awaited backend call, so a refresh in flight cannot write
  // cookies for the session the student is leaving.
  markActivationSessionEnded(await getActivationRefreshToken());

  const accessToken = await getActivationAccessToken();
  if (accessToken) {
    await backendRequest({ method: 'POST', path: '/auth/logout', accessToken }).catch(() => undefined);
  }

  const response = activationJson({ success: true, data: { ok: true } });
  clearActivationSessionCookies(response);
  return response;
}
