import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSameOriginRequest } from './same-origin.ts';

const h = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe('isSameOriginRequest', () => {
  it('trusts the browser when it says same-origin', () => {
    assert.equal(isSameOriginRequest(h({ 'sec-fetch-site': 'same-origin' })), true);
  });

  it('refuses a cross-site or same-site request, whatever Origin claims', () => {
    for (const site of ['cross-site', 'same-site', 'none']) {
      assert.equal(
        isSameOriginRequest(h({ 'sec-fetch-site': site, origin: 'https://portal.test', host: 'portal.test' })),
        false,
        site,
      );
    }
  });

  it('falls back to Origin against the request host', () => {
    assert.equal(isSameOriginRequest(h({ origin: 'https://portal.test', host: 'portal.test' })), true);
    assert.equal(isSameOriginRequest(h({ origin: 'https://evil.test', host: 'portal.test' })), false);
    assert.equal(isSameOriginRequest(h({ origin: 'null', host: 'portal.test' })), false);
  });

  it('honours the forwarded host and the configured origin', () => {
    assert.equal(
      isSameOriginRequest(h({ origin: 'https://portal.test', host: 'internal:3002', 'x-forwarded-host': 'portal.test' })),
      true,
    );
    assert.equal(isSameOriginRequest(h({ origin: 'https://portal.test', host: 'internal:3002' }), 'https://portal.test'), true);
    assert.equal(isSameOriginRequest(h({ origin: 'https://evil.test', host: 'internal:3002' }), 'https://portal.test'), false);
  });

  it('lets a non-browser client through to the marker-header check', () => {
    assert.equal(isSameOriginRequest(h({ host: 'portal.test' })), true);
  });
});
