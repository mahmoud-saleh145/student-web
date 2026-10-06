import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPublicPage, safeNextPath } from './route-guard.ts';

describe('isPublicPage', () => {
  it('lets the sign-in pages through', () => {
    for (const p of ['/', '/login', '/register', '/password-help', '/login/']) assert.equal(isPublicPage(p), true, p);
  });

  it('guards every signed-in page', () => {
    for (const p of ['/home', '/courses/abc', '/wallet', '/settings/devices', '/loginx']) assert.equal(isPublicPage(p), false, p);
  });
});

describe('safeNextPath', () => {
  it('accepts an internal page', () => {
    assert.equal(safeNextPath('/courses/abc?tab=content'), '/courses/abc?tab=content');
  });

  it('rejects external, protocol-relative and API destinations', () => {
    for (const p of ['https://evil.test', '//evil.test', '/\\evil.test', '/api/proxy/x', '/login', null, '']) {
      assert.equal(safeNextPath(p), null, String(p));
    }
  });
});
