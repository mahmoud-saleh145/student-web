import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canUnlockPart, courseAccessFlags, isPartUpgrade, isUnownedPart, joinLabel, joinSheetActions } from './course-access.ts';

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

describe('part upgrade (owns one part, unlocking another)', () => {
  const before = { owned: true };
  const after = { owned: false };
  const active = {
    methods: { accessCode: true },
    fullCourse: { owned: false },
    // The server always sends no methods for an ACTIVE student.
    enrollmentMethods: [] as ('FREE' | 'CODE' | 'ADMIN_APPROVAL' | 'PAYMENT')[],
    accessState: 'ACTIVE' as const,
    hasParts: true,
  };

  it('offers the code box to a student who owns Before Midterm only', () => {
    const a = joinSheetActions({ ...active, parts: [before, after] });
    assert.deepEqual(a, { free: false, approval: false, code: true, none: false });
    assert.equal(isPartUpgrade({ ...active, parts: [before, after] }), true);
  });

  it('offers nothing new once every part is owned', () => {
    assert.equal(isPartUpgrade({ ...active, parts: [before, { owned: true }] }), false);
    const a = joinSheetActions({ ...active, parts: [before, { owned: true }] });
    assert.equal(a.code, false);
    assert.equal(a.none, true);
  });

  it('offers nothing new to a whole-course owner', () => {
    assert.equal(joinSheetActions({ ...active, fullCourse: { owned: true }, parts: [after] }).code, false);
  });

  it('offers the code box for a part to a student who has not joined, even where the server lists no CODE', () => {
    const a = joinSheetActions({ ...active, accessState: 'NOT_ENROLLED', enrollmentMethods: ['ADMIN_APPROVAL'], parts: [after] });
    assert.equal(a.code, true);
    assert.equal(a.approval, true);
    assert.equal(isPartUpgrade({ ...active, accessState: 'NOT_ENROLLED', parts: [after] }), false);
  });

  it('never offers it to a revoked or archived student', () => {
    for (const accessState of ['REVOKED', 'ARCHIVED'] as const) {
      assert.equal(joinSheetActions({ ...active, accessState, parts: [after] }).code, false);
    }
  });

  it('does not treat a part with missing ownership as buyable', () => {
    assert.equal(joinSheetActions({ ...active, parts: [before, {}] }).code, false);
    assert.equal(joinSheetActions({ ...active, parts: [before, { owned: null }] }).code, false);
  });

  it('still respects a server that disables codes', () => {
    assert.equal(joinSheetActions({ ...active, methods: { accessCode: false }, parts: [before, after] }).code, false);
  });
});

describe('canUnlockPart — the button rule', () => {
  const unowned = { owned: false };
  const parts = { ownsAllParts: false };

  it('shows on an unowned part for every state a student can acquire from', () => {
    for (const state of ['NOT_ENROLLED', 'ACTIVE', 'EXPIRED', 'PENDING_APPROVAL'] as const) {
      assert.equal(canUnlockPart(course(state, []), unowned, parts), true, state);
    }
  });

  it('does not depend on what the part contains — an empty part is still unlockable', () => {
    // The rule takes no sections, lessons or lock flags at all; this pins that
    // a part object carrying none of them still qualifies.
    assert.equal(canUnlockPart(course('ACTIVE', []), { owned: false }, parts), true);
    assert.equal(canUnlockPart(course('ACTIVE', []), { owned: false, sections: [], sectionCount: 0 } as { owned: boolean }, parts), true);
  });

  it('works for any number of parts, by id, never by name', () => {
    const list = [{ id: 'a', owned: true }, { id: 'b', owned: false }, { id: 'c', owned: false }, { id: 'd', owned: true }];
    const shown = list.filter((p) => canUnlockPart(course('ACTIVE', []), p, parts)).map((p) => p.id);
    assert.deepEqual(shown, ['b', 'c']);
  });

  it('never shows on an owned part, a whole-course owner, or a group that is not a part', () => {
    assert.equal(canUnlockPart(course('ACTIVE', []), { owned: true }, parts), false);
    assert.equal(canUnlockPart(course('ACTIVE', []), unowned, { ownsAllParts: true }), false);
    assert.equal(canUnlockPart(course('ACTIVE', []), undefined, parts), false);
    assert.equal(canUnlockPart(course('ACTIVE', []), null, parts), false);
  });

  it('treats missing or malformed ownership as unknown, never as "not owned"', () => {
    for (const owned of [undefined, null, 'false', 0]) {
      assert.equal(canUnlockPart(course('ACTIVE', []), { owned }, parts), false, String(owned));
    }
    assert.equal(isUnownedPart({ owned: false }), true);
    assert.equal(isUnownedPart({}), false);
  });

  it('still shows when the parts response omits ownsAllParts', () => {
    assert.equal(canUnlockPart(course('ACTIVE', []), unowned, {}), true);
    assert.equal(canUnlockPart(course('ACTIVE', []), unowned, undefined), true);
  });

  it('never shows for a revoked or archived student, or an unpublished course', () => {
    assert.equal(canUnlockPart(course('REVOKED', []), unowned, parts), false);
    assert.equal(canUnlockPart(course('ARCHIVED', []), unowned, parts), false);
    assert.equal(canUnlockPart(course('ACTIVE', [], 'ARCHIVED'), unowned, parts), false);
    assert.equal(canUnlockPart(course('NOT_ENROLLED', ['CODE'], 'HIDDEN'), unowned, parts), false);
  });
});
