import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectPlaybackPlatform, type NavigatorLike } from './playback-platform.ts';

const nav = (userAgent: string, platform = '', maxTouchPoints = 0): NavigatorLike => ({
  userAgent,
  platform,
  maxTouchPoints,
});

/**
 * The player used to hardcode `platform: 'web'`, so Safari was handed a
 * Widevine licence URL it can never use. iOS implements FairPlay only.
 */
describe('detectPlaybackPlatform', () => {
  it('reports iOS for iPhone Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    assert.equal(detectPlaybackPlatform(nav(ua, 'iPhone')), 'ios');
  });

  it('reports iOS for iPad Safari', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    assert.equal(detectPlaybackPlatform(nav(ua, 'iPad')), 'ios');
  });

  it('reports iOS for iPod', () => {
    assert.equal(detectPlaybackPlatform(nav('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)')) , 'ios');
  });

  it('detects iPadOS, which masquerades as desktop Safari', () => {
    // iPadOS 13+ sends a Mac user agent and reports platform "MacIntel".
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    assert.equal(detectPlaybackPlatform(nav(ua, 'MacIntel', 5)), 'ios');
  });

  it('does not mistake a real Mac for an iPad', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    assert.equal(detectPlaybackPlatform(nav(ua, 'MacIntel', 0)), 'web');
  });

  it('reports android for Android Chrome', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
    assert.equal(detectPlaybackPlatform(nav(ua, 'Linux armv8l')), 'android');
  });

  it('reports web for Windows Chrome and Linux Firefox', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
    assert.equal(detectPlaybackPlatform(nav(chrome, 'Win32')), 'web');
    assert.equal(detectPlaybackPlatform(nav(firefox, 'Linux x86_64')), 'web');
  });

  it('never claims FairPlay without a navigator (server render)', () => {
    assert.equal(detectPlaybackPlatform(null), 'web');
  });
});