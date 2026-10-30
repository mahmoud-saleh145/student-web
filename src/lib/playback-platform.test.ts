import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { playbackTicketRequestBody } from './gumlet-embed.ts';
import {
  detectPlaybackPlatform,
  isMacOs,
  isMacSafari,
  needsSafariOnMac,
  type NavigatorLike,
} from './playback-platform.ts';

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

/**
 * Every browser on iOS is WebKit, so Chrome/Edge/Firefox on iPhone are the SAME
 * media stack as Safari and must be classified identically. Getting this wrong
 * hands a Widevine licence URL to a device that only implements FairPlay, which
 * fails at key-system negotiation with REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
 * - the failure this module exists to prevent.
 */
describe('detectPlaybackPlatform on iOS browsers', () => {
  const iphone = (token: string) =>
    `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${token} Mobile/15E148 Safari/604.1`;

  it('classifies iPhone Safari as ios', () => {
    assert.equal(detectPlaybackPlatform(nav(iphone('Version/17.5'), 'iPhone')), 'ios');
  });

  it('classifies Chrome on iPhone as ios, not web', () => {
    // CriOS is WebKit on iOS. Treating it as 'web' is what hands a Widevine
    // licence URL to a FairPlay-only device.
    assert.equal(detectPlaybackPlatform(nav(iphone('CriOS/126.0.6478.54'), 'iPhone')), 'ios');
  });

  it('classifies Edge on iPhone as ios, not web', () => {
    assert.equal(
      detectPlaybackPlatform(nav(iphone('EdgiOS/126.0.2592.87 Version/17.0'), 'iPhone')),
      'ios',
    );
  });

  it('classifies Firefox on iPhone as ios', () => {
    assert.equal(detectPlaybackPlatform(nav(iphone('FxiOS/126.0'), 'iPhone')), 'ios');
  });

  it('classifies Chrome on iPadOS as ios despite a desktop Safari UA', () => {
    // iPadOS 13+ sends a Mac UA; only touch points give it away.
    const ipadChrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Safari/605.1.15';
    assert.equal(detectPlaybackPlatform(nav(ipadChrome, 'MacIntel', 5)), 'ios');
  });
});

// Real user agents, as macOS browsers send them. Apple silicon Macs still
// report "Intel Mac OS X" and platform "MacIntel"; Safari 17+ froze the OS
// version at 10_15_7.
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC_SAFARI_18 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAC_EDGE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56';
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
const MAC_OPERA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0';
const MAC_BRAVE_LIKE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const WIN_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * THE MACBOOK FAILURE.
 *
 * Safari on macOS implements FairPlay and no Widevine (Gumlet's compatibility
 * table: Safari 10+ on macOS - DASH Widevine unsupported, HLS FairPlay
 * supported). A MacBook has no touch points and no iPhone/iPad token, so it
 * was classified `'web'`, received the Widevine DASH ticket, and Shaka failed
 * at `requestMediaKeySystemAccess` before any licence request:
 * `KS_NONE` + REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE - the exact signature
 * previously seen on iPhone before iOS was routed to FairPlay.
 */
