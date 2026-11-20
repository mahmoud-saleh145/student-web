import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NO_APP_LINK, parseAppLinkConfig, safeAppOpenUrl, safeStoreUrl, storeUrlFor } from './app-link.ts';

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
  it('defaults to no link at all', () => {
    assert.deepEqual(parseAppLinkConfig({}), NO_APP_LINK);
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
