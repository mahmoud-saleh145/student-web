import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFairPlayLicenseRequest,
  fairPlayStageFromErrorDetail,
  fairPlayStageFromMessage,
  fromBase64,
  parseFairPlayLicenseResponse,
  toBase64,
  traceInitDataTransform,
  videoErrorDetail,
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
 * The FairPlay init-data transform must not alter init data itself.
 *
 * Shaka 4.11.7's default already does the right thing: Modern EME (iPhone
 * Safari) gets the `encrypted` event's init data unchanged, and the legacy Apple
 * layout is rebuilt only when Shaka's legacy media-keys polyfill is installed.
 * Our wrapper exists only to record the init-data TYPE for the on-screen trace.
 *
 * The previous transform rebuilt 'skd' itself and derived the content id from
 * `drmInfo.keySystemUris`. On the native `src=` route Shaka never sets that
 * field, so it threw on every FairPlay play (real iPhone trace 2026-10-12:
 * `ENC_skd > IDT_skd > ERR_FP_NO_SKD_URI`, no licence request). The DrmInfo used
 * below mirrors that real shape: no keySystemUris at all.
 */
describe('FairPlay init-data transform delegates to Shaka', () => {
  /** DrmInfo as Shaka builds it for native src= playback: from drm.servers only. */
  const srcEqualsDrmInfo = {
    keySystem: 'com.apple.fps',
    licenseServerUri: 'https://licence.example/x',
    serverCertificate: new Uint8Array([1, 2, 3]),
    serverCertificateUri: '',
    initData: [],
    keyIds: new Set<string>(),
  };

  const recordingDefault = () => {
    const calls: Array<{ initData: Uint8Array; initDataType: string; drmInfo: unknown }> = [];
    const result = new Uint8Array([7, 7, 7]);
    const fn = (initData: Uint8Array, initDataType: string, drmInfo: unknown) => {
      calls.push({ initData, initDataType, drmInfo });
      return result;
    };
    return { calls, fn, result };
  };

  it("hands every argument to Shaka's default, untouched, and returns its result", () => {
    const { calls, fn, result } = recordingDefault();
    const initData = new Uint8Array([0x73, 0x6b, 0x64]);
    const out = traceInitDataTransform(fn, () => {})(initData, 'skd', srcEqualsDrmInfo);

    assert.equal(out, result, 'must return exactly what the default returned');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.initData, initData, 'same buffer instance, not a copy or rebuild');
    assert.equal(calls[0]!.initDataType, 'skd');
    assert.equal(calls[0]!.drmInfo, srcEqualsDrmInfo);
  });

  it('does not throw for skd on the real src= DrmInfo, which has no keySystemUris', () => {
    // The regression itself: the old transform threw NO_SKD_URI here.
    assert.ok(!('keySystemUris' in srcEqualsDrmInfo));
    const passThrough = (initData: Uint8Array) => initData;
    const initData = new Uint8Array([1]);
    assert.equal(traceInitDataTransform(passThrough, () => {})(initData, 'skd', srcEqualsDrmInfo), initData);
  });

  it('reports the init-data type before delegating', () => {
    const order: string[] = [];
    const transform = traceInitDataTransform(
      (initData: Uint8Array) => {
        order.push('default');
        return initData;
      },
      (type) => order.push(`type:${type}`),
    );
    transform(new Uint8Array(), 'skd', null);
    transform(new Uint8Array(), 'sinf', null);
    assert.deepEqual(order, ['type:skd', 'default', 'type:sinf', 'default']);
  });

  it('reports only the init-data type, never the init-data bytes', () => {
    const seen: unknown[] = [];
    const transform = traceInitDataTransform((initData: Uint8Array) => initData, (...args) => {
      seen.push(...args);
    });
    transform(new Uint8Array([9, 9, 9]), 'skd', srcEqualsDrmInfo);
    assert.deepEqual(seen, ['skd']);
  });

  it("lets an error from Shaka's default propagate rather than swallowing it", () => {
    // Shaka turns a throw here into INIT_DATA_TRANSFORM_ERROR (6016). Hiding it
    // would replace a diagnosable error with a silent bad licence request.
    const boom = new Error('certificate required');
    const transform = traceInitDataTransform(() => {
      throw boom;
    }, () => {});
    assert.throws(() => transform(new Uint8Array(), 'skd', null), (e) => e === boom);
  });
});

