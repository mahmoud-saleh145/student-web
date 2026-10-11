/**
 * Gumlet FairPlay licence exchange: SPC request / CKC response.
 *
 * WHAT THIS MATCHES, AND WHY IT IS NOT SHAKA'S DEFAULT
 *
 * Gumlet's FairPlay licence server (`fairplay.gumlet.com/licence/...`) speaks
 * JSON in both directions. Its own browser reference implementation -
 * `gumlet/drm-react-js`, `src/App.js` - does exactly this:
 *
 *   request : POST {"spc": "<standard base64 of the SPC message>"}
 *             with `Content-Type: application/json`
 *   response: 200  {"ckc": "<base64 of the CKC>"}
 *
 * Shaka's generic FairPlay tutorial expects a DIFFERENT contract: a
 * form-encoded `spc=<urlencoded base64>` body, and a response that is either
 * raw base64 or wrapped in a `<ckc>...</ckc>` XML envelope. That is what
 * `shaka.util.FairPlayUtils.commonFairPlayResponse` implements.
 *
 * So that Shaka helper must NOT be used against Gumlet - it would fail to
 * parse the JSON envelope. The transforms below implement Gumlet's documented
 * contract instead. (Gumlet's own player-setup page still shows
 * `shaka.drm.FairPlay.gumletFairPlayRequest`, but no Shaka release ships that
 * symbol: 4.11.7 exposes only the conax/expressplay/ezdrm/verimatrix
 * variants, under `shaka.util.FairPlayUtils`.)
 *
 * These functions are deliberately free of Shaka imports so they can be
 * unit-tested without a browser or a CDM. `DrmVideo.tsx` wraps them in Shaka's
 * `registerRequestFilter` / `registerResponseFilter`.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Normalises anything Shaka may hand us into a byte view. */
function asBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

