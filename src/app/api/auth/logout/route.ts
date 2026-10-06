import { NextResponse, type NextRequest } from 'next/server';

import { backendRequest, getAccessToken } from '@/lib/session';
import { bumpSessionGeneration, resetRefreshState } from '@/lib/refresh-lock';
import { clearSessionCookies } from '@/lib/session-cookies';
import { hasWebRequestHeader } from '@/lib/web-request';

/**
 * Signs the browser out.
 *
 * Order matters here. `bumpSessionGeneration()` runs before the (awaited)
 * backend call so that a refresh already in flight — or one that starts during
 * this request — is invalidated the moment the user asks to leave. Without it,
 * signing out during a slow refresh would let the late response write cookies
 * and silently re-establish the session the user just ended.
 *
 * The backend call itself is best-effort: a token that is already dead, or a
 * backend that is down, must not leave the browser holding cookies it can no
 * longer use. `resetRefreshState()` then clears the cooldown so the next
 * sign-in is not penalised by the previous session's failure.
 */
export async function POST(request: NextRequest) {
  if (!hasWebRequestHeader(request.headers)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'CSRF_PROTECTION', message: 'CSRF protection' },
        code: 'CSRF_PROTECTION',
        message: 'CSRF protection',
      },
      { status: 403 }
    );
  }

  bumpSessionGeneration();

  const accessToken = await getAccessToken();

  if (accessToken) {
    try {
      await backendRequest({
        method: 'POST',
        path: '/auth/logout',
        accessToken,
      });
    } catch {
      // best-effort
    }
  }

  resetRefreshState();

  const response = NextResponse.json({ success: true, data: { ok: true } });

  clearSessionCookies(response);

  return response;
}
