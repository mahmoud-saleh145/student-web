/**
 * Activation gate for the temporary FairPlay debug console (Eruda).
 *
 * WHY A GATE EXISTS AT ALL
 *
 * Eruda is a full in-page inspector: it shows the DOM, localStorage, cookies,
 * every console call and every XHR/fetch with headers and bodies. On an app
 * whose requests carry a signed licence URL, a session cookie and a FairPlay
 * certificate, that is a credential-exfiltration tool. It must therefore be
 * impossible to switch on in Production, and impossible to switch on anywhere
 * except an explicitly authorised Vercel Preview deployment.
 *
 * WHY A QUERY PARAMETER IS NOT THE BOUNDARY
 *
 * `?debug=1` would be a user-controlled input that any production visitor could
 * append. That is not a security boundary, it is a suggestion. The boundary
 * here is the BUILD, not the URL:
 *
 *   - `NEXT_PUBLIC_FAIRPLAY_DEBUG` is set in Vercel's Preview environment scope
 *     only, so it is undefined in a Production build.
 *   - `next.config.ts` then swaps the `eruda` module for a no-op stub in every
 *     build that does not opt in, so no byte of Eruda is in the production
 *     output at all. Do NOT remove that replacement on the assumption that this
 *     gate alone is enough: Next compiles an UNSET `NEXT_PUBLIC_*` variable to
 *     a property lookup rather than a literal, so this branch is NOT statically
 *     dead and webpack happily bundles the library behind it. That was measured,
 *     not theorised - see next.config.ts and eruda-bundling.test.ts.
 *   - the host is checked at runtime as defence in depth, so even a mis-built
 *     artifact refuses to start on a production domain.
 *
 * All three must pass. None is trusted alone.
 */

/** Hostnames that must never activate the debug console, whatever the build. */
export const PRODUCTION_HOSTS: readonly string[] = [
  'student-web-gray.vercel.app',
  'student-web-startuppp3-9697.vercel.app',
  'student-web-git-main-startuppp3-9697.vercel.app',
];

/** Only this exact build-time value enables the console. */
export const DEBUG_BUILD_FLAG = '1';

export type DebugGateInput = {
  /** Inlined `process.env.NEXT_PUBLIC_FAIRPLAY_DEBUG` at build time. */
  buildFlag: string | undefined;
  /** `window.location.hostname` at runtime. */
  host: string | undefined;
};

export type DebugGateResult = { allowed: boolean; reason: string };

/**
 * Decide whether the debug console may start.
 *
 * Both conditions must hold:
 *   1. the build-time flag is exactly `1` (absent/undefined in Production), and
 *   2. the hostname is a Vercel per-deployment preview domain, or a loopback
 *      address for local development - and explicitly never a production alias.
 *
 * `*.vercel.app` is a per-deployment domain; the production aliases are
 * therefore matched explicitly and rejected first, before the wildcard test.
 *
 * The flag is trimmed before comparison. A stray space is stripped rather than
 * treated as a mismatch, because a flag that silently fails to enable is a flag
 * that will be "fixed" by removing the check. The comparison is still an exact
 * match against `1` - anything else, including `true` or `11`, is refused.
 */
export function debugGate(input: DebugGateInput): DebugGateResult {
  if (String(input.buildFlag ?? '').trim() !== DEBUG_BUILD_FLAG) {
    return { allowed: false, reason: 'BUILD_FLAG_ABSENT' };
  }
  const host = (input.host ?? '').trim().toLowerCase();
  if (!host) return { allowed: false, reason: 'NO_HOST' };
  if (PRODUCTION_HOSTS.includes(host)) {
    return { allowed: false, reason: 'PRODUCTION_HOST' };
  }
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  const isVercelPreview = host.endsWith('.vercel.app');
  if (!isLoopback && !isVercelPreview) {
    return { allowed: false, reason: 'HOST_NOT_PREVIEW' };
  }
  return { allowed: true, reason: 'PREVIEW_BUILD' };
}

/**
 * A failure reduced to its error class name (`TypeError`, `ChunkLoadError`…),
 * for the on-screen debug banner.
 *
 * The message is never used: a chunk-load or network failure message can quote
 * a URL. Only a name matching a plain identifier is returned; anything else is
 * `Error`, and a non-Error throw is `Unknown`.
 */
export function debugErrorToken(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown';
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : 'Error';
}

/**
 * Strip a URL down to something that is safe to display.
 *
 * Media, manifest and licence URLs are signed. The query string carries the
 * signature and the expiry, so it is removed entirely rather than filtered -
 * a partial allow-list would eventually let a new secret parameter through.
 *
 * Returns `<scheme>://<host><pathname>` and nothing else. Credentials embedded
 * in a URL (`https://user:pw@host/`) are dropped with the rest.
 */
export function redactUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '';
  }
}

/**
 * One diagnostic record.
 *
 * `v` is a FIXED token, a small integer or a boolean. Nothing derived from a
 * runtime string that could contain user data, a URL or a credential may be put
 * in here. `redactUrl` output is the only string form allowed, and even that
 * has had its query string removed.
 *
 * `t` is optional: only `trace` records have a player-clock origin.
 *
 * Note there is deliberately no header or body field. Not one request or
 * response header is emitted anywhere - not even to redact - because a filter
 * that misses a name is a filter that leaks. Shaka's request headers carry the
 * licence URL and the CDM's certificate handling; `Authorization`, `Cookie` and
 * `Set-Cookie` are all absent by omission, so a new secret header cannot pass
 * through by naming.
 */
export type DebugRecord = {
  /** Milliseconds since the player effect started. Trace records only. */
  t?: number;
  /** Channel, e.g. `trace`, `licence`, `media`, `shaka`, `net`. */
  k: string;
  /** Fixed token or redacted value. */
  v?: string | number | boolean;
  /** Optional integer detail, e.g. an HTTP status or a duration in ms. */
  n?: number;
};
