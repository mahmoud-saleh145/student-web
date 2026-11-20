import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAllowedActivationBody, isAllowedActivationRequest } from './proxy-allowlist.ts';

describe('activation proxy allow-list', () => {
  it('forwards the catalogue, activation, library and wallet routes the portal uses', () => {
    const allowed: [string, string][] = [
      ['GET', 'auth/me'],
      ['GET', 'profile'],
      ['GET', 'catalog/academic-years'],
      ['GET', 'catalog/faculties/fac_1/departments'],
      ['GET', 'courses'],
      ['GET', 'courses/mine'],
      ['GET', 'courses/clx123abc'],
      ['GET', 'courses/clx123abc/join-options'],
      ['GET', 'courses/clx123abc/parts'],
      ['POST', 'courses/clx123abc/redeem'],
      ['POST', 'courses/clx123abc/enroll'],
      ['POST', 'codes/validate'],
      ['GET', 'library/materials'],
      ['GET', 'library/materials/mat-1'],
      ['GET', 'library/me'],
      ['POST', 'library/quote'],
      ['POST', 'library/purchase'],
      ['GET', 'wallet'],
      ['GET', 'wallet/transactions'],
      ['POST', 'wallet/redeem'],
      ['GET', '/courses/clx123abc/'],
    ];
    for (const [method, path] of allowed) assert.equal(isAllowedActivationRequest(method, path), true, `${method} ${path}`);
  });

  it('never forwards a protected-content route', () => {
    const protectedContent: [string, string][] = [
      // Video: lesson detail, playback tickets, licences, progress.
      ['GET', 'lessons/les1'],
      ['GET', 'lessons/by-video/vid1'],
      ['POST', 'lessons/les1/complete'],
      ['POST', 'playback/tickets'],
      ['POST', 'playback/videos/vid1/ticket'],
      ['GET', 'playback/videos/vid1/ticket'],
      ['POST', 'playback/heartbeat'],
      ['GET', 'videos/vid1'],
      ['POST', 'progress/lessons/les1'],
      // Course attachments (PDFs) and the Library reader.
      ['GET', 'attachments/att1/ticket'],
      ['POST', 'attachments/att1/ticket'],
      ['POST', 'library/parts/part1/open'],
      ['GET', 'library/parts/part1/open'],
      ['GET', 'library/parts/part1'],
      ['GET', 'storage/files/abc'],
      // Anything under an allowed prefix that was not written down.
      ['GET', 'courses/clx123abc/sections'],
      ['GET', 'courses/clx123abc/lessons'],
      ['GET', 'library/materials/mat-1/download'],
      ['GET', 'library/purchases'],
    ];
    for (const [method, path] of protectedContent) {
      assert.equal(isAllowedActivationRequest(method, path), false, `${method} ${path}`);
    }
  });

  it('never forwards device, session, auth or staff routes', () => {
    const refused: [string, string][] = [
      ['GET', 'devices'],
      ['POST', 'devices/change-request'],
      ['POST', 'auth/login'],
      ['POST', 'auth/refresh'],
      ['POST', 'auth/logout'],
      ['POST', 'auth/register'],
      ['POST', 'auth/change-password'],
      ['GET', 'sessions'],
      ['GET', 'admin/users'],
      ['GET', 'courses/admin'],
      ['GET', 'courses/admin/parts'],
      ['GET', 'library/materials/admin'],
      ['GET', 'enrollments/admin'],
      ['POST', 'payments/webhooks'],
      ['POST', 'wallet/admin/credit'],
      ['POST', 'wallet'],
      ['PATCH', 'profile'],
      ['DELETE', 'courses/clx123abc'],
      ['PUT', 'courses/clx123abc'],
    ];
    for (const [method, path] of refused) assert.equal(isAllowedActivationRequest(method, path), false, `${method} ${path}`);
  });

  it('is exact about method: a read route is not a write route', () => {
    assert.equal(isAllowedActivationRequest('POST', 'courses'), false);
    assert.equal(isAllowedActivationRequest('GET', 'courses/clx123abc/redeem'), false);
    assert.equal(isAllowedActivationRequest('GET', 'wallet/redeem'), false);
    assert.equal(isAllowedActivationRequest('POST', 'library/materials'), false);
  });

  it('refuses traversal and encoded paths', () => {
    for (const path of ['courses/../lessons/les1', 'courses/%2e%2e/lessons', 'courses//x', 'courses/a/../../playback/tickets']) {
      assert.equal(isAllowedActivationRequest('GET', path), false, path);
    }
  });
});

describe('enrol body rule', () => {
  it('lets free and approval enrolment through, and never online payment', () => {
    assert.equal(isAllowedActivationBody('courses/c1/enroll', { method: 'FREE' }), true);
    assert.equal(isAllowedActivationBody('courses/c1/enroll', { method: 'ADMIN_APPROVAL' }), true);
    assert.equal(isAllowedActivationBody('courses/c1/enroll', { method: 'PAYMENT' }), false);
    assert.equal(isAllowedActivationBody('courses/c1/enroll', { method: 'CODE' }), false);
    assert.equal(isAllowedActivationBody('courses/c1/enroll', {}), false);
    assert.equal(isAllowedActivationBody('courses/c1/enroll', null), false);
  });

  it('does not constrain other routes', () => {
    assert.equal(isAllowedActivationBody('courses/c1/redeem', { code: 'ABCD-1234' }), true);
    assert.equal(isAllowedActivationBody('wallet/redeem', { code: 'ABCD-1234' }), true);
  });
});
