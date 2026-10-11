import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFairPlayLicenseRequest,
  contentIdFromSkdUri,
  createFairPlayInitDataTransform,
  findSkdUri,
  fromBase64,
  parseFairPlayLicenseResponse,
  toBase64,
  type InitDataBuilder,
} from './fairplay.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

/**
 * These lock the wire format to Gumlet's documented contract, taken from
 * Gumlet's own browser reference implementation (`gumlet/drm-react-js`,
 * `src/App.js`):
 *
 *   request : {"spc": "<standard base64 of the SPC>"}
 *   response: {"ckc": "<base64 of the CKC>"}
 *
 * Shaka's generic FairPlay contract (form-encoded `spc=`, `<ckc>` XML wrapper)
 * is deliberately NOT what we implement - using it against Gumlet would leave
 * the response undecoded.
 */
describe('FairPlay SPC/CKC wire format', () => {
  it('encodes base64 exactly like btoa, including padding', () => {
    // Known vectors: "", "f", "fo", "foo", "foob", "fooba", "foobar".
    assert.equal(toBase64(bytes()), '');
    assert.equal(toBase64(bytes(0x66)), 'Zg==');
    assert.equal(toBase64(bytes(0x66, 0x6f)), 'Zm8=');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f)), 'Zm9v');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f, 0x62)), 'Zm9vYg==');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f, 0x62, 0x61)), 'Zm9vYmE=');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72)), 'Zm9vYmFy');
  });

  it('round-trips binary through base64', () => {
    const original = new Uint8Array(512);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7 + 3) & 0xff;
    assert.deepEqual(fromBase64(toBase64(original)), original);
  });

  it('decodes to an exact-length buffer, never an oversized view', () => {
    // A subarray would share a larger backing buffer and `response.data =
    // bytes.buffer` would then hand the CDM trailing zero bytes.
    const decoded = fromBase64('Zm9vYmFy');
    assert.equal(decoded.byteLength, 6);
    assert.equal(decoded.buffer.byteLength, 6);
    assert.deepEqual(decoded, bytes(0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72));
  });

  it('builds the SPC request as Gumlet JSON', () => {
    const spc = bytes(0x01, 0x02, 0x03, 0x04);
    const body = buildFairPlayLicenseRequest(spc);
    const text = new TextDecoder().decode(body);

    assert.deepEqual(JSON.parse(text), { spc: 'AQIDBA==' });
    assert.deepEqual(fromBase64((JSON.parse(text) as { spc: string }).spc), spc);
  });

  it('refuses to build a request with no SPC message', () => {
    assert.throws(() => buildFairPlayLicenseRequest(null), /no SPC message/);
  });

  it('parses the CKC response into raw bytes', () => {
    const ckc = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]);
    const response = new TextEncoder().encode(JSON.stringify({ ckc: toBase64(ckc) })).buffer;

    const parsed = parseFairPlayLicenseResponse(response);
    assert.equal(parsed.byteLength, ckc.byteLength);
    assert.deepEqual(new Uint8Array(parsed), ckc);
  });

  it('rejects a response that is not JSON', () => {
    const response = new TextEncoder().encode('<ckc>3q2+7w==</ckc>').buffer;
    // Shaka's default shape would arrive here; it must not be silently accepted.
    assert.throws(() => parseFairPlayLicenseResponse(response), /not valid JSON/);
  });

  it('rejects a JSON response with no ckc field', () => {
    const response = new TextEncoder().encode('{"error":"invalid token"}').buffer;
    assert.throws(() => parseFairPlayLicenseResponse(response), /no ckc field/);
  });

  it('rejects an empty response', () => {
    assert.throws(() => parseFairPlayLicenseResponse(null), /was empty/);
  });
});

/**
 * Shaka's HLS parser hands FairPlay content through as `initDataType: 'sinf'`
 * with an EMPTY buffer, putting the `skd://` URI on `drmInfo.keySystemUris`.
 * Its default transform only fires for `'skd'`, so the content id has to come
 * from the key-system URI. These tests pin that derivation and, importantly,
 * that every missing-input case FAILS rather than degrading.
 */
describe('FairPlay skd:// content id derivation', () => {
  const CERT = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

  /** Records what the injected builder was handed, and returns a marker. */
  const spyBuilder = () => {
    const calls: Array<{ initData: Uint8Array; contentId: string; cert: Uint8Array }> = [];
    const build: InitDataBuilder = (initData, contentId, cert) => {
      calls.push({ initData, contentId, cert: cert as Uint8Array });
      return new Uint8Array([1, 2, 3]);
    };
    return { calls, build };
  };

  it('finds the skd:// URI among other key-system URIs', () => {
    const uris = new Set(['https://example.test/other', 'skd://CONTENTID1234567890abcd']);
    assert.equal(findSkdUri(uris), 'skd://CONTENTID1234567890abcd');
  });

  it('returns null rather than guessing when there is no skd:// URI', () => {
    assert.equal(findSkdUri(null), null);
    assert.equal(findSkdUri(undefined), null);
    assert.equal(findSkdUri(new Set()), null);
    assert.equal(findSkdUri(new Set(['https://example.test/x'])), null);
    // A bare scheme with no identifier would yield an empty content id.
    assert.equal(findSkdUri(new Set(['skd://'])), null);
  });

  it('takes the content id from everything after the skd:// scheme', () => {
    assert.equal(contentIdFromSkdUri('skd://CONTENTID1234567890abcd'), 'CONTENTID1234567890abcd');
    // The polyfill strips `skd:` before the transform runs, so the parser can
    // hand us either shape; both must yield the same id.
    assert.equal(contentIdFromSkdUri('//CONTENTID1234567890abcd'), 'CONTENTID1234567890abcd');
  });

  it('passes the derived content id and certificate to the builder', () => {
    const { calls, build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const initData = new Uint8Array([9, 9]);

    const out = transform(initData, 'sinf', {
      keySystemUris: new Set(['skd://CONTENTID1234567890abcd']),
      serverCertificate: CERT,
    });

    assert.deepEqual([...out], [1, 2, 3]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.contentId, 'CONTENTID1234567890abcd');
    assert.deepEqual([...calls[0]!.initData], [9, 9]);
    assert.deepEqual([...calls[0]!.cert], [...CERT]);
  });

  it('fails explicitly when there is no skd:// URI', () => {
    const { build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);

    assert.throws(
      () => transform(new Uint8Array([0]), 'sinf', { keySystemUris: new Set(['https://x/y']), serverCertificate: CERT }),
      /no skd:\/\/ URI/,
    );
    assert.throws(
      () => transform(new Uint8Array([0]), 'sinf', null),
      /no skd:\/\/ URI/,
    );
  });

  it('fails explicitly when the certificate is missing or empty', () => {
    const { build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const uris = new Set(['skd://CONTENTID1234567890abcd']);

    assert.throws(
      () => transform(new Uint8Array([0]), 'sinf', { keySystemUris: uris, serverCertificate: null }),
      /requires a server certificate/,
    );
    assert.throws(
      () =>
        transform(new Uint8Array([0]), 'sinf', {
          keySystemUris: uris,
          serverCertificate: new Uint8Array(0),
        }),
      /requires a server certificate/,
    );
  });

  it('never falls back to returning the init data untouched', () => {
    // The degraded shape - return initData and let the CDM try anyway - is what
    // produces an opaque licence error. Every path must throw instead.
    const { build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const initData = new Uint8Array([7]);

    for (const drmInfo of [null, {}, { keySystemUris: null }, { keySystemUris: new Set<string>() }]) {
      assert.throws(() => transform(initData, 'sinf', drmInfo));
    }
  });
});