/** Standard base64 with padding, matching `btoa` byte-for-byte. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** Inverse of {@link toBase64}. Returns an exact-sized array, never a view. */
export function fromBase64(input: string): Uint8Array {
  const cleaned = input.replace(/\s+/g, '').replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((cleaned.length * 3) / 4));
  let written = 0;

  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(cleaned.charAt(i));
    const has1 = i + 1 < cleaned.length;
    const has2 = i + 2 < cleaned.length;
    const has3 = i + 3 < cleaned.length;
    const c1 = has1 ? BASE64_ALPHABET.indexOf(cleaned.charAt(i + 1)) : 0;
    const c2 = has2 ? BASE64_ALPHABET.indexOf(cleaned.charAt(i + 2)) : 0;
    const c3 = has3 ? BASE64_ALPHABET.indexOf(cleaned.charAt(i + 3)) : 0;

    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error('FairPlay licence payload contained invalid base64');
    }

    out[written++] = ((c0 << 2) | (c1 >> 4)) & 0xff;
    if (has2) out[written++] = (((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff;
    if (has3) out[written++] = (((c2 & 0x03) << 6) | c3) & 0xff;
  }

  // slice(), not subarray(): a subarray would share a larger backing buffer and
  // `response.data = bytes.buffer` would then hand the CDM trailing zeroes.
  return out.slice(0, written);
}

/**
 * Wraps the CDM's raw SPC message in Gumlet's JSON envelope.
 *
 * @returns UTF-8 bytes of `{"spc":"<base64>"}` for the licence request body.
 */
export function buildFairPlayLicenseRequest(
  spc: ArrayBuffer | ArrayBufferView | null,
): ArrayBuffer {
  if (!spc) {
    throw new Error('FairPlay licence request carried no SPC message');
  }
  const body = JSON.stringify({ spc: toBase64(asBytes(spc)) });
  return encoder.encode(body).buffer as ArrayBuffer;
}

/**
 * Unwraps Gumlet's `{"ckc":"<base64>"}` response into the raw CKC bytes the
 * CDM expects.
 *
 * Throws with a specific message rather than returning garbage, so a licence
 * failure surfaces as a licence failure instead of a decode error.
 */
export function parseFairPlayLicenseResponse(
  data: ArrayBuffer | ArrayBufferView | null,
): ArrayBuffer {
  if (!data) {
    throw new Error('FairPlay licence response was empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(data as ArrayBuffer));
  } catch {
    throw new Error('FairPlay licence response was not valid JSON');
  }

  const ckc = (parsed as { ckc?: unknown } | null)?.ckc;
  if (typeof ckc !== 'string' || ckc.length === 0) {
    throw new Error('FairPlay licence response contained no ckc field');
  }

  return fromBase64(ckc).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Content ID derivation from Gumlet's `skd://` signalling
// ---------------------------------------------------------------------------

/**
 * WHY A CUSTOM INIT-DATA TRANSFORM IS REQUIRED HERE
 *
 * Shaka 4.11.7's HLS parser maps `KEYFORMAT=com.apple.streamingkeydelivery`
 * to a DrmInfo like this:
 *
 *   keySystem        'com.apple.fps'
 *   initDataType     'sinf'
 *   initData         new Uint8Array(0)     <- EMPTY
 *   keySystemUris    Set { 'skd://<id>' }
 *
 * Shaka's DEFAULT init-data transform is guarded on `initDataType === 'skd'`,
 * a type only produced by the legacy Apple MediaKeys polyfill. This content
 * arrives as 'sinf', so the default returns the empty buffer untouched: no
 * content id is derived, `FairPlayUtils.initDataTransform` is never called, and
 * Safari builds a licence request for an empty content id that the server
 * cannot satisfy.
 *
 * So the content id has to come from `drmInfo.keySystemUris` instead. Shaka's
 * own FairPlay tutorial documents exactly this: when `initDataType != 'skd'`,
 * "it is possible to get the skd urls from drmInfo".
 */

const SKD_PREFIX = 'skd://';

/**
 * Extract the numeric media-element detail from a Shaka VIDEO_ERROR payload.
 *
 * Shaka raises `VIDEO_ERROR` (3016) from exactly one place: StreamingEngine,
 * when the `<video>` element's `error` property is set. The payload is
 * `[code, MediaError.code, msExtendedCode, message]`.
 *
 * Only the two NUMBERS are returned. `data[3]` is the browser's MediaError
 * message, which can quote a source URL, so it is never read.
 *
 * MediaError.code: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED.
 */
export function videoErrorDetail(detail: {
  code?: number;
  data?: unknown;
} | null | undefined): { code: number; ext?: string } | null {
  if (detail?.code !== 3016) return null;
  const data = detail.data;
  if (!Array.isArray(data)) return null;
  const code = data[1];
  if (typeof code !== 'number' || !Number.isInteger(code)) return null;
  const raw = data[2];
  const ext = typeof raw === 'string' && /^[0-9a-f]+$/i.test(raw) ? raw.toLowerCase() : undefined;
  return { code, ext };
}

/**
 * Stage marker for FairPlay init-data failures.
 *
 * Shaka runs `initDataTransform` deep inside its DRM engine and replaces the
 * thrown error with one of its own, so the only thing that survives into our
 * error handling is the message text. Tagging our failures with this prefix
 * and a fixed code lets the stage be recovered without ever logging the
 * surrounding message - which could quote a URL, a certificate or a licence
 * payload we must not emit.
 */
export const FAIRPLAY_STAGE_PREFIX = '[drm-fp]';

function stageError(code: string, message: string): Error {
  return new Error(`${FAIRPLAY_STAGE_PREFIX}${code}: ${message}`);
}

/** Recover the stage code from a message, or null if it is not one of ours. */
export function fairPlayStageFromMessage(message: unknown): string | null {
  const text =
    typeof message === 'string' ? message : message instanceof Error ? message.message : '';
  if (!text) return null;
  const at = text.indexOf(FAIRPLAY_STAGE_PREFIX);
  if (at < 0) return null;
  const code = /^([A-Z_]+)/.exec(text.slice(at + FAIRPLAY_STAGE_PREFIX.length));
  return code ? `FP_${code[1]}` : null;
}

/** The slice of `shaka.extern.DrmInfo` this module reads. */
export type FairPlayDrmInfo = {
  keySystemUris?: Set<string> | null;
  serverCertificate?: Uint8Array | ArrayBuffer | null;
};

/** Injected so this module stays free of Shaka imports and stays unit-testable. */
export type InitDataBuilder = (
  initData: Uint8Array,
  contentId: string,
  cert: Uint8Array | ArrayBuffer,
) => Uint8Array;

/**
 * Pull the `skd://` URI out of a DrmInfo's key-system URIs.
 *
 * Returns null when there is none, so the caller can fail explicitly instead of
 * proceeding with a guess. A bare `skd://` with no identifier is rejected too:
 * an empty content id is the exact failure this whole path exists to avoid.
 */
export function findSkdUri(keySystemUris: Iterable<string> | null | undefined): string | null {
  if (!keySystemUris) return null;
  for (const uri of keySystemUris) {
    if (typeof uri === 'string' && uri.startsWith(SKD_PREFIX) && uri.length > SKD_PREFIX.length) {
      return uri;
    }
  }
  return null;
}

/**
 * Content id carried by a Gumlet `skd://` URI: everything after the scheme.
 *
 * Verified against the installed Shaka 4.11.7: `defaultGetContentId` returns
 * exactly this for both the `skd://<id>` and `//<id>` forms (the polyfill strips
 * `skd:` before the transform sees it), with no decoding applied.
 */
export function contentIdFromSkdUri(skdUri: string): string {
  // Strip the scheme, then any authority slashes, so `skd://<id>`, the
  // polyfill's `//<id>` and a bare `<id>` all normalise to the same value.
  const id = skdUri.replace(/^skd:/i, '').replace(/^\/+/, '');
  if (!id) {
    throw stageError('NO_SKD_CONTENT_ID', 'FairPlay skd:// URI carried no content identifier');
  }
  return id;
}

/**
 * Build the `drm.initDataTransform` for the FairPlay branch.
 *
 * Configure this ONLY when the ticket's scheme is FairPlay. Widevine keeps
 * Shaka's default behaviour, which is correct for DASH PSSH content.
 *
 * Every failure path throws with a specific message. There is deliberately no
 * fallback that returns `initData` untouched: that is the silent-degradation
 * shape this component refuses elsewhere, and it produces a licence error that
 * is indistinguishable from a server fault.
 *
 * @param build `shaka.util.FairPlayUtils.initDataTransform`, injected.
 */
export function createFairPlayInitDataTransform(build: InitDataBuilder) {
  return (
    initData: Uint8Array,
    initDataType: string,
    drmInfo: FairPlayDrmInfo | null,
  ): Uint8Array => {
    const skdUri = findSkdUri(drmInfo?.keySystemUris);
    if (!skdUri) {
      throw stageError(
        'NO_SKD_URI',
        'FairPlay init data carried no skd:// URI, so no content id could be derived',
      );
    }

    const cert = drmInfo?.serverCertificate;
    if (!cert || cert.byteLength === 0) {
      // Shaka's own helper throws the same way (error 6015). Catching it here
      // turns a numeric code into a stage that names the cause.
      throw stageError(
        'NO_CERTIFICATE',
        'FairPlay init data requires a server certificate; none was fetched',
      );
    }

    return build(initData, contentIdFromSkdUri(skdUri), cert);
  };
}