describe('detectPlaybackPlatform on macOS', () => {
  it('routes Safari on a Mac to the FairPlay ticket, like iOS', () => {
    assert.equal(detectPlaybackPlatform(nav(MAC_SAFARI, 'MacIntel', 0)), 'ios');
    assert.equal(detectPlaybackPlatform(nav(MAC_SAFARI_18, 'MacIntel', 0)), 'ios');
  });

  it('still classifies Safari on a Mac as a Mac, not an iPad', () => {
    // The iPad masquerade needs touch points; a real Mac has none.
    assert.equal(isMacOs(nav(MAC_SAFARI, 'MacIntel', 0)), true);
    assert.equal(isMacOs(nav(MAC_SAFARI, 'MacIntel', 5)), false);
    assert.equal(isMacSafari(nav(MAC_SAFARI, 'MacIntel', 5)), false);
  });

  it('keeps Chrome, Edge, Firefox and Opera on a Mac on the Widevine ticket', () => {
    // These ship their own CDM (Widevine) and no FairPlay. A FairPlay ticket
    // would fail them exactly the way the Widevine ticket fails Safari.
    for (const ua of [MAC_CHROME, MAC_EDGE, MAC_FIREFOX, MAC_OPERA, MAC_BRAVE_LIKE]) {
      assert.equal(detectPlaybackPlatform(nav(ua, 'MacIntel', 0)), 'web', ua);
      assert.equal(isMacSafari(nav(ua, 'MacIntel', 0)), false, ua);
    }
  });

  it('does not treat the Safari/ token alone as Safari', () => {
    // Every Chromium browser carries "Safari/537.36". Only Safari emits
    // "Version/x" as well, and Chromium/Gecko names are excluded outright.
    assert.equal(isMacSafari(nav(MAC_CHROME, 'MacIntel', 0)), false);
    assert.equal(isMacSafari(nav(WIN_CHROME, 'Win32', 0)), false);
  });

  it('does not treat Safari on iOS as a Mac', () => {
    const iphoneSafari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    assert.equal(isMacOs(nav(iphoneSafari, 'iPhone', 5)), false);
    assert.equal(isMacSafari(nav(iphoneSafari, 'iPhone', 5)), false);
    // iOS keeps its own route regardless.
    assert.equal(detectPlaybackPlatform(nav(iphoneSafari, 'iPhone', 5)), 'ios');
  });

  it('leaves Windows and Linux exactly as before', () => {
    assert.equal(detectPlaybackPlatform(nav(WIN_CHROME, 'Win32', 0)), 'web');
    assert.equal(isMacOs(nav(WIN_CHROME, 'Win32', 0)), false);
    assert.equal(needsSafariOnMac(nav(WIN_CHROME, 'Win32', 0)), false);
  });

  it('is inert without a navigator', () => {
    assert.equal(isMacOs(null), false);
    assert.equal(isMacSafari(null), false);
    assert.equal(needsSafariOnMac(null), false);
    assert.equal(detectPlaybackPlatform(null), 'web');
  });
});

/**
 * The iPhone fix was Gumlet's own embed player, requested with
 * `delivery: 'embed'` for the FairPlay platform. Because macOS Safari now maps
 * to that platform, it gets the SAME ticket request as iPhone Safari - the
 * FairPlay HLS ticket plus the signed embed URL - with no new backend field.
 */
describe('macOS Safari ticket request', () => {
  it('asks for the FairPlay ticket with embed delivery, exactly like iPhone Safari', () => {
    const mac = playbackTicketRequestBody(detectPlaybackPlatform(nav(MAC_SAFARI, 'MacIntel', 0)));
    const iphone = playbackTicketRequestBody(
      detectPlaybackPlatform(
        nav(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          'iPhone',
          5,
        ),
      ),
    );
    assert.deepEqual(mac, { platform: 'ios', delivery: 'embed' });
    assert.deepEqual(mac, iphone);
  });

  it('leaves Chrome on a Mac on the plain Widevine request', () => {
    assert.deepEqual(
      playbackTicketRequestBody(detectPlaybackPlatform(nav(MAC_CHROME, 'MacIntel', 0))),
      { platform: 'web' },
    );
  });
});

/**
 * Chrome, Edge and Firefox on macOS implement Widevine in software only (L3);
 * macOS offers them no hardware-secure path. The player requests HW_SECURE_ALL
 * with no software fallback, so those browsers are refused at key-system
 * negotiation by design. The only thing the player can do for that viewer is
 * tell them which browser on their Mac does work.
 */
describe('needsSafariOnMac', () => {
  it('is true for non-Safari browsers on a Mac', () => {
    for (const ua of [MAC_CHROME, MAC_EDGE, MAC_FIREFOX, MAC_OPERA]) {
      assert.equal(needsSafariOnMac(nav(ua, 'MacIntel', 0)), true, ua);
    }
  });

  it('is false for Safari on a Mac, which plays through FairPlay', () => {
    assert.equal(needsSafariOnMac(nav(MAC_SAFARI, 'MacIntel', 0)), false);
  });

  it('is false everywhere that is not a Mac', () => {
    assert.equal(needsSafariOnMac(nav(WIN_CHROME, 'Win32', 0)), false);
    assert.equal(
      needsSafariOnMac(
        nav(
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
          'Linux armv8l',
          5,
        ),
      ),
      false,
    );
    // An iPad masquerading as a Mac in Chrome is iOS, where Chrome IS WebKit.
    assert.equal(
      needsSafariOnMac(
        nav(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Safari/605.1.15',
          'MacIntel',
          5,
        ),
      ),
      false,
    );
  });
});
