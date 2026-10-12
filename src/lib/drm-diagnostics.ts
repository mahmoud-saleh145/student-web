/**
 * Sanitised, opt-in FairPlay diagnostics for DrmVideo.
 *
 * Everything here is pure and Shaka-free so it can be unit-tested. Nothing in
 * this module ever reads or returns init data, certificates, SPC/CKC payloads,
 * licence tokens, `skd://` values or URLs: every value it emits is a fixed
 * token, a small integer, or an identifier matched against a strict pattern.
 */

// ---------------------------------------------------------------------------
// Experiment flags (query string). OFF unless explicitly present.
// ---------------------------------------------------------------------------

export type FairPlayDiagFlags = {
  /** `?fpks=1_0`: configure ONLY `com.apple.fps.1_0` (Gumlet's public Shaka sample). */
  legacyKeySystemOnly: boolean;
  /** `?fpcors=0`: do not set `crossorigin` on the FairPlay `<video>` element. */
  omitCrossOrigin: boolean;
};

export const DEFAULT_FAIRPLAY_DIAG_FLAGS: FairPlayDiagFlags = {
  legacyKeySystemOnly: false,
  omitCrossOrigin: false,
};

/**
 * Read the diagnostic flags from a query string. Only the exact values
 * `fpks=1_0` and `fpcors=0` enable anything; every other value, a missing
 * parameter, or an unparsable string leaves production behaviour unchanged.
 */
export function parseFairPlayDiagFlags(search: string | null | undefined): FairPlayDiagFlags {
  if (!search) return DEFAULT_FAIRPLAY_DIAG_FLAGS;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return DEFAULT_FAIRPLAY_DIAG_FLAGS;
  }
  return {
    legacyKeySystemOnly: params.get('fpks') === '1_0',
    omitCrossOrigin: params.get('fpcors') === '0',
  };
}

export const FAIRPLAY_MODERN = 'com.apple.fps';
export const FAIRPLAY_LEGACY = 'com.apple.fps.1_0';

/**
 * The FairPlay key systems to configure, in preference order.
 *
 * Default (production): both, modern first - unchanged from the current build.
 * `legacyKeySystemOnly`: only `com.apple.fps.1_0`. In shaka-player 4.11.7 that
 * makes `DrmEngine.attach()` set MediaKeys on the element up front instead of
 * waiting for the `encrypted` event, which it does only for exactly
 * `'com.apple.fps'` (lib/media/drm_engine.js, attach()).
 */
export function fairPlayKeySystems(flags: FairPlayDiagFlags): string[] {
  return flags.legacyKeySystemOnly ? [FAIRPLAY_LEGACY] : [FAIRPLAY_MODERN, FAIRPLAY_LEGACY];
}

/** Trace tokens that state which configuration produced a trace. */
export function fairPlayConfigTokens(flags: FairPlayDiagFlags): string[] {
  return [
    flags.legacyKeySystemOnly ? 'CFG_KS_1_0' : 'CFG_KS_DEFAULT',
    flags.omitCrossOrigin ? 'CFG_CORS_OFF' : 'CFG_CORS_ON',
  ];
}

// ---------------------------------------------------------------------------
// Safe extraction from errors
// ---------------------------------------------------------------------------

/**
 * Native error domain and code from a browser `MediaError.message`.
 *
 * Safari's message for a failed native item can name an Apple error domain and
 * an integer (e.g. a CoreMedia code). Only that pair is returned, as
 * `Domain_code`. The rest of the message - which may quote a URL - is never
 * returned. Returns null when no such pair is present.
 */
export function nativeErrorDomainCode(message: unknown): string | null {
  if (typeof message !== 'string' || message.length === 0) return null;
  const m = /\b([A-Z][A-Za-z]{1,40}ErrorDomain)\b[^0-9-]{0,24}(-?\d{1,9})\b/.exec(message.slice(0, 2000));
  if (!m) return null;
  return `${m[1]}_${m[2]}`;
}

/**
 * HTTP status of a failed licence request, from a Shaka error detail.
 *
 * Shaka reports it as LICENSE_REQUEST_FAILED (6007) wrapping BAD_HTTP_STATUS
 * (1001), whose data is `[uri, status, responseText, headers, type]`. Only the
 * integer at index 1 is read; the URI (which carries the licence token) and the
 * response text are never touched.
 */
export function licenceHttpStatusFromError(detail: { code?: unknown; data?: unknown } | null | undefined): number | null {
  if (!detail || detail.code !== 6007 || !Array.isArray(detail.data)) return null;
  const inner = detail.data[0] as { code?: unknown; data?: unknown } | null | undefined;
  if (!inner || inner.code !== 1001 || !Array.isArray(inner.data)) return null;
  const status = inner.data[1];
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

/** A key-system string reduced to a safe token, or `OTHER`. */
export function keySystemToken(keySystem: unknown): string {
  if (typeof keySystem !== 'string' || keySystem.length === 0) return 'NONE';
  return /^[a-z0-9._-]{1,40}$/i.test(keySystem) ? keySystem : 'OTHER';
}

// ---------------------------------------------------------------------------
// Timestamped, counted trace
// ---------------------------------------------------------------------------

export type TraceEntry = { token: string; firstMs: number; count: number };

/**
 * Add an event to the trace. The first occurrence fixes the token's position
 * and its timestamp (ms since the player effect started); repeats only bump the
 * count, so a second `encrypted` event is visible instead of being swallowed.
 */
export function appendTraceEvent(prev: readonly TraceEntry[], token: string, atMs: number): TraceEntry[] {
  const i = prev.findIndex((e) => e.token === token);
  if (i < 0) return [...prev, { token, firstMs: Math.max(0, Math.round(atMs)), count: 1 }];
  const next = prev.slice();
  next[i] = { ...prev[i]!, count: prev[i]!.count + 1 };
  return next;
}

/** `TOKEN@ms` (and `xN` when it fired N > 1 times), joined by `sep`. */
export function formatTrace(entries: readonly TraceEntry[], sep: string): string {
  return entries.map((e) => `${e.token}@${e.firstMs}${e.count > 1 ? `x${e.count}` : ''}`).join(sep);
}
