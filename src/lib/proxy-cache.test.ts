import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PROXY_NO_STORE, applyProxyCachePolicy, isNoStoreProxyPath } from './proxy-cache.ts';

describe('proxy cache policy', () => {
  it('marks every Library path no-store', () => {
    for (const path of [
      'library',
      'library/materials',
      'library/materials/m1',
      'library/me',
      'library/quote',
      'library/purchase',
      'library/parts/p1/open',
      '/library/materials/m1',
      'library/materials?academicYearId=y1',
      'Library/Materials',
    ]) {
      assert.equal(isNoStoreProxyPath(path), true, path);
    }
  });

  it('leaves everything else, courses included, exactly as it was', () => {
    for (const path of ['courses', 'courses/c1', 'wallet', 'auth/me', 'libraryx', 'catalog/library', 'lessons/l1']) {
      assert.equal(isNoStoreProxyPath(path), false, path);
    }
  });

  it('sets the header on a Library response and leaves other responses untouched', () => {
    const library = new Headers({ 'content-type': 'application/json' });
    applyProxyCachePolicy(library, 'library/materials/m1');
    assert.equal(library.get('cache-control'), PROXY_NO_STORE);

    const course = new Headers({ 'content-type': 'application/json' });
    applyProxyCachePolicy(course, 'courses/c1');
    assert.equal(course.get('cache-control'), null);
  });

  it('replaces any weaker policy already on a Library response', () => {
    const headers = new Headers({ 'cache-control': 'public, max-age=60' });
    applyProxyCachePolicy(headers, 'library/me');
    assert.equal(headers.get('cache-control'), PROXY_NO_STORE);
  });
});
