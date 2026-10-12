import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_FAIRPLAY_DIAG_FLAGS,
  FAIRPLAY_LEGACY,
  FAIRPLAY_MODERN,
  appendTraceEvent,
  fairPlayConfigTokens,
  fairPlayKeySystems,
  formatTrace,
  keySystemToken,
  licenceHttpStatusFromError,
  nativeErrorClass,
  nativeErrorDomainCode,
  parseFairPlayDiagFlags,
  type TraceEntry,
} from './drm-diagnostics.ts';

describe('FairPlay diagnostic flags are off unless explicitly enabled', () => {
  it('defaults to production behaviour with no query string', () => {
    for (const search of ['', null, undefined, '?', '?foo=bar', '?lesson=1&t=2']) {
      assert.deepEqual(parseFairPlayDiagFlags(search), DEFAULT_FAIRPLAY_DIAG_FLAGS);
    }
    assert.deepEqual(DEFAULT_FAIRPLAY_DIAG_FLAGS, { legacyKeySystemOnly: false, omitCrossOrigin: false });
  });

  it('enables each experiment only for its exact value', () => {
    assert.deepEqual(parseFairPlayDiagFlags('?fpks=1_0'), { legacyKeySystemOnly: true, omitCrossOrigin: false });
    assert.deepEqual(parseFairPlayDiagFlags('?fpcors=0'), { legacyKeySystemOnly: false, omitCrossOrigin: true });
    for (const search of ['?fpks=1', '?fpks=1_00', '?fpks=', '?fpks=true', '?FPKS=1_0', '?fpcors=1', '?fpcors=false', '?fpcors=']) {
      assert.deepEqual(parseFairPlayDiagFlags(search), DEFAULT_FAIRPLAY_DIAG_FLAGS, search);
    }
  });

  it('keeps the production FairPlay key systems by default, modern first', () => {
    assert.deepEqual(fairPlayKeySystems(DEFAULT_FAIRPLAY_DIAG_FLAGS), [FAIRPLAY_MODERN, FAIRPLAY_LEGACY]);
    assert.equal(FAIRPLAY_MODERN, 'com.apple.fps');
    assert.equal(FAIRPLAY_LEGACY, 'com.apple.fps.1_0');
  });

  it('fpks=1_0 configures only the legacy-named key system', () => {
    assert.deepEqual(fairPlayKeySystems(parseFairPlayDiagFlags('?fpks=1_0')), [FAIRPLAY_LEGACY]);
  });

  it('labels every trace with the configuration that produced it', () => {
    assert.deepEqual(fairPlayConfigTokens(DEFAULT_FAIRPLAY_DIAG_FLAGS), ['CFG_KS_DEFAULT', 'CFG_CORS_ON']);
    assert.deepEqual(fairPlayConfigTokens(parseFairPlayDiagFlags('?fpks=1_0')), ['CFG_KS_1_0', 'CFG_CORS_ON']);
    assert.deepEqual(fairPlayConfigTokens(parseFairPlayDiagFlags('?fpcors=0')), ['CFG_KS_DEFAULT', 'CFG_CORS_OFF']);
  });
});

describe('native media error is reduced to domain and code', () => {
  it('extracts an Apple error domain and integer code', () => {
    assert.equal(
      nativeErrorDomainCode('The operation couldnâ€™t be completed. (CoreMediaErrorDomain error -12927.)'),
      'CoreMediaErrorDomain_-12927',
    );
    assert.equal(nativeErrorDomainCode('AVFoundationErrorDomain -11800'), 'AVFoundationErrorDomain_-11800');
    assert.equal(nativeErrorDomainCode('NSOSStatusErrorDomain: 42'), 'NSOSStatusErrorDomain_42');
  });

  it('returns nothing else from the message, even next to a URL', () => {
    const out = nativeErrorDomainCode(
      'Failed https://video.gumlet.io/ws/asset/main.m3u8?token=abc skd://SECRET (CoreMediaErrorDomain error -12889)',
    );
    assert.equal(out, 'CoreMediaErrorDomain_-12889');
    assert.doesNotMatch(out ?? '', /https?:|gumlet|token|skd|SECRET/);
  });

  it('returns null when there is no domain/code pair', () => {
    for (const m of [undefined, null, '', 42, 'Media failed to decode', 'error -12927', 'https://x/-12927']) {
      assert.equal(nativeErrorDomainCode(m), null, String(m));
    }
  });
});

describe('licence HTTP status is read as a number only', () => {
  it('reads the status of a LICENSE_REQUEST_FAILED wrapping BAD_HTTP_STATUS', () => {
    const detail = {
      code: 6007,
      data: [{ code: 1001, data: ['https://fairplay.example/licence/org/asset?token=SECRET', 403, 'body', {}, 2] }],
    };
    assert.equal(licenceHttpStatusFromError(detail), 403);
  });

  it('ignores every other shape', () => {
    assert.equal(licenceHttpStatusFromError(null), null);
    assert.equal(licenceHttpStatusFromError({ code: 3016, data: [3] }), null);
    assert.equal(licenceHttpStatusFromError({ code: 6007, data: [] }), null);
    assert.equal(licenceHttpStatusFromError({ code: 6007, data: [{ code: 1002, data: ['u', 500] }] }), null);
    assert.equal(licenceHttpStatusFromError({ code: 6007, data: [{ code: 1001, data: ['u', 'nope'] }] }), null);
    assert.equal(licenceHttpStatusFromError({ code: 6007, data: [{ code: 1001, data: ['u', 99999] }] }), null);
  });
});

