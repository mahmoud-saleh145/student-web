import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canEnterCode,
  courseOwnership,
  ownershipKnownFor,
  redeemPrecheck,
  unlockSummary,
  type OwnershipSnapshot,
  type PartLike,
  type SectionLike,
} from './ownership.ts';

const part = (id: string, owned: unknown, sectionIds: string[] = []): PartLike => ({
  id,
  title: `Part ${id}`,
  owned,
  sections: sectionIds.map((sid) => ({ id: sid })),
});
const section = (id: string, locked: boolean): SectionLike => ({ id, title: `Section ${id}`, locked });

const snapshot = (over: Partial<OwnershipSnapshot> = {}): OwnershipSnapshot => ({
  accessState: 'NOT_ENROLLED',
  fullCourseOwned: false,
  parts: [],
  sections: [],
  ...over,
});

describe('courseOwnership — never rounds access up', () => {
  it('is "none" without live access, whatever else the answers say', () => {
    for (const accessState of ['NOT_ENROLLED', 'PENDING_APPROVAL', 'PENDING_PAYMENT', 'EXPIRED', 'REVOKED', 'ARCHIVED'] as const) {
      assert.deepEqual(courseOwnership(snapshot({ accessState, fullCourseOwned: true, parts: [part('a', true)] })), { kind: 'none' });
    }
  });

  it('is "full" only on the server’s explicit whole-course answer', () => {
    assert.deepEqual(courseOwnership(snapshot({ accessState: 'ACTIVE', fullCourseOwned: true })), { kind: 'full' });
  });

  it('reports a part-only student as parts, not as the full course', () => {
    const result = courseOwnership(
      snapshot({ accessState: 'ACTIVE', fullCourseOwned: false, parts: [part('a', true), part('b', false), part('c', false)] }),
    );
    assert.equal(result.kind, 'parts');
    assert.equal(result.kind === 'parts' && result.owned.length, 1);
    assert.equal(result.kind === 'parts' && result.total, 3);
  });

  it('reports every part bought one by one as parts (3 of 3), still not "full"', () => {
    const result = courseOwnership(
      snapshot({ accessState: 'ACTIVE', fullCourseOwned: false, parts: [part('a', true), part('b', true), part('c', true)] }),
    );
    assert.equal(result.kind, 'parts');
    assert.equal(result.kind === 'parts' && result.owned.length, 3);
  });

  it('treats a missing or non-boolean `owned` as not owned', () => {
    const result = courseOwnership(
      snapshot({ accessState: 'ACTIVE', fullCourseOwned: false, parts: [part('a', undefined), part('b', 'yes'), part('c', null)] }),
    );
    assert.deepEqual(result, { kind: 'sections' });
  });

  it('says "unknown" rather than "full" when the server did not answer about the whole course', () => {
    assert.deepEqual(courseOwnership(snapshot({ accessState: 'ACTIVE', fullCourseOwned: null })), { kind: 'unknown' });
  });
});

describe('canEnterCode', () => {
  it('offers the code box to anyone who can still acquire something', () => {
    for (const accessState of ['NOT_ENROLLED', 'ACTIVE', 'EXPIRED', 'PENDING_APPROVAL'] as const) {
      assert.equal(canEnterCode(snapshot({ accessState })), true, accessState);
    }
  });

  it('hides it for a whole-course owner and for revoked or archived access', () => {
    assert.equal(canEnterCode(snapshot({ accessState: 'ACTIVE', fullCourseOwned: true })), false);
    assert.equal(canEnterCode(snapshot({ accessState: 'REVOKED' })), false);
    assert.equal(canEnterCode(snapshot({ accessState: 'ARCHIVED' })), false);
  });
});

