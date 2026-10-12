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

/**
 * Extract the numeric media-element detail from a Shaka VIDEO_ERROR payload.
 *
 * Shaka raises `VIDEO_ERROR` (3016) from exactly one place: StreamingEngine,
 * when the `<video>` element's `error` property is set.
 *
 * THE PAYLOAD SHAPE, in shaka-player 4.11.7, is
 *
 *     new Error(VIDEO_ERROR, mediaError.code,
 *               mediaError.msExtendedCode.toString(16), mediaError.message)
 *
 * i.e. `[MediaError.code, msExtendedCodeHex, message]`. The MediaError code is
 * at index 0 and there is NO leading 3016.
 *
 * This module previously assumed `[code, MediaError.code, msExtendedCode,
 * message]` and read index 1. Against the real payload that index holds a HEX
 * STRING, so the decoder returned null for every genuine media error and the
 * player reported a bare `ERR_VIDEO_ERROR` with the MediaError code missing
 * entirely - which is precisely the detail needed to tell a DECODE failure from
 * a NETWORK one. The unit tests encoded the same wrong shape, so they passed
 * while production returned null. Both shapes are now accepted; the legacy
 * layout is recognised by its leading 3016, which can never be a MediaError
 * code.
 *
 * Only the two NUMBERS are returned. The trailing element is the browser's
 * MediaError message, which can quote a source URL, so it is never read.
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

  // The current layout puts the MediaError code at index 0. 3016 is Shaka's own
  // error code and is never a MediaError code, so its presence identifies the
  // legacy layout unambiguously.
  const isCurrentLayout =
    typeof data[0] === 'number' && Number.isInteger(data[0]) && data[0] !== 3016;
  const isLegacyLayout =
    !isCurrentLayout &&
    data[0] === 3016 &&
    typeof data[1] === 'number' &&
    Number.isInteger(data[1]);

  if (!isCurrentLayout && !isLegacyLayout) return null;

  const code = isCurrentLayout ? data[0] : data[1];
  const raw = isCurrentLayout ? data[1] : data[2];
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

/**
 * Recover the FairPlay stage from a Shaka error, wherever Shaka put it.
 *
 * Shaka's `util.Error` builds its own message and hardcodes it:
 *
 *   this.message = 'Shaka Error ' + this.code;
 *
 * so `message` carries the CODE and nothing else - never the text of whatever
 * was thrown. When our own `drm.initDataTransform` throws, Shaka wraps it:
 *
 *   catch (e) { err = e instanceof T ? e : new T(SEVERITY, 6, 6016, e) }
 *
 * and the tagged message survives only inside `data[0]`.
 *
 * That made `fairPlayStageFromMessage(detail.message)` return null for exactly
 * the failure it exists to explain: the stage rendered as the generic
 * `INIT_DATA_TRANSFORM_ERROR` (6016) while the tagged reason was silently
 * discarded. This is where a tagged reason is read back.
 *
 * Only the fixed `[A-Z_]+` token after our own prefix is ever returned; the
 * surrounding text is never propagated, since it could quote a URI.
 */
export function fairPlayStageFromErrorDetail(detail: {
  code?: unknown;
  message?: unknown;
  data?: unknown;
} | null | undefined): string | null {
  const direct = fairPlayStageFromMessage(detail?.message);
  if (direct) return direct;
  const data = detail?.data;
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    const stage = fairPlayStageFromMessage(item);
    if (stage) return stage;
  }
  return null;
}

// ---------------------------------------------------------------------------
// FairPlay init data
// ---------------------------------------------------------------------------

/** Shaka 4.11.7's `shaka.extern.InitDataTransform`, kept local so this module stays Shaka-free. */
export type InitDataTransform<DrmInfo> = (
  initData: Uint8Array,
  initDataType: string,
  drmInfo: DrmInfo,
) => Uint8Array;

/**
 * Wrap Shaka's own default `drm.initDataTransform` so the trace can record which
 * init-data type arrived, without changing what reaches `generateRequest`.
 *
 * Why there is no FairPlay-specific rebuild here any more (verified against the
 * shipped shaka-player 4.11.7):
 *
 *  - Shaka's default rebuilds `'skd'` init data into the legacy
 *    `[skd][contentId][certificate]` layout ONLY when a media-keys polyfill is
 *    installed (`Platform.isMediaKeysPolyfilled()`, i.e.
 *    `window.shakaMediaKeysPolyfill`). The legacy Apple polyfill is not
 *    registered with `shaka.polyfill.installAll()` and this app never installs
 *    it, so iPhone Safari runs Modern EME and receives the `encrypted` event's
 *    init data unchanged - which is what Modern EME FairPlay expects.
 *  - On the native `src=` route the iPhone takes, Shaka builds the DrmInfo from
 *    `drm.servers` and never sets `keySystemUris`. A transform that derives the
 *    content id from `keySystemUris` therefore threw on every FairPlay play
 *    (`ERR_FP_NO_SKD_URI`, no licence request - real-device trace 2026-10-12).
 *
 * Delegating to the default instead of re-implementing its polyfill check keeps
 * the decision with the library that owns it. Only the init-data TYPE (a fixed
 * EME token such as `skd`) is reported; the init-data bytes are never read.
 */
export function traceInitDataTransform<DrmInfo>(
  shakaDefault: InitDataTransform<DrmInfo>,
  onInitDataType: (initDataType: string) => void,
): InitDataTransform<DrmInfo> {
  return (initData, initDataType, drmInfo) => {
    onInitDataType(initDataType);
    return shakaDefault(initData, initDataType, drmInfo);
  };
}
