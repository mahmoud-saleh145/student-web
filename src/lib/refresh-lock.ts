/**
 * Single-flight token refresh for the server-side API proxy.
 *
 * ## Why this exists
 *
 * The web app talks to the backend through same-origin route handlers, which
 * means one page load fans out into many concurrent proxied requests (home
 * feed, catalog, wallet, library…). When the access token expires, every one of
 * those requests gets a 401 at the same moment.
 *
 * If each of them independently called `/auth/refresh`, they would all present
 * the *same* rotating refresh token. The backend is right to treat a second
 * presentation of a rotated token as theft: `AuthService.refresh` records a
 * `TOKEN_REUSE` security event and revokes the whole token family
 * (`revokeFamily`), killing the live session. So the race does not merely
 * waste requests — it converts ordinary navigation into a security event and
 * logs the user out.
 *
 * Mobile solved this first (`edu-mobile/src/api/client.ts`, "single-flight with
 * a waiter queue"). This is the same mechanism, on the server side of the proxy.
 *
 * ## Why a module-level map and not a distributed lock
 *
 * In-flight coordination has to be shared by the requests that are racing. On
 * the Next.js server those requests are handled by one Node process, so
 * module state is the correct scope, and it costs nothing. It is deliberately
 * keyed by the refresh token rather than being a single global slot: two
 * browsers signed in as different users must not make each other's refresh
 * resolve, and a global slot would do exactly that.
 *
 * A multi-instance deployment would need this moved behind Redis. That is noted
 * rather than built, because a wrong distributed lock is worse than a documented
 * single-process one — see `docs/DEPLOYMENT.md`.
 */

export interface RefreshSuccess {
  ok: true;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshFailure {
  ok: false;
  /** Mirrors the backend status so the caller can answer the browser honestly. */
  status: number;
  code: string;
  message: string;
}

export type RefreshOutcome = RefreshSuccess | RefreshFailure;

const inflight = new Map<string, Promise<RefreshOutcome>>();

/**
 * How long to stop attempting refresh after a failure that says nothing about
 * the token (5xx, 429, a timeout).
 *
 * Without this the proxy becomes a feedback loop. The access token is still
 * expired, `isAccessTokenStale` is still true, so every subsequent API call
 * makes its own refresh attempt — each one another request to the very endpoint
 * that is failing, and another rate-limit increment against the Redis that is
 * already in trouble. Mobile hit exactly this and documented it at length.
 *
 * A definitive rejection (400/401/403) clears the session outright instead; the
 * cooldown only covers failures that are not about the token.
 */
export const REFRESH_COOLDOWN_MS = 30_000;

let refreshBlockedUntil = 0;

/** True while a recent failure means another refresh attempt is pointless. */
export function isRefreshCoolingDown(now: number = Date.now()): boolean {
  return now < refreshBlockedUntil;
}

/** Records an inconclusive refresh failure and starts the cooldown. */
export function noteRefreshFailure(now: number = Date.now()): void {
  refreshBlockedUntil = now + REFRESH_COOLDOWN_MS;
}

/** Clears the cooldown. Called on sign-in so a fresh session starts unencumbered. */
export function resetRefreshState(): void {
  refreshBlockedUntil = 0;
  inflight.clear();
}

/**
 * Monotonic counter identifying the current browser session.
 *
 * This exists because `cookies()` is request-scoped and effectively frozen for
 * the lifetime of a route handler: a handler cannot observe cookies that
 * another concurrent request just cleared. So comparing the refresh cookie
 * against the token that was refreshed is *not* sufficient — an in-flight
 * refresh still sees its own original request cookies and would happily
 * conclude that nothing changed, then write fresh cookies for a session the
 * user had already signed out of.
 *
 * Instead, sign-in and sign-out both bump this counter, and a refresh compares
 * the counter it captured with the current one. That is visible across
 * concurrent requests within the process.
 *
 * Same single-process caveat as `inflight` above.
 */
let sessionGeneration = 0;

export function currentSessionGeneration(): number {
  return sessionGeneration;
}

/** Invalidates every refresh that captured the previous generation. */
export function bumpSessionGeneration(): void {
  sessionGeneration += 1;
}

/** Number of refreshes currently in flight. Exposed for tests. */
export function inflightCount(): number {
  return inflight.size;
}

/**
 * Runs `run` at most once per refresh token while a call is outstanding.
 *
 * Concurrent callers with the same key all receive the same promise, so exactly
 * one HTTP refresh happens and every waiter retries with the token it produced.
 * The entry is cleared on settle, so the next expiry can refresh again with the
 * new (rotated) token rather than deadlocking on a spent one.
 */
export function singleFlightRefresh(
  key: string,
  run: () => Promise<RefreshOutcome>,
): Promise<RefreshOutcome> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const started = (async () => {
    try {
      return await run();
    } finally {
      // Cleared here rather than by the caller so a thrown error cannot leave a
      // poisoned entry that every later request inherits.
      inflight.delete(key);
    }
  })();

  inflight.set(key, started);
  return started;
}

/**
 * Whether a refresh result may still be written to the browser's cookies.
 *
 * Guards the window where a refresh outlives the session that asked for it. If
 * the cookie no longer holds the token we refreshed, then in the meantime the
 * user signed out (cookies cleared) or signed in again (cookies replaced). In
 * both cases writing the old refresh result would resurrect a session the user
 * deliberately ended — and on sign-in it would overwrite the newer account's
 * tokens with the previous one's.
 *
 * Returns true only while the cookie is still the exact token that was refreshed.
 */
export function mayApplyRefreshResult(
  currentRefreshToken: string | null,
  refreshTokenUsed: string,
): boolean {
  return currentRefreshToken !== null && currentRefreshToken === refreshTokenUsed;
}

/** Whether an outcome represents a definitive "this token is no longer usable". */
export function isDefinitiveRefreshRejection(outcome: RefreshOutcome): boolean {
  return !outcome.ok && [400, 401, 403].includes(outcome.status);
}
