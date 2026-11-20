import type { RefreshOutcome } from '@/lib/refresh-lock';

/**
 * Token-refresh coordination for the portal's proxy — its own state.
 *
 * WHY A SEPARATE INSTANCE
 * The learning website has the same job (`lib/refresh-lock.ts`) and its own
 * module state. The two sessions are separate, so their coordination is too:
 * nothing here reads or writes that module's state, and a sign-in to one never
 * disturbs a refresh of the other. Only its result type is reused.
 *
 * WHAT IT COORDINATES
 * One page load fans out into several proxied requests. When the access token
 * has expired they all get 401 at once, and each would present the same
 * rotating refresh token. The backend treats a second presentation of a
 * rotated token as theft and revokes the session, so:
 *
 *   1. IN FLIGHT — concurrent callers with the same refresh token share one
 *      refresh.
 *   2. JUST FINISHED — a request that was already on its way with the old
 *      cookie, and gets its 401 a moment after that refresh completed, is
 *      handed the same result instead of re-presenting the spent token. The
 *      learning website's version has no such memory and leans on the
 *      backend's reuse grace; the portal does not need to.
 *   3. ENDED — sign-out (and signing in again) marks the old refresh token as
 *      ended, so a refresh that outlives its session cannot write cookies for
 *      one the student has left.
 *
 * Everything is keyed by the refresh token, so one student's sign-in, sign-out
 * or refresh can never discard or resolve another's. Only the cooldown is
 * shared, because it describes the backend's health, not a session.
 *
 * Module state is the right scope: the racing requests are handled by one
 * Node process. Entries are short-lived and pruned on use.
 *
 * BOUNDED
 * Sign-out reaches `markActivationSessionEnded` with whatever the request's
 * cookie holds, before anything has vouched for it. So the list of ended
 * tokens is capped, and a value too long to be a token is not stored at all:
 * a flood of made-up cookies can cost a fixed, small amount of memory and
 * nothing more. Dropping the oldest entry early only shortens a protection
 * for a race that is already over.
 */

const COOLDOWN_MS = 30_000;
/** How long a finished refresh is handed to late requests still holding the old token. */
export const REFRESH_REUSE_WINDOW_MS = 20_000;
/** How long an ended token is remembered — longer than any request can run. */
const ENDED_TTL_MS = 5 * 60_000;
/** The most ended tokens remembered at once; the oldest is dropped first. */
export const MAX_ENDED_TOKENS = 2_000;
/** Longer than any refresh token the backend issues. */
const MAX_TOKEN_LENGTH = 512;

const inflight = new Map<string, Promise<RefreshOutcome>>();
const recent = new Map<string, { outcome: RefreshOutcome; at: number }>();
const ended = new Map<string, number>();
let blockedUntil = 0;

function prune(now: number): void {
  for (const [token, entry] of recent) if (now - entry.at > REFRESH_REUSE_WINDOW_MS) recent.delete(token);
  for (const [token, at] of ended) if (now - at > ENDED_TTL_MS) ended.delete(token);
}

export function isActivationRefreshCoolingDown(now: number = Date.now()): boolean {
  return now < blockedUntil;
}

/** An inconclusive failure (5xx, 429, timeout): stop hammering a failing backend. */
export function noteActivationRefreshFailure(now: number = Date.now()): void {
  blockedUntil = now + COOLDOWN_MS;
}

/** A successful sign-in proves the backend answers: no reason to keep waiting. */
export function clearActivationRefreshCooldown(): void {
  blockedUntil = 0;
}

/**
 * The session this refresh token belongs to was deliberately ended (sign-out,
 * or replaced by a new sign-in). A refresh result for it must be discarded.
 */
export function markActivationSessionEnded(refreshToken: string | null | undefined, now: number = Date.now()): void {
  if (!refreshToken || refreshToken.length > MAX_TOKEN_LENGTH) return;
  prune(now);

  // Re-inserted so the map's order is "oldest first" by the time it was ended.
  ended.delete(refreshToken);
  ended.set(refreshToken, now);
  while (ended.size > MAX_ENDED_TOKENS) {
    const oldest = ended.keys().next().value;
    if (oldest === undefined) break;
    ended.delete(oldest);
  }

  recent.delete(refreshToken);
  // The refresh that PRODUCED this token is still on record under the token
  // before it. A straggler holding that older token must not be handed the
  // ended session's tokens back.
  for (const [previous, entry] of recent) {
    if (entry.outcome.ok && entry.outcome.refreshToken === refreshToken) recent.delete(previous);
  }
}

export function isActivationSessionEnded(refreshToken: string, now: number = Date.now()): boolean {
  const at = ended.get(refreshToken);
  return at !== undefined && now - at <= ENDED_TTL_MS;
}

/**
 * Runs `run` at most once per refresh token: shared while outstanding, and
 * replayed for a short window after it succeeds.
 */
export function singleFlightActivationRefresh(
  refreshToken: string,
  run: () => Promise<RefreshOutcome>,
  now: number = Date.now(),
): Promise<RefreshOutcome> {
  prune(now);

  const finished = recent.get(refreshToken);
  if (finished) return Promise.resolve(finished.outcome);

  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const started = (async () => {
    try {
      const outcome = await run();
      // Only a success is replayed. A failure must be free to try again.
      if (outcome.ok) recent.set(refreshToken, { outcome, at: now });
      return outcome;
    } finally {
      // Cleared here so a thrown error cannot leave a poisoned entry.
      inflight.delete(refreshToken);
    }
  })();

  inflight.set(refreshToken, started);
  return started;
}

/** Tests only: how many ended tokens are currently remembered. */
export function endedActivationTokenCountForTests(): number {
  return ended.size;
}

/** Tests only. */
export function resetActivationRefreshStateForTests(): void {
  inflight.clear();
  recent.clear();
  ended.clear();
  blockedUntil = 0;
}
