import type { Language } from '@/i18n/dictionaries';
import { localizedName } from '../lib/format.ts';
import type { CoursePart, CourseSection } from '@/types/domain';

/**
 * Grouping a course's sections under its parts.
 *
 * This lived twice — once in the course page, once in the lesson page — with
 * the two copies drifting. It is one function now because both screens must
 * agree on what "Part 2" contains; a curriculum that disagrees with the
 * sidebar is worse than either version alone.
 *
 * Both copies matched a part's sections to the course's sections BY TITLE,
 * which is wrong in two ways that only show up on real data:
 *
 *   * `new Map(sections.map((s) => [s.title, s]))` keeps the LAST section for
 *     any repeated title, so a course with two sections both called
 *     "Revision" silently loses one and shows the other twice.
 *   * A part whose section titles had been edited since the part was built
 *     matched nothing and rendered empty.
 *
 * `CoursePartSection` carries an `id`, so matching is by id here. Titles are
 * display data; ids are identity.
 */
export interface CurriculumGroup {
  key: string;
  /** Empty for the single synthetic group used when a course has no parts. */
  title: string;
  owned: boolean;
  locked: boolean;
  sections: CourseSection[];
  lessonCount: number;
  /**
   * True for the trailing group that holds the course's sections that belong
   * to no part. Rendered with its own label rather than as "Part N".
   */
  unassigned?: boolean;
}

/**
 * One group per part, in the server's order, then one trailing group for any
 * section that belongs to no part.
 *
 * The trailing group matters: a course's sections and its parts are two
 * different server answers, and a published section that an administrator has
 * not (yet) put inside a part is still part of the course. Grouping used to
 * keep only the sections some part claimed, so such a section simply vanished
 * from the web outline while the mobile app, which lists sections flat, still
 * showed it. Nothing the server returns is dropped here any more.
 *
 * Falls back to a single untitled group holding every section when the course
 * has no parts, or when no part matched any section — the second case keeps a
 * course readable rather than showing an empty curriculum if part and section
 * data ever disagree.
 */
export function buildCurriculumGroups(
  sections: CourseSection[],
  parts: CoursePart[] | undefined,
  language: Language,
): CurriculumGroup[] {
  const fallback: CurriculumGroup[] = [
    {
      key: 'all',
      title: '',
      owned: false,
      locked: false,
      sections,
      lessonCount: sections.reduce((n, s) => n + s.lessonCount, 0),
    },
  ];

  const source = parts ?? [];
  if (source.length === 0) return fallback;

  const byId = new Map(sections.map((s) => [s.id, s]));

  const groups: CurriculumGroup[] = source.map((part) => {
    const matched = part.sections
      .map((ps) => byId.get(ps.id))
      .filter((s): s is CourseSection => Boolean(s));

    return {
      key: part.id,
      title: localizedName({ name: part.title, nameAr: part.titleAr }, language),
      owned: part.owned,
      // A part is locked when nothing in it can be opened. Derived from the
      // sections rather than from the part's price so a free preview inside a
      // paid part still reads as reachable.
      locked: matched.length > 0 && matched.every((s) => s.locked),
      sections: matched,
      lessonCount: matched.reduce((n, s) => n + s.lessonCount, 0),
    };
  });

  if (!groups.some((g) => g.sections.length > 0)) return fallback;

  const claimed = new Set(source.flatMap((part) => part.sections.map((ps) => ps.id)));
  const unassigned = sections.filter((s) => !claimed.has(s.id));
  if (unassigned.length > 0) {
    groups.push({
      key: 'unassigned',
      title: '',
      owned: false,
      locked: unassigned.every((s) => s.locked),
      sections: unassigned,
      lessonCount: unassigned.reduce((n, s) => n + s.lessonCount, 0),
      unassigned: true,
    });
  }

  return groups;
}
