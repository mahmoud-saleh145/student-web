import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_APP_OPEN_URL,
  NO_APP_LINK,
  isEmbeddedBrowser,
  isPhoneOrTablet,
  parseAppLinkConfig,
  resolveAppOpenUrl,
  safeAppOpenUrl,
  safeStoreUrl,
  storeUrlFor,
} from './app-link.ts';

describe('safeAppOpenUrl', () => {
  it('accepts a custom scheme and an https app link', () => {
    assert.equal(safeAppOpenUrl('eduplatform://'), 'eduplatform://');
    assert.equal(safeAppOpenUrl('eduplatform://wallet'), 'eduplatform://wallet');
    assert.equal(safeAppOpenUrl(' https://app.example.com/open '), 'https://app.example.com/open');
  });

  it('is off when nothing is configured', () => {
    for (const raw of [undefined, null, '', '   ']) assert.equal(safeAppOpenUrl(raw), null);
  });

  it('refuses a link that could carry a code, a token or credentials', () => {
    for (const raw of [
      'eduplatform://redeem?code=ABCD-1234',
      'eduplatform://open#token=abc',
      'https://user:pass@app.example.com/open',
      'https://app.example.com/open?next=/x',
    ]) {
      assert.equal(safeAppOpenUrl(raw), null, raw);
    }
  });

  it('refuses schemes that run or embed content, and plain http', () => {
    for (const raw of ['javascript://alert(1)', 'data://text/html,x', 'file:///etc/passwd', 'http://app.example.com', 'eduplatform:']) {
      assert.equal(safeAppOpenUrl(raw), null, raw);
    }
  });
});

describe('safeStoreUrl', () => {
  it('accepts only the store’s own https host', () => {
    assert.equal(
      safeStoreUrl('https://play.google.com/store/apps/details?id=com.studentcenter.app', 'android'),
      'https://play.google.com/store/apps/details?id=com.studentcenter.app',
    );
    assert.equal(safeStoreUrl('https://apps.apple.com/app/id123', 'ios'), 'https://apps.apple.com/app/id123');
  });

  it('refuses another host, the wrong store and http', () => {
    assert.equal(safeStoreUrl('https://evil.test/store', 'android'), null);
    assert.equal(safeStoreUrl('https://apps.apple.com/app/id123', 'android'), null);
    assert.equal(safeStoreUrl('http://play.google.com/store/apps/details?id=x', 'android'), null);
    assert.equal(safeStoreUrl('not a url', 'ios'), null);
  });
});

describe('parseAppLinkConfig / storeUrlFor', () => {
  it('opens the app\'s own scheme by default, and knows no store until one is configured', () => {
    assert.deepEqual(parseAppLinkConfig({}), { ...NO_APP_LINK, openUrl: 'eduplatform://' });
  });

  it('can be switched off, which leaves the manual steps', () => {
    assert.deepEqual(parseAppLinkConfig({ openUrl: 'off' }), NO_APP_LINK);
  });

  it('offers the store for the device in hand only', () => {
    const config = parseAppLinkConfig({
      openUrl: 'eduplatform://',
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.studentcenter.app',
      iosStoreUrl: 'https://apps.apple.com/app/id123',
    });
    assert.match(storeUrlFor(config, 'Mozilla/5.0 (Linux; Android 14)') ?? '', /play\.google\.com/);
    assert.match(storeUrlFor(config, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') ?? '', /apps\.apple\.com/);
    assert.equal(storeUrlFor(config, 'Mozilla/5.0 (Windows NT 10.0)'), null);
  });
});

describe('resolveAppOpenUrl — the link behind "Open Student Center"', () => {
  it('is the production app\'s scheme at its root, and nothing more', () => {
    assert.equal(DEFAULT_APP_OPEN_URL, 'eduplatform://');
    for (const unset of [undefined, null, '', '   ']) assert.equal(resolveAppOpenUrl(unset), 'eduplatform://');
    // No path, no query, no fragment: nothing can ride along to the app.
    const url = new URL(DEFAULT_APP_OPEN_URL);
    assert.equal(url.protocol, 'eduplatform:');
    assert.equal(url.host + url.pathname.replace(/^\/+$/, '') + url.search + url.hash, '');
  });

  it('can be replaced by another safe link', () => {
    assert.equal(resolveAppOpenUrl('https://app.example.com/open'), 'https://app.example.com/open');
    assert.equal(resolveAppOpenUrl('eduplatform-stg://'), 'eduplatform-stg://');
  });

  it('can be turned off', () => {
    for (const off of ['off', 'OFF', 'none', 'disabled', 'false', '0']) assert.equal(resolveAppOpenUrl(off), null, off);
  });

  it('never falls back to a link that carries data, and never guesses past a bad value', () => {
    for (const bad of [
      'eduplatform://?token=abc',
      'eduplatform://open?code=TEST-1234',
      'eduplatform://#student=1',
      'javascript://alert(1)',
      'http://example.com',
      'not a link',
    ]) {
      assert.equal(resolveAppOpenUrl(bad), null, bad);
    }
  });
});

describe('isPhoneOrTablet — where the scheme is attempted at all', () => {
  it('is true on Android and iOS devices', () => {
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
    ]) {
      assert.equal(isPhoneOrTablet(ua), true, ua);
    }
  });

  it('recognises an iPad that presents itself as a Mac by its touch points', () => {
    const ipadOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
    assert.equal(isPhoneOrTablet(ipadOs, 5), true);
    assert.equal(isPhoneOrTablet(ipadOs, 0), false);
  });

  it('is false on computers, where an unknown scheme can replace the page with an error', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    ]) {
      assert.equal(isPhoneOrTablet(ua, 0), false, ua);
    }
    // A touch-screen Windows laptop is still a computer.
    assert.equal(isPhoneOrTablet('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 10), false);
  });
});


describe('isEmbeddedBrowser — where an unknown scheme can replace the page', () => {
  it('recognises an Android WebView and the common in-app browsers', () => {
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/131.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0]',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 310.0',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 Telegram-Android/10.0',
    ]) {
      assert.equal(isEmbeddedBrowser(ua), true, ua);
    }
  });

  it('leaves real browsers alone', () => {
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
    ]) {
      assert.equal(isEmbeddedBrowser(ua), false, ua);
    }
  });
});
