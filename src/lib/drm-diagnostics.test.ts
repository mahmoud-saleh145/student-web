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
      nativeErrorDomainCode('The operation couldn’t be completed. (CoreMediaErrorDomain error -12927.)'),
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
