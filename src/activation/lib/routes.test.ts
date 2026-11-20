import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activationRoutes, isActivationPath, isActivationPublicPage, safeActivationNext } from './routes.ts';

describe('isActivationPath', () => {
  it('covers the portal and only the portal', () => {
    for (const p of ['/activate', '/activate/', '/activate/login', '/activate/courses/abc', '/activate/library/x']) {
      assert.equal(isActivationPath(p), true, p);
    }
    for (const p of ['/', '/home', '/courses/abc', '/activated', '/activate-now', '/api/activate/proxy/x', '/library']) {
      assert.equal(isActivationPath(p), false, p);
    }
  });
});

describe('isActivationPublicPage', () => {
  it('opens only the portal sign-in without a session', () => {
    assert.equal(isActivationPublicPage('/activate/login'), true);
    assert.equal(isActivationPublicPage('/activate/login/'), true);
    for (const p of ['/activate', '/activate/courses', '/activate/wallet', '/login']) {
      assert.equal(isActivationPublicPage(p), false, p);
    }
  });
});

describe('safeActivationNext', () => {
  it('keeps a portal page, query included', () => {
    assert.equal(safeActivationNext('/activate/courses/abc'), '/activate/courses/abc');
    assert.equal(safeActivationNext('/activate/courses?q=math'), '/activate/courses?q=math');
  });

  it('never returns a learning-website page, an API route or another origin', () => {
    for (const p of [
      '/home',
      '/lessons/abc',
      '/player/abc',
      '/library/reader/abc',
      '/api/activate/proxy/courses',
      '/activate/login',
      '/activate/../lessons/abc',
      '//evil.test/activate',
      '/\\evil.test',
      'https://evil.test/activate',
      '',
      null,
      undefined,
    ]) {
      assert.equal(safeActivationNext(p), null, String(p));
    }
  });
});

describe('activationRoutes', () => {
  it('stays inside /activate', () => {
    const all = [
      activationRoutes.home,
      activationRoutes.login,
      activationRoutes.courses,
      activationRoutes.course('c 1/..'),
      activationRoutes.library,
      activationRoutes.material('m1'),
      activationRoutes.wallet,
      activationRoutes.myActivations,
      activationRoutes.account,
      activationRoutes.success,
    ];
    for (const route of all) assert.equal(isActivationPath(route), true, route);
    assert.equal(activationRoutes.course('c 1/..'), '/activate/courses/c%201%2F..');
  });
});
