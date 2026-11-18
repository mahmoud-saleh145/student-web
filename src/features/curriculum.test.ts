import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCurriculumGroups } from './curriculum.ts';
import type { CoursePart, CourseSection } from '../types/domain';

const section = (id: string, locked = false): CourseSection =>
  ({ id, courseId: 'crs', title: id, description: null, order: 1, lessonCount: 2, durationSeconds: 0, locked, unlocksAt: null, progressPercent: 0, lessons: [] }) as CourseSection;

const part = (id: string, sectionIds: string[], owned = false): CoursePart =>
  ({
    id,
    title: id,
    titleAr: null,
    description: null,
    sortOrder: 1,
    price: null,
    pricePercent: null,
    currency: 'EGP',
    owned,
    ownedSince: null,
    ownedVia: null,
    purchasable: !owned,
    sectionCount: sectionIds.length,
    sections: sectionIds.map((sid) => ({ id: sid, title: sid, titleAr: null, sortOrder: 1, locked: !owned })),
  }) as CoursePart;

describe('buildCurriculumGroups', () => {
  it('groups sections under their parts by id, in the server order', () => {
    const groups = buildCurriculumGroups(
      [section('pre'), section('post', true)],
      [part('p1', ['pre'], true), part('p2', ['post'])],
      'en'
    );
    assert.deepEqual(
      groups.map((g) => [g.key, g.sections.map((s) => s.id), g.owned, g.locked]),
      [
        ['p1', ['pre'], true, false],
        ['p2', ['post'], false, true],
      ]
    );
  });

  it('keeps a section that belongs to no part instead of dropping it', () => {
    // The server lists three published sections; the parts claim only two.
    // The third used to vanish from the web outline (mobile showed it).
    const groups = buildCurriculumGroups(
      [section('pre'), section('post', true), section('extra', true)],
      [part('p1', ['pre'], true), part('p2', ['post'])],
      'en'
    );
    assert.deepEqual(
      groups.map((g) => [g.key, g.sections.map((s) => s.id)]),
      [
        ['p1', ['pre']],
        ['p2', ['post']],
        ['unassigned', ['extra']],
      ]
    );
    const extra = groups[2]!;
    assert.equal(extra.unassigned, true);
    assert.equal(extra.locked, true);
    assert.equal(extra.lessonCount, 2);
    assert.equal(extra.owned, false);
  });

  it('a second Pre-Mid section the admin adds to Part 1 shows under Part 1, unlocked for a holder', () => {
    const groups = buildCurriculumGroups(
      [section('pre'), section('post', true), section('pre2')],
      [part('p1', ['pre', 'pre2'], true), part('p2', ['post'])],
      'en'
    );
    assert.deepEqual(groups[0]!.sections.map((s) => s.id), ['pre', 'pre2']);
    assert.equal(groups[0]!.locked, false);
    assert.equal(groups.length, 2);
  });

  it('adds no trailing group when every section is claimed by a part', () => {
    const groups = buildCurriculumGroups([section('pre')], [part('p1', ['pre'])], 'en');
    assert.deepEqual(groups.map((g) => g.key), ['p1']);
  });

  it('falls back to one flat group when the course has no parts', () => {
    const groups = buildCurriculumGroups([section('a'), section('b')], [], 'en');
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.key, 'all');
    assert.deepEqual(groups[0]!.sections.map((s) => s.id), ['a', 'b']);
  });

  it('keeps every part when no part matches any section, with the sections in the trailing group', () => {
    // This used to collapse to one header-less list, which removed every
    // part header — and every "Unlock this part" button — from the page.
    const groups = buildCurriculumGroups([section('a')], [part('p1', ['gone'])], 'en');
    assert.deepEqual(groups.map((g) => g.key), ['p1', 'unassigned']);
    assert.deepEqual(groups[1]!.sections.map((s) => s.id), ['a']);
  });

  it('keeps a completely empty part, locked when unowned', () => {
    const groups = buildCurriculumGroups(
      [section('a')],
      [part('before', ['a'], true), part('after', [])],
      'en',
    );
    assert.deepEqual(groups.map((g) => g.key), ['before', 'after']);
    assert.equal(groups[1]!.sections.length, 0);
    assert.equal(groups[1]!.lessonCount, 0);
    assert.equal(groups[1]!.owned, false);
    assert.equal(groups[1]!.locked, true);
  });

  it('keeps all parts when every part is empty and the course has no sections', () => {
    const groups = buildCurriculumGroups([], [part('before', []), part('after', [])], 'en');
    assert.deepEqual(groups.map((g) => g.key), ['before', 'after']);
    assert.ok(groups.every((g) => !g.owned && g.locked));
  });

  it('keeps three or more parts in server order', () => {
    const groups = buildCurriculumGroups(
      [section('a'), section('b')],
      [part('p1', ['a'], true), part('p2', []), part('p3', ['b'])],
      'en',
    );
    assert.deepEqual(groups.map((g) => g.key), ['p1', 'p2', 'p3']);
  });

  it('never reads a missing owned flag as owned', () => {
    const p = { ...part('p1', ['a']), owned: undefined } as unknown as CoursePart;
    assert.equal(buildCurriculumGroups([section('a', true)], [p], 'en')[0]!.owned, false);
  });

  it('uses the Arabic part title when the language is Arabic', () => {
    const p = { ...part('p1', ['a']), titleAr: 'الجزء الأول' } as CoursePart;
    assert.equal(buildCurriculumGroups([section('a')], [p], 'ar')[0]!.title, 'الجزء الأول');
  });
});
