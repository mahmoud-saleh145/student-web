import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { courseAccessFlags, joinLabel, joinSheetActions } from './course-access.ts';

const course = (state: 'NOT_ENROLLED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED' | 'REVOKED' | 'PENDING_APPROVAL', methods: ('FREE' | 'CODE' | 'ADMIN_APPROVAL' | 'PAYMENT')[] = ['CODE'], status: 'PUBLISHED' | 'ARCHIVED' | 'HIDDEN' = 'PUBLISHED') => ({
  status,
  access: { state, availableMethods: methods },
});

describe('courseAccessFlags', () => {
  it('lets a student join only an unjoined, published course the server offers a way into', () => {
    assert.equal(courseAccessFlags(course('NOT_ENROLLED')).canJoin, true);
    assert.equal(courseAccessFlags(course('NOT_ENROLLED', [])).canJoin, false);
    assert.equal(courseAccessFlags(course('NOT_ENROLLED', ['CODE'], 'HIDDEN')).canJoin, false);
    assert.equal(courseAccessFlags(course('ACTIVE')).canJoin, false);
  });

  it('reports archived from either the enrolment or the course', () => {
    assert.equal(courseAccessFlags(course('ARCHIVED')).isArchived, true);
    assert.equal(courseAccessFlags(course('ACTIVE', [], 'ARCHIVED')).isArchived, true);
  });

  it('separates expired, revoked and pending from active', () => {
    assert.equal(courseAccessFlags(course('EXPIRED')).isExpired, true);
    assert.equal(courseAccessFlags(course('REVOKED')).isRevoked, true);
    assert.equal(courseAccessFlags(course('PENDING_APPROVAL')).isPending, true);
    assert.equal(courseAccessFlags(course('PENDING_APPROVAL')).hasAccess, false);
  });
});

describe('joinLabel', () => {
  it('says free only for a free course', () => {
    assert.deepEqual(joinLabel({ isFree: true, price: null }), { kind: 'free' });
  });

  it('never calls a paid course with no price row free', () => {
    // The old web card showed "Free" for `!course.price`.
    assert.deepEqual(joinLabel({ isFree: false, price: null }), { kind: 'join' });
  });

  it('shows the price for a priced course', () => {
    const price = { amount: 250, currency: 'EGP' };
    assert.deepEqual(joinLabel({ isFree: false, price }), { kind: 'buy', price });
  });
});

describe('joinSheetActions', () => {
  const base = { methods: { accessCode: true }, fullCourse: { owned: false } };

  it('never offers online payment, even when the server lists it', () => {
    const a = joinSheetActions({ ...base, enrollmentMethods: ['PAYMENT', 'CODE'] });
    assert.deepEqual(a, { free: false, approval: false, code: true, none: false });
  });

  it('shows the code box only when the server accepts codes', () => {
    assert.equal(joinSheetActions({ ...base, enrollmentMethods: ['FREE'] }).code, false);
    assert.equal(joinSheetActions({ methods: { accessCode: false }, fullCourse: { owned: false }, enrollmentMethods: ['CODE'] }).code, false);
  });

  it('hides free and approval for a course already owned', () => {
    const a = joinSheetActions({ ...base, fullCourse: { owned: true }, enrollmentMethods: ['FREE', 'ADMIN_APPROVAL'] });
    assert.equal(a.free, false);
    assert.equal(a.approval, false);
  });
});