/**
 * Shaka replaces anything thrown inside `initDataTransform` with its own error,
 * so a tagged stage has to survive as text. These tests pin that recovery
 * extracts ONLY the tag - never the surrounding message, which could quote a
 * URL, certificate or payload.
 */
describe('FairPlay failure stage tagging', () => {
  it('recovers a tag at the start of a message', () => {
    assert.equal(fairPlayStageFromMessage('[drm-fp]NO_CERTIFICATE: detail'), 'FP_NO_CERTIFICATE');
    assert.equal(fairPlayStageFromMessage(new Error('[drm-fp]NO_SKD_URI: detail')), 'FP_NO_SKD_URI');
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
    const stage = fairPlayStageFromMessage(
      '[drm-fp]NO_CERTIFICATE: none was fetched from https://cert.example/skd://abc',
    );
    assert.ok(stage);
    assert.match(stage, /^FP_[A-Z_]+$/);
    assert.ok(!/https?:|skd:\/\/|none was fetched/i.test(stage));
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
describe('stage recovery from a Shaka error detail', () => {
  // Shaka's util.Error hardcodes `this.message = 'Shaka Error ' + this.code`,
  // so `message` never contains what was thrown. When our initDataTransform
  // throws, Shaka wraps it as `new T(2, 6, 6016, thrownError)` - the tagged
  // text survives only at data[0]. That is the shape the deployed trace took:
  // `ERR_INIT_DATA_TRANSFORM_ERROR`, with the real stage discarded.
  it('reads the stage from data[0] when message is only the code', () => {
    const thrown = new Error('[drm-fp]NO_SKD_URI: FairPlay init data carried no skd:// URI');
    const detail = { code: 6016, message: 'Shaka Error 6016', data: [thrown] };
    assert.equal(fairPlayStageFromErrorDetail(detail), 'FP_NO_SKD_URI');
  });

  it('recovers any tagged stage from data[0]', () => {
    for (const stage of ['NO_SKD_URI', 'NO_CERTIFICATE', 'NO_SKD_CONTENT_ID']) {
      const thrown = new Error(`[drm-fp]${stage}: detail that must never be emitted`);
      const detail = { code: 6016, message: 'Shaka Error 6016', data: [thrown] };
      assert.equal(fairPlayStageFromErrorDetail(detail), `FP_${stage}`, `must recover FP_${stage}`);
    }
  });

  it('still prefers a stage that IS on the message', () => {
    const detail = {
      message: '[drm-fp]NO_CERTIFICATE: none was fetched',
      data: [new Error('[drm-fp]NO_SKD_URI: other')],
    };
    assert.equal(fairPlayStageFromErrorDetail(detail), 'FP_NO_CERTIFICATE');
  });

  it('REGRESSION: message alone yields nothing, which is why the trace was useless', () => {
    assert.equal(fairPlayStageFromMessage('Shaka Error 6016'), null);
    assert.equal(fairPlayStageFromErrorDetail({ message: 'Shaka Error 6016' }), null);
  });

  it('never leaks the wrapped message text', () => {
    const thrown = new Error('[drm-fp]NO_SKD_URI: see https://video.gumlet.io/private/path');
    const stage = fairPlayStageFromErrorDetail({
      code: 6016,
      message: 'Shaka Error 6016',
      data: [thrown],
    });
    assert.ok(stage);
    assert.doesNotMatch(stage, /https?:|gumlet|private/);
  });

  it('is defensive about malformed details', () => {
    assert.equal(fairPlayStageFromErrorDetail(null), null);
    assert.equal(fairPlayStageFromErrorDetail(undefined), null);
    assert.equal(fairPlayStageFromErrorDetail({}), null);
    assert.equal(fairPlayStageFromErrorDetail({ data: 'nope' }), null);
    assert.equal(fairPlayStageFromErrorDetail({ data: [null, 42, {}] }), null);
    assert.equal(fairPlayStageFromErrorDetail({ data: [{ message: 'unrelated' }] }), null);
  });
});

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