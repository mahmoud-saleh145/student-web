import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFairPlayLicenseRequest,
  contentIdFromSkdUri,
  createFairPlayInitDataTransform,
  fairPlayStageFromMessage,
  findSkdUri,
  fromBase64,
  parseFairPlayLicenseResponse,
  shouldTransformFairPlayInitData,
  toBase64,
  videoErrorDetail,
  type InitDataBuilder,
} from './fairplay.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

/**
 * Records what the injected legacy builder was handed, and returns a marker.
 * Shared across describes so every init-data test can assert the builder was -
 * or was NOT - reached.
 */
const spyBuilder = () => {
  const calls: Array<{ initData: Uint8Array; contentId: string; cert: Uint8Array }> = [];
  const build: InitDataBuilder = (initData, contentId, cert) => {
    calls.push({ initData, contentId, cert: cert as Uint8Array });
    return new Uint8Array([1, 2, 3]);
  };
  return { calls, build };
};

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

    const out = transform(initData, 'skd', {
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
      () => transform(new Uint8Array([0]), 'skd', { keySystemUris: new Set(['https://x/y']), serverCertificate: CERT }),
      /no skd:\/\/ URI/,
    );
    assert.throws(
      () => transform(new Uint8Array([0]), 'skd', null),
      /no skd:\/\/ URI/,
    );
  });

  it('fails explicitly when the certificate is missing or empty', () => {
    const { build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const uris = new Set(['skd://CONTENTID1234567890abcd']);

    assert.throws(
      () => transform(new Uint8Array([0]), 'skd', { keySystemUris: uris, serverCertificate: null }),
      /requires a server certificate/,
    );
    assert.throws(
      () =>
        transform(new Uint8Array([0]), 'skd', {
          keySystemUris: uris,
          serverCertificate: new Uint8Array(0),
        }),
      /requires a server certificate/,
    );
  });

  it('never falls back to returning the init data untouched on the legacy path', () => {
    // The degraded shape - return initData and let the CDM try anyway - is what
    // produces an opaque licence error. For 'skd' every path must throw instead.
    const { build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const initData = new Uint8Array([7]);

    for (const drmInfo of [null, {}, { keySystemUris: null }, { keySystemUris: new Set<string>() }]) {
      assert.throws(() => transform(initData, 'skd', drmInfo));
    }
  });
});

/**
 * The MEDIA_3 regression, tested behaviourally.
 *
 * Gumlet's FairPlay is signalled through HLS `KEYFORMAT=com.apple.streamingkeydelivery`,
 * which Shaka's HLS parser surfaces as Modern EME: `initDataType: 'sinf'` with an
 * EMPTY init-data buffer and the `skd://` content id on `keySystemUris`.
 *
 * Rebuilding that into the legacy Apple MediaKeys layout strips the key id. The
 * licence still succeeds (Gumlet scopes licences by org and asset, not by key
 * id), so the trace shows `LIC_REQ > LIC_RES > LOADED` and only then does the
 * `cbcs` track fail to decode.
 *
 * These assert the OBSERVABLE contract: modern init data comes back byte-for-byte
 * and the legacy builder is never reached.
 */
