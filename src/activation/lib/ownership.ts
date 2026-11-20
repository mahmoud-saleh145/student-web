/**
 * What a student holds in a course, what a card would add, and what a
 * redemption actually added — all read from the backend's own answers.
 *
 * Nothing here grants or decides anything. The backend's
 * `POST /courses/:id/redeem` resolves a card's scope from the card row and
 * writes the entitlement; these functions only COMPARE server answers
 * (`/courses/:id`, `/courses/:id/parts`, `/courses/:id/join-options`,
 * `/codes/validate`) so the portal can say truthfully what the student owns
 * and report what changed.
 *
 * Two backend facts shape this file:
 *
 *   1. The redeem response is `{ state, courseId }`. It does not say what was
 *      unlocked. So the portal reads ownership before and after and reports
 *      the difference (`unlockSummary`).
 *
 *   2. Whether a card is worth redeeming is decided by the backend, inside the
 *      redemption itself: a PART or SECTION card for something the student
 *      already holds is refused with ALREADY_ENROLLED and left unspent. The
 *      portal therefore makes no judgement of its own before sending a card —
 *      nothing here stops, delays or second-guesses a redemption.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

export type AccessStateLike =
  | 'NOT_ENROLLED'
  | 'PENDING_APPROVAL'
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ARCHIVED';

export interface PartLike {
  id: string;
  title: string;
  titleAr?: string | null;
  /** The server's word. Anything but a literal `true` is "not known to be owned". */
  owned?: unknown;
  sections?: ReadonlyArray<{ id: string }>;
}

export interface SectionLike {
  id: string;
  title: string;
  locked: boolean;
}

/** One reading of the server's ownership answers for a course. */
export interface OwnershipSnapshot {
  accessState: AccessStateLike;
  /** `join-options.fullCourse.owned`; null when the server did not say. */
  fullCourseOwned: boolean | null;
  parts: ReadonlyArray<PartLike>;
  sections: ReadonlyArray<SectionLike>;
}

const isOwned = (part: PartLike): boolean => part.owned === true;

/**
 * One snapshot from the three server answers about a course.
 *
 * `joinOptions` is absent when the course is not on offer (the backend answers
 * 404 for anything but a published course); the whole-course question is then
 * left unanswered (`null`) rather than assumed either way. Parts come from
 * `join-options` when present, else from `/parts`.
 */
export function buildSnapshot(input: {
  course: { access: { state: AccessStateLike }; sections: ReadonlyArray<SectionLike> };
  parts?: { hasParts: boolean; parts: ReadonlyArray<PartLike> } | null;
  joinOptions?: { fullCourse: { owned: unknown }; hasParts: boolean; parts: ReadonlyArray<PartLike> } | null;
}): OwnershipSnapshot {
  const { course, parts, joinOptions } = input;
  return {
    accessState: course.access.state,
    fullCourseOwned: joinOptions ? joinOptions.fullCourse.owned === true : null,
    parts: joinOptions ? (joinOptions.hasParts ? joinOptions.parts : []) : parts?.hasParts ? parts.parts : [],
    sections: course.sections.map((s) => ({ id: s.id, title: s.title, locked: s.locked })),
  };
}

/**
 * Is the "before" picture complete enough to say what a card unlocked?
 *
 * The receipt reports the difference between ownership before and after a
 * redemption. For a part card that difference is taken over the parts the
 * student owns, and those come from two requests that can each fail on their
 * own. If BOTH failed, the snapshot's `parts` is an empty list that means
 * "unknown", not "none" — and a difference taken against it would list parts
 * the student already held as newly unlocked. The caller then redeems as
 * usual (the backend decides what a card is worth, and refuses one that would
 * unlock nothing) but gives the plain receipt instead of an itemised one.
 * Section, course and teacher cards are measured against the course itself,
 * which is always present.
 */
export function ownershipKnownFor(
  targetType: string,
  sources: { parts: unknown; joinOptions: unknown },
): boolean {
  if (targetType !== 'PART') return true;
  return sources.parts != null || sources.joinOptions != null;
}

// ---------------------------------------------------------------------------
// What the student holds
// ---------------------------------------------------------------------------

export type CourseOwnership =
  /** No live access (not enrolled, pending, expired, revoked, archived). */
  | { kind: 'none' }
  /** The server says the whole course is owned. */
  | { kind: 'full' }
  /** Some (or every) part, bought part by part — not the whole course. */
  | { kind: 'parts'; owned: PartLike[]; total: number }
  /** Live access to something less than the course, and no part: single sections. */
  | { kind: 'sections' }
  /** Live access, but the server gave no answer about its extent. */
  | { kind: 'unknown' };

/**
 * The extent of a student's access, never rounded up.
 *
 * "Full" is claimed only on the server's explicit `fullCourse.owned`. Owning
 * every part is reported as parts ("3 of 3"), because that is what it is: a
 * part added to the course later is not covered by it.
 */
export function courseOwnership(snapshot: Pick<OwnershipSnapshot, 'accessState' | 'fullCourseOwned' | 'parts'>): CourseOwnership {
  if (snapshot.accessState !== 'ACTIVE') return { kind: 'none' };
  if (snapshot.fullCourseOwned === true) return { kind: 'full' };

  const owned = snapshot.parts.filter(isOwned);
  if (owned.length > 0) return { kind: 'parts', owned, total: snapshot.parts.length };

  return snapshot.fullCourseOwned === false ? { kind: 'sections' } : { kind: 'unknown' };
}

/**
 * Whether the portal offers a code box at all. Mirrors the server: a student
 * who owns the whole course is refused with ALREADY_ENROLLED, and a revoked or
 * archived enrolment is not self-service.
 */
export function canEnterCode(snapshot: Pick<OwnershipSnapshot, 'accessState' | 'fullCourseOwned'>): boolean {
  if (snapshot.fullCourseOwned === true) return false;
  return snapshot.accessState !== 'REVOKED' && snapshot.accessState !== 'ARCHIVED';
}

// ---------------------------------------------------------------------------
// After redeeming: what changed
// ---------------------------------------------------------------------------

export interface UnlockSummary {
  /** The whole course became owned. When true, `parts` and `sections` are empty. */
  wholeCourse: boolean;
  /** Parts that became owned. */
  parts: PartLike[];
  /** Sections that opened and are not inside a newly owned part. */
  sections: SectionLike[];
  /** The server accepted the request but ownership did not change. */
  nothingNew: boolean;
}

export function unlockSummary(before: OwnershipSnapshot, after: OwnershipSnapshot): UnlockSummary {
  if (after.fullCourseOwned === true && before.fullCourseOwned !== true) {
    return { wholeCourse: true, parts: [], sections: [], nothingNew: false };
  }

  const ownedBefore = new Set(before.parts.filter(isOwned).map((p) => p.id));
  const parts = after.parts.filter((p) => isOwned(p) && !ownedBefore.has(p.id));

  const insideNewParts = new Set(parts.flatMap((p) => (p.sections ?? []).map((s) => s.id)));
  const lockedBefore = new Map(before.sections.map((s) => [s.id, s.locked]));
  const sections = after.sections.filter(
    // Only a section the server showed as locked before and open now. A
    // section that was not listed before is not claimed as "unlocked".
    (s) => !s.locked && lockedBefore.get(s.id) === true && !insideNewParts.has(s.id),
  );

  return {
    wholeCourse: false,
    parts,
    sections,
    nothingNew: parts.length === 0 && sections.length === 0,
  };
}
