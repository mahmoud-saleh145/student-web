import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NATIVE_HLS_STAGE,
  needsNativeFairPlayHls,
  streamingConfigForNativeHls,
} from './fairplay-native-hls.ts';

/**
 * The MEDIA_3 regression, as a behavioural contract.
 *
 * Shaka Player does not support FairPlay through MSE - only through native
 * `src=` playback (shaka-project/shaka-player#2096, Shaka maintainer). Our
 * component used to call `player.attach()` unconditionally, which is precisely
 * the MSE attachment that disables the only supported FairPlay path.
 *
 * The failure it produced was a DECODE error, not a licence error: the licence
 * exchange completed and the cbcs samples still failed, surfacing as
 * `MediaError.code === 3`. These tests pin the routing rule so it cannot silently
 * regress, and pin that the rule is narrow enough not to disturb Widevine.
 */

describe('needsNativeFairPlayHls', () => {
  it('routes a FairPlay ticket to Safari native HLS', () => {
    assert.equal(needsNativeFairPlayHls({ scheme: 'fairplay' }), true);
  });

  it('leaves Widevine on the MSE path Shaka supports', () => {
    // Chrome, Edge and Android must keep the existing behaviour untouched.
    assert.equal(needsNativeFairPlayHls({ scheme: 'widevine' }), false);
  });

  it('is inert for a non-DRM ticket', () => {
    assert.equal(needsNativeFairPlayHls({ scheme: 'none' }), false);
  });

  it('is inert for a missing ticket rather than throwing', () => {
    assert.equal(needsNativeFairPlayHls(null), false);
    assert.equal(needsNativeFairPlayHls(undefined), false);
  });

  it('keys only on the scheme the backend controls', () => {
    // `fairplay` is emitted server-side only from the Gumlet branch when the
    // ticket asked for `ios`, so it cannot be reached by the legacy AES-128
    // path. Anything else must not be swept into the native branch.
    const legacyLooking = { scheme: 'none' as const };
    assert.equal(needsNativeFairPlayHls(legacyLooking), false);
  });
});

describe('streamingConfigForNativeHls', () => {
  it('asks Shaka to prefer native HLS', () => {
    const cfg = streamingConfigForNativeHls();
    assert.equal(cfg.streaming.preferNativeHls, true);
  });

  it('returns a fresh object each call so callers cannot mutate shared state', () => {
    const a = streamingConfigForNativeHls();
    const b = streamingConfigForNativeHls();
    assert.notEqual(a, b);
    assert.notEqual(a.streaming, b.streaming);
  });
});

describe('stage code', () => {
  it('is a fixed token that cannot carry a URL or payload', () => {
    // It is rendered on screen and reported to the backend, so it must stay a
    // constant.
    assert.equal(NATIVE_HLS_STAGE, 'FP_NATIVE_HLS');
    assert.doesNotMatch(NATIVE_HLS_STAGE, /https?:|token|=/);
  });
});