describe('redeemPrecheck — a card must not be used up for nothing', () => {
  const partial = snapshot({
    accessState: 'ACTIVE',
    parts: [part('a', true), part('b', false)],
    sections: [section('s1', false), section('s2', true)],
  });

  it('lets a first-time student redeem any card', () => {
    for (const targetType of ['COURSE', 'PART', 'SECTION', 'TEACHER'] as const) {
      assert.deepEqual(redeemPrecheck({ targetType, sectionId: 's1' }, snapshot({ parts: [part('a', false)], sections: [section('s1', true)] })), {
        action: 'proceed',
      });
    }
  });

  it('lets a part owner upgrade with a whole-course or teacher card', () => {
    assert.deepEqual(redeemPrecheck({ targetType: 'COURSE' }, partial), { action: 'proceed' });
    assert.deepEqual(redeemPrecheck({ targetType: 'TEACHER' }, partial), { action: 'proceed' });
  });

  it('asks before a part card when the student already owns a part', () => {
    const result = redeemPrecheck({ targetType: 'PART' }, partial);
    assert.equal(result.action, 'confirm');
    assert.equal(result.action === 'confirm' && result.reason, 'part-may-be-owned');
    assert.deepEqual(result.action === 'confirm' && result.reason === 'part-may-be-owned' && result.ownedParts.map((p) => p.id), ['a']);
  });

  it('stops a part card when every part is already owned', () => {
    assert.deepEqual(
      redeemPrecheck({ targetType: 'PART' }, snapshot({ accessState: 'ACTIVE', parts: [part('a', true), part('b', true)] })),
      { action: 'block', reason: 'all-parts-owned' },
    );
  });

  it('asks before a section card for a section that is already open', () => {
    const result = redeemPrecheck({ targetType: 'SECTION', sectionId: 's1' }, partial);
    assert.equal(result.action, 'confirm');
    assert.equal(result.action === 'confirm' && result.reason, 'section-already-open');
    assert.deepEqual(redeemPrecheck({ targetType: 'SECTION', sectionId: 's2' }, partial), { action: 'proceed' });
  });

  it('stops every card for a whole-course owner', () => {
    for (const targetType of ['COURSE', 'PART', 'SECTION', 'TEACHER'] as const) {
      assert.deepEqual(redeemPrecheck({ targetType }, snapshot({ accessState: 'ACTIVE', fullCourseOwned: true })), {
        action: 'block',
        reason: 'whole-course-owned',
      });
    }
  });
});

describe('unlockSummary — reports only what the server changed', () => {
  it('reports the whole course, and nothing smaller beside it', () => {
    const before = snapshot({ parts: [part('a', false, ['s1']), part('b', false, ['s2'])], sections: [section('s1', true), section('s2', true)] });
    const after = snapshot({
      accessState: 'ACTIVE',
      fullCourseOwned: true,
      parts: [part('a', true, ['s1']), part('b', true, ['s2'])],
      sections: [section('s1', false), section('s2', false)],
    });
    assert.deepEqual(unlockSummary(before, after), { wholeCourse: true, parts: [], sections: [], nothingNew: false });
  });

  it('reports exactly the part that became owned, not the one held before', () => {
    const before = snapshot({
      accessState: 'ACTIVE',
      parts: [part('a', true, ['s1']), part('b', false, ['s2'])],
      sections: [section('s1', false), section('s2', true)],
    });
    const after = snapshot({
      accessState: 'ACTIVE',
      parts: [part('a', true, ['s1']), part('b', true, ['s2'])],
      sections: [section('s1', false), section('s2', false)],
    });
    const result = unlockSummary(before, after);
    assert.equal(result.wholeCourse, false);
    assert.deepEqual(result.parts.map((p) => p.id), ['b']);
    // s2 opened because part b was bought; it is not listed a second time.
    assert.deepEqual(result.sections, []);
    assert.equal(result.nothingNew, false);
  });

  it('a part-only redemption is never reported as the whole course', () => {
    const before = snapshot({ parts: [part('a', false), part('b', false)] });
    const after = snapshot({ accessState: 'ACTIVE', fullCourseOwned: false, parts: [part('a', true), part('b', false)] });
    assert.equal(unlockSummary(before, after).wholeCourse, false);
  });

  it('reports a single section opened by a section card', () => {
    const before = snapshot({ sections: [section('s1', true), section('s2', true)] });
    const after = snapshot({ accessState: 'ACTIVE', sections: [section('s1', false), section('s2', true)] });
    const result = unlockSummary(before, after);
    assert.deepEqual(result.sections.map((s) => s.id), ['s1']);
    assert.equal(result.nothingNew, false);
  });

  it('says so when nothing changed (a duplicate card)', () => {
    const same = snapshot({ accessState: 'ACTIVE', parts: [part('a', true), part('b', false)], sections: [section('s1', false)] });
    assert.deepEqual(unlockSummary(same, same), { wholeCourse: false, parts: [], sections: [], nothingNew: true });
  });

  it('does not claim a section that was simply not listed before', () => {
    const before = snapshot({ sections: [] });
    const after = snapshot({ accessState: 'ACTIVE', sections: [section('s9', false)] });
    assert.deepEqual(unlockSummary(before, after).sections, []);
  });
});

describe('ownershipKnownFor', () => {
  it('a part card needs the owned parts from at least one of the two requests', () => {
    assert.equal(ownershipKnownFor('PART', { parts: null, joinOptions: null }), false);
    assert.equal(ownershipKnownFor('PART', { parts: undefined, joinOptions: undefined }), false);
    assert.equal(ownershipKnownFor('PART', { parts: { hasParts: false, parts: [] }, joinOptions: null }), true);
    assert.equal(ownershipKnownFor('PART', { parts: null, joinOptions: { hasParts: true, parts: [] } }), true);
  });

  it('other cards are checked against the course itself, which is always there', () => {
    for (const type of ['SECTION', 'COURSE', 'TEACHER']) {
      assert.equal(ownershipKnownFor(type, { parts: null, joinOptions: null }), true, type);
    }
  });
});