describe('key system token', () => {
  it('passes through real key-system names and nothing else', () => {
    assert.equal(keySystemToken('com.apple.fps'), 'com.apple.fps');
    assert.equal(keySystemToken('com.apple.fps.1_0'), 'com.apple.fps.1_0');
    assert.equal(keySystemToken(''), 'NONE');
    assert.equal(keySystemToken(undefined), 'NONE');
    assert.equal(keySystemToken('https://evil/x'), 'OTHER');
  });
});

describe('timestamped, counted trace', () => {
  it('records the first time and counts repeats instead of dropping them', () => {
    let t: TraceEntry[] = [];
    t = appendTraceEvent(t, 'ENC_skd', 812.4);
    t = appendTraceEvent(t, 'IDT_skd', 813);
    t = appendTraceEvent(t, 'ENC_skd', 900);
    assert.deepEqual(t, [
      { token: 'ENC_skd', firstMs: 812, count: 2 },
      { token: 'IDT_skd', firstMs: 813, count: 1 },
    ]);
    assert.equal(formatTrace(t, ' > '), 'ENC_skd@812x2 > IDT_skd@813');
  });

  it('does not mutate the previous trace', () => {
    const prev: TraceEntry[] = [{ token: 'A', firstMs: 1, count: 1 }];
    appendTraceEvent(prev, 'A', 5);
    assert.deepEqual(prev, [{ token: 'A', firstMs: 1, count: 1 }]);
  });

  it('never records a negative time', () => {
    assert.equal(appendTraceEvent([], 'X', -3)[0]!.firstMs, 0);
  });
});

describe('nativeErrorClass - fixed tokens only, never the message', () => {
  it('reports DOMAIN when Safari gives an Apple error domain and code', () => {
    assert.equal(nativeErrorClass('CMSampleBufferErrorDomain -12939.'), 'DOMAIN');
    // DOMAIN outranks keywords: it is the more specific fact.
    assert.equal(
      nativeErrorClass('CMSampleBufferErrorDomain -12978. Decryption failed'),
      'DOMAIN',
    );
  });

  it('reports KEY for key/encryption/licence wording', () => {
    assert.equal(nativeErrorClass('Key request is not supported'), 'KEY');
    assert.equal(nativeErrorClass('Decryption failed'), 'KEY');
    assert.equal(nativeErrorClass('FairPlay licence error'), 'KEY');
    assert.equal(nativeErrorClass('content key unavailable'), 'KEY');
  });

  it('reports DECODE for plain decode wording', () => {
    assert.equal(nativeErrorClass('Decode error'), 'DECODE');
    assert.equal(
      nativeErrorClass('The media resource indicated by the src attribute could not be decoded.'),
      'DECODE',
    );
  });

  it('reports NETWORK for transport wording', () => {
    assert.equal(nativeErrorClass('A network error caused the media download to fail'), 'NETWORK');
  });

  it('reports UNSUPPORTED only for explicit refusal wording', () => {
    assert.equal(nativeErrorClass('Media type not supported'), 'UNSUPPORTED');
    assert.equal(nativeErrorClass('no supported source'), 'UNSUPPORTED');
  });

  it('reports UNMAPPED rather than guessing, for a message we cannot classify', () => {
    // The honest default. Safari's prose varies by build and this must not
    // silently become a conclusion.
    assert.equal(nativeErrorClass('something unexpected happened'), 'UNMAPPED');
    assert.equal(nativeErrorClass('¯\\_(?)_/¯'), 'UNMAPPED');
  });

  it('reports NONE when there is no usable message', () => {
    for (const bad of [null, undefined, '', 0, 42, true, {}, [], () => {}]) {
      assert.equal(nativeErrorClass(bad), 'NONE', `for ${String(bad)}`);
    }
  });

  it('CANNOT emit a codec or format verdict', () => {
    // Deliberate limitation. Nothing in MediaError distinguishes "unsupported
    // codec" from "key not ready yet", so there is no such token. If a future
    // change adds one, this test fails and forces the author to justify it.
    const verdicts = new Set([
      nativeErrorClass('unsupported codec'),
      nativeErrorClass('bad container format'),
      nativeErrorClass('codec not available'),
      nativeErrorClass('format error'),
    ]);
    for (const v of verdicts) {
      assert.ok(
        ['UNSUPPORTED', 'UNMAPPED'].includes(v),
        `must not claim a codec/format cause, got ${v}`,
      );
    }
  });

  it('NEVER leaks the message, a URL, a token or an skd value', () => {
    const hostile = [
      'Decode error https://video.gumlet.io/abc/main.m3u8?exp=1&sig=SECRETSIG',
      'key skd://zWJlFKVhU9iD73PB9XEQ== rejected for asset token=eyJhbGciOi',
      'https://user:pw@example.com/licence?token=abc decode',
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SIGNATURE network error',
      '-----BEGIN CERTIFICATE-----MIIB decode',
    ];
    for (const m of hostile) {
      const out = nativeErrorClass(m);
      assert.ok(ALLOWED.has(out), `unexpected token ${out} for ${m}`);
      const serialised = JSON.stringify(out);
      assert.doesNotMatch(serialised, /https?:|gumlet|skd:|token|sig|Bearer|BEGIN|eyJ|[A-Za-z0-9+/]{16,}/);
    }
  });

  it('always returns one of the declared tokens', () => {
    const inputs = [
      'Decode error',
      'key error',
      'network',
      'unsupported',
      'CMSampleBufferErrorDomain -12939',
      'gibberish',
      '',
      null,
    ];
    for (const i of inputs) assert.ok(ALLOWED.has(nativeErrorClass(i)));
  });
});
const ALLOWED = new Set([
  'NONE',
  'DOMAIN',
  'KEY',
  'UNSUPPORTED',
  'DECODE',
  'NETWORK',
  'UNMAPPED',
]);