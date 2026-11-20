import type { NextRequest } from 'next/server';

import { clearActivationRefreshCooldown, markActivationSessionEnded } from '@/activation/server/refresh-state';
import { activationError, activationJson, refuseCrossSite } from '@/activation/server/respond';
import {
  getActivationAccessToken,
  getActivationRefreshToken,
  isActivationProfile,
  setActivationProfileCookie,
  setActivationSessionCookies,
} from '@/activation/server/session';
import { asApiError, httpStatusFor } from '@/lib/errors';
import { backendRequest } from '@/lib/session';

/**
 * Signs a student in to the activation portal.
 *
 * The same accounts, the same phone number and password, the same backend
 * endpoint as the app and the learning website — with one deliberate
 * difference: NO DEVICE IDENTITY IS SENT.
 *
 * The backend binds a playback device on sign-in when (and only when) the
 * request carries `X-Device-Id` (`DevicesService.resolveOnLogin`). With the
 * header, a browser either takes the student's single device slot — parking
 * their phone in PENDING_APPROVAL — or, if the phone is already bound, files a
 * device-change request and a DEVICE_MISMATCH security event against it.
 * Without the header the backend returns before any write: no device row, no
 * change request, no security event, and the session is created with
 * `deviceId = null`.
 *
 * That is exactly what the portal is: an account session that is not a
 * playback device. Catalogue, code redemption, wallet and library purchase all
 * work on such a session; every protected-content endpoint refuses it
 * (`assertAuthorizedForProtectedContent` → DEVICE_NOT_AUTHORIZED), and the
 * portal's proxy does not forward those endpoints in the first place.
 *
 * A new sign-in does not end any other session, so the student stays signed
 * in on their phone.
 */

const STUDENT_ONLY_MESSAGE = 'This portal is for student accounts only.';

interface LoginResult {
  user: unknown;
  accessToken: string;
  refreshToken: string;
}

export async function POST(request: NextRequest) {
  const refused = refuseCrossSite(request);
  if (refused) return refused;

  let phone: unknown;
  let password: unknown;
  try {
    const body = (await request.json()) as { phone?: unknown; password?: unknown } | null;
    phone = body?.phone;
    password = body?.password;
  } catch {
    return activationError(400, 'INVALID_JSON', 'Invalid JSON body');
  }
  if (typeof phone !== 'string' || typeof password !== 'string' || !phone || !password) {
    return activationError(422, 'VALIDATION_ERROR', 'Phone and password are required');
  }

  try {
    // Exactly the two fields the backend accepts. No `deviceId` argument: see above.
    const result = await backendRequest<LoginResult>({
      method: 'POST',
      path: '/auth/login',
      body: { phone, password },
    });

    const { user, accessToken, refreshToken } = result.data;

    if (!isActivationProfile(user) || user.role !== 'STUDENT' || user.status !== 'ACTIVE') {
      // The backend just created a session this portal will not use. End that
      // one session rather than leave it live until it expires.
      await backendRequest({ method: 'POST', path: '/auth/logout', accessToken }).catch(() => undefined);
      return isActivationProfile(user) && user.role === 'STUDENT'
        ? activationError(403, 'ACCOUNT_DISABLED', 'This account is not active.')
        : activationError(403, 'INSUFFICIENT_ROLE', STUDENT_ONLY_MESSAGE);
    }

    const response = activationJson({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          status: user.status,
          avatarUrl: user.avatarUrl ?? null,
        },
      },
    });

    // A refresh still in flight for the session this browser held before must
    // not write its result over the tokens set below. Scoped to that one
    // session's token: nobody else's refresh is disturbed by this sign-in.
    // Signing in over a session that is still open in this browser: end the
    // old one on the backend too, rather than leaving it to expire. Best
    // effort — the new session does not depend on it.
    const replacedAccessToken = await getActivationAccessToken();
    if (replacedAccessToken && replacedAccessToken !== accessToken) {
      await backendRequest({ method: 'POST', path: '/auth/logout', accessToken: replacedAccessToken }).catch(
        () => undefined,
      );
    }

    markActivationSessionEnded(await getActivationRefreshToken());
    clearActivationRefreshCooldown();

    setActivationSessionCookies(response, { accessToken, refreshToken });
    setActivationProfileCookie(response, user);
    return response;
  } catch (e) {
    const apiErr = asApiError(e);
    return activationError(httpStatusFor(apiErr), apiErr.code, apiErr.message, apiErr.errors);
  }
}
