'use client';

import { ApiError } from '@/lib/api-client';
import { endsSession } from '@/lib/error-messages';
import { isPublicPage } from '@/lib/route-guard';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';

let ending = false;

/**
 * Ends a session the server has already ended.
 *
 * The mobile client does this centrally: a `SESSION_EXPIRED` or
 * `ACCOUNT_DISABLED` answer tears the session down, clears cached data and
 * returns the student to sign-in with the reason shown. The web left the
 * student on whatever page they were on, with an error card per request and
 * cookies that would never work again.
 *
 * A full navigation (not a router push) is deliberate: it discards every
 * cached query, so nothing from the ended session survives into the next one.
 */
export function endSessionIfNeeded(error: unknown): void {
  if (!(error instanceof ApiError) || !endsSession(error)) return;
  if (ending || typeof window === 'undefined') return;
  if (isPublicPage(window.location.pathname)) return;
  ending = true;

  const reason = error.code === 'UNAUTHORIZED' ? 'SESSION_EXPIRED' : error.code;
  const next = `${window.location.pathname}${window.location.search}`;
  const target = `/login?reason=${encodeURIComponent(reason)}&next=${encodeURIComponent(next)}`;

  void fetch('/api/auth/logout', { method: 'POST', headers: { [WEB_REQUEST_HEADER]: '1' }, credentials: 'same-origin' })
    .catch(() => undefined)
    .finally(() => window.location.replace(target));
}
