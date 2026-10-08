import type { Language } from '@/i18n/dictionaries';
import { localizedName } from '@/lib/format';
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
}

/**
 * One group per part, in the server's order.
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

  return groups.some((g) => g.sections.length > 0) ? groups : fallback;
}