describe('FairPlay init data is only rebuilt for the legacy type', () => {
  const CERT = new Uint8Array([1, 2, 3, 4]);
  const uris = new Set(['skd://CONTENTID1234567890abcd']);

  it('only transforms the legacy skd type', () => {
    assert.equal(shouldTransformFairPlayInitData('skd'), true);
  });

  it('does not transform Modern EME sinf', () => {
    assert.equal(shouldTransformFairPlayInitData('sinf'), false);
  });

  it('does not transform the other known init-data types', () => {
    for (const type of ['cenc', 'keyids', 'webm', 'mpegdash', 'unknown', '']) {
      assert.equal(shouldTransformFairPlayInitData(type), false);
    }
  });

  it('does not transform a missing init-data type', () => {
    assert.equal(shouldTransformFairPlayInitData(null), false);
    assert.equal(shouldTransformFairPlayInitData(undefined), false);
  });

  it('returns sinf init data unchanged and never calls the legacy builder', () => {
    // The regression itself. With no skd:// URI and no certificate at all -
    // the real shape for a sinf stream whose sinf lives in the init segment -
    // a builder that ran would either throw or emit a stripped blob. Passing
    // through is the only correct answer, and it must not need any drmInfo.
    const { calls, build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const empty = new Uint8Array(0);

    const out = transform(empty, 'sinf', null);

    assert.equal(out, empty, 'must return the very same buffer instance');
    assert.deepEqual([...out], []);
    assert.equal(calls.length, 0, 'the legacy builder must not be invoked');
  });

  it('returns a non-empty sinf buffer byte-for-byte', () => {
    const { calls, build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const sinf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    const out = transform(sinf, 'sinf', { keySystemUris: uris, serverCertificate: CERT });

    assert.deepEqual([...out], [0xde, 0xad, 0xbe, 0xef]);
    assert.equal(calls.length, 0);
  });

  it('leaves any other non-legacy type untouched as well', () => {
    const { calls, build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const buf = new Uint8Array([4, 5]);

    const out = transform(buf, 'cenc', { keySystemUris: uris, serverCertificate: CERT });

    assert.equal(out, buf);
    assert.equal(calls.length, 0);
  });

  it('does not throw on modern init data even with no skd:// URI or certificate', () => {
    // Guards against the guard being inverted: 'sinf' must never reach the
    // NO_SKD_URI / NO_CERTIFICATE failure paths.
    const { build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);

    for (const drmInfo of [null, {}, { keySystemUris: new Set<string>() }, { keySystemUris: null }]) {
      assert.doesNotThrow(() => transform(new Uint8Array([1]), 'sinf', drmInfo as never));
    }
  });

  it('still rebuilds skd, passing the derived content id, init data and cert', () => {
    const { calls, build } = spyBuilder();
    const transform = createFairPlayInitDataTransform(build);
    const initData = new Uint8Array([9, 9]);

    const out = transform(initData, 'skd', { keySystemUris: uris, serverCertificate: CERT });

    assert.deepEqual([...out], [1, 2, 3]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.contentId, 'CONTENTID1234567890abcd');
    assert.deepEqual([...calls[0]!.initData], [9, 9]);
    assert.deepEqual([...calls[0]!.cert], [...CERT]);
  });
});

/**
 * Shaka replaces anything thrown inside `initDataTransform` with its own error,
 * so the stage has to survive as text. These tests pin both halves: that our
 * failures are tagged, and that recovery extracts ONLY the tag - never the
 * surrounding message, which could quote a URL, certificate or payload.
 */
describe('FairPlay failure stage tagging', () => {
  const CERT = new Uint8Array([1, 2, 3, 4]);
  const uris = new Set(['skd://CONTENTID1234567890abcd']);

  const failingTransform = (drmInfo: unknown) =>
    createFairPlayInitDataTransform((() => new Uint8Array()) as InitDataBuilder)(
      new Uint8Array([0]),
      'skd',
      drmInfo as never,
    );

  it('tags a missing skd:// URI', () => {
    try {
      failingTransform({ keySystemUris: new Set(['https://x/y']), serverCertificate: CERT });
      assert.fail('should have thrown');
    } catch (e) {
      assert.equal(fairPlayStageFromMessage((e as Error).message), 'FP_NO_SKD_URI');
    }
  });

  it('tags a missing certificate', () => {
    try {
      failingTransform({ keySystemUris: uris, serverCertificate: null });
      assert.fail('should have thrown');
    } catch (e) {
      assert.equal(fairPlayStageFromMessage((e as Error).message), 'FP_NO_CERTIFICATE');
    }
  });

  it('tags an empty content identifier', () => {
    assert.throws(
      () => contentIdFromSkdUri('skd://'),
      /NO_SKD_CONTENT_ID|carried no content identifier/,
    );
  });

  it('recovers the stage even when Shaka re-wraps the message', () => {
    // Shaka prefixes its own text; the tag must still be found.
    const wrapped = 'DrmEngine: key system error [drm-fp]NO_SKD_URI: no content id';
    assert.equal(fairPlayStageFromMessage(wrapped), 'FP_NO_SKD_URI');
  });

  it('returns null for anything that is not one of our tags', () => {
    assert.equal(fairPlayStageFromMessage('LICENSE_REQUEST_FAILED'), null);
    assert.equal(fairPlayStageFromMessage(''), null);
    assert.equal(fairPlayStageFromMessage(undefined), null);
    assert.equal(fairPlayStageFromMessage(null), null);
    assert.equal(fairPlayStageFromMessage(new Error('plain')), null);
  });

  it('never leaks message text through the recovered stage', () => {
    try {
      failingTransform({ keySystemUris: uris, serverCertificate: new Uint8Array(0) });
      assert.fail('should have thrown');
    } catch (e) {
      const stage = fairPlayStageFromMessage((e as Error).message);
      assert.ok(stage);
      assert.match(stage, /^FP_[A-Z_]+$/);
      // The human sentence, the scheme and the payload shape must all be gone;
      // only the bare code survives.
      assert.ok(!/https?:|skd:\/\/|none was fetched|carried no content identifier/i.test(stage));
    }
  });
});

/**
 * Shaka raises VIDEO_ERROR (3016) from exactly one place - StreamingEngine,
 * reading the <video> element's error - and it does so only after DRM init and
 * the licence exchange. The payload is
 * [code, MediaError.code, msExtendedCode, message].
 *
 * MediaError.code is the discriminator that separates a Safari media-layer
 * refusal from anything DRM-related: 1 ABORTED, 2 NETWORK, 3 DECODE,
 * 4 SRC_NOT_SUPPORTED.
 */
describe('VIDEO_ERROR media-element detail', () => {
  it('extracts MediaError.code and msExtendedCode from a REAL 4.11.7 payload', () => {
    // shaka-player 4.11.7 builds this error as
    //   new Error(VIDEO_ERROR, mediaError.code,
    //             mediaError.msExtendedCode.toString(16), mediaError.message)
    // so the MediaError code is index 0 with NO leading 3016. This is the
    // shape that actually reaches the handler; the one below it is historical.
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [3, '80004005', 'msg'] }), {
      code: 3,
      ext: '80004005',
    });
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [4, '1', 'unsupported'] }), {
      code: 4,
      ext: '1',
    });
    // Safari frequently reports msExtendedCode as absent/zero.
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [2] }), { code: 2, ext: undefined });
  });

  it('REGRESSION: a decode failure must not be reported as a bare VIDEO_ERROR', () => {
    // The decoder used to read index 1, which holds a hex STRING on a real
    // payload, so it returned null and the MediaError code was lost entirely.
    const detail = videoErrorDetail({ code: 3016, data: [3, '80004005', 'decode failed'] });
    assert.notEqual(detail, null, 'MediaError.code 3 (DECODE) must survive decoding');
    assert.equal(detail?.code, 3);
  });

  it('still accepts the legacy layout with a leading 3016', () => {
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [3016, 4, '80004005', 'msg'] }), {
      code: 4,
      ext: '80004005',
    });
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [3016, 3] }), { code: 3, ext: undefined });
  });

  it('ignores payloads from other Shaka error codes', () => {
    // A licence failure must not be mislabelled as a media failure.
    assert.equal(videoErrorDetail({ code: 6008, data: [6008, 4, 'x', 'msg'] }), null);
    assert.equal(videoErrorDetail({ code: 6001, data: [6001, 4, 'x'] }), null);
    // A licence error carrying a numeric first field must not be read as one.
    assert.equal(videoErrorDetail({ code: 6008, data: [3, '80004005'] }), null);
  });

  it('never returns the browser MediaError message', () => {
    const detail = videoErrorDetail({
      code: 3016,
      data: [2, 'ff', 'The media could not be loaded from https://v.example/main.m3u8'],
    });
    const serialised = JSON.stringify(detail);
    assert.ok(!/https?:|example|media could not/i.test(serialised));
    assert.equal(detail?.code, 2);
  });

  it('is defensive about malformed payloads', () => {
    assert.equal(videoErrorDetail(null), null);
    assert.equal(videoErrorDetail(undefined), null);
    assert.equal(videoErrorDetail({ code: 3016, data: 'nope' }), null);
    assert.equal(videoErrorDetail({ code: 3016, data: [3016] }), null);
    assert.equal(videoErrorDetail({ code: 3016, data: [3016, 'four'] }), null);
    // A non-hex extended code is dropped rather than emitted.
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [3016, 1, 'not-hex!!'] }), {
      code: 1,
      ext: undefined,
    });
    assert.deepEqual(videoErrorDetail({ code: 3016, data: [1, 'not-hex!!'] }), {
      code: 1,
      ext: undefined,
    });
    // No integer field at either index -> nothing safe to report.
    assert.equal(videoErrorDetail({ code: 3016, data: [] }), null);
    assert.equal(videoErrorDetail({ code: 3016, data: [null, 'x'] }), null);
  });
});