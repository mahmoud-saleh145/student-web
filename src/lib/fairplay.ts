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