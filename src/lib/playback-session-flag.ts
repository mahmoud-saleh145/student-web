/**
 * Rollout switch for the web playback session (lib/playback-session.ts).
 *
 * OFF BY DEFAULT. Unless `NEXT_PUBLIC_PLAYBACK_SESSION_MODE` is exactly
 * `session`, every student gets `legacy` - the player behaves exactly as it
 * did before this module existed.
 *
 *   NEXT_PUBLIC_PLAYBACK_SESSION_MODE     legacy (default) | session
 *   NEXT_PUBLIC_PLAYBACK_SESSION_PERCENT  0-100, students only (default 0)
 *
 * With `session`, staff accounts (any role other than STUDENT) are always in,
 * so the change can be watched on staff before any student sees it; students
 * join by a stable hash of their id, so a student stays in the same cohort
 * across visits and devices while the percentage is unchanged.
 *
 * Both values are build-time (`NEXT_PUBLIC_*`), so changing them needs a new
 * deployment; promoting the previous deployment is the instant rollback.
 */

export type PlaybackSessionMode = 'legacy' | 'session';

export interface PlaybackSessionFlagEnv {
  mode?: string | null;
  percent?: string | null;
}

export interface PlaybackSessionUser {
  id: string;
  role: string;
}

/**
 * The flag values as built into the bundle. Next.js only inlines
 * `process.env.NEXT_PUBLIC_*` for literal property reads, so these two reads
 * must stay spelled out exactly like this.
 */
export function readPlaybackSessionFlagEnv(): PlaybackSessionFlagEnv {
  return {
    mode: process.env.NEXT_PUBLIC_PLAYBACK_SESSION_MODE,
    percent: process.env.NEXT_PUBLIC_PLAYBACK_SESSION_PERCENT,
  };
}

/** Stable 0-99 bucket for a user id (FNV-1a, 32-bit). */
export function cohortBucket(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

function parsePercent(raw: string | null | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^\d{1,3}$/.test(text)) return 0;
  return Math.min(100, Number(text));
}

export function resolvePlaybackSessionMode(
  env: PlaybackSessionFlagEnv,
  user: PlaybackSessionUser | null | undefined,
): PlaybackSessionMode {
  if ((env.mode ?? '').trim().toLowerCase() !== 'session') return 'legacy';
  if (!user?.id) return 'legacy';
  if (user.role !== 'STUDENT') return 'session';
  return cohortBucket(user.id) < parsePercent(env.percent) ? 'session' : 'legacy';
}
