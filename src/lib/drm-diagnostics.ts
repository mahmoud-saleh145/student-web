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
 * What KIND of failure a native `MediaError.message` describes, as a fixed token.
 *
 * WHY THIS IS SO CONSERVATIVE
 *
 * Safari surfaces most decode failures as a generic "Decode error" or as prose
 * that quotes the offending source URL. There is NO reliable browser field that
 * separates "this content is in a codec or container Safari cannot play" from
 * "this content is fine but the decryption key has not arrived". So there is
 * deliberately NO codec or format category here: claiming one would turn a
 * guess into a log line that later reads like a finding.
 *
 * What can be said honestly is which *subject* the message names. These are
 * keyword categories, checked in a fixed order, and they are the minimum that
 * still separates the two live hypotheses: a message about keys versus a
 * message about decoding generally.
 *
 * `DOMAIN` outranks the keywords because an Apple error domain plus integer is
 * strictly more specific than any keyword. What that integer MEANS is not
 * interpreted here - `nativeErrorDomainCode` reports the pair verbatim and
 * nothing more. Do not map CoreMedia codes to causes without a reference.
 *
 * `UNMAPPED` is the honest default: a message existed, it just did not say
 * anything we are prepared to classify.
 */
export type NativeErrorClass =
  | 'NONE'
  | 'DOMAIN'
  | 'KEY'
  | 'UNSUPPORTED'
  | 'DECODE'
  | 'NETWORK'
  | 'UNMAPPED';

const NATIVE_ERROR_CLASS_RULES: ReadonlyArray<{ token: NativeErrorClass; test: RegExp }> = [
  // Keyed first: a key-related decode failure is the case worth knowing.
  { token: 'KEY', test: /\b(?:decrypt\w*|encrypt\w*|fairplay|licen[sc]e\w*|keys?|content key|sample (?:data|buffer|description))\b/i },
  // Safari's explicit refusals. Never inferred from the media error code alone.
  { token: 'UNSUPPORTED', test: /\b(not supported|unsupported|cannot (?:open|load|decode)|no supported source|could not be (?:opened|played))\b/i },
  { token: 'DECODE', test: /\bdecod\w*\b/i },
  { token: 'NETWORK', test: /\b(network|download|fetch|timeout|timed out|could not be loaded)\b/i },
];

/**
 * Classify a native `MediaError.message` into a fixed token.
 *
 * The message itself is NEVER returned, embedded or logged - it routinely
 * contains the source URL. Only one of a small set of constants comes back, so
 * a URL, a signed query string, a licence token or an `skd://` value cannot
 * reach a trace, a screenshot or a console log through this function.
 */
export function nativeErrorClass(message: unknown): NativeErrorClass {
  if (typeof message !== 'string' || message.length === 0) return 'NONE';
  // Reuse the domain probe so `DOMAIN` and `NERR_*` can never disagree.
  if (nativeErrorDomainCode(message) !== null) return 'DOMAIN';
  const head = message.slice(0, 2000);
  for (const rule of NATIVE_ERROR_CLASS_RULES) {
    if (rule.test.test(head)) return rule.token;
  }
  return 'UNMAPPED';
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
