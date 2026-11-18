/**
 * What a course's access state means for the screen.
 *
 * A line-for-line port of the mobile app's `courseAccessFlags` and of the
 * label rule in its `AccessPanel`, so that the same course reads the same way
 * on both clients. Every input comes from the backend's own resolver
 * (`course.access`, `course.status`, `course.isFree`, `course.price`) — nothing
 * here decides availability by itself.
 */
import type { AccessState, CourseStatus, EnrollmentMethod, Money } from '../types/domain';

export interface CourseAccessInput {
  status: CourseStatus;
  access: { state: AccessState; availableMethods: EnrollmentMethod[] };
}

export interface CourseAccessFlags {
  hasAccess: boolean;
  isPending: boolean;
  isExpired: boolean;
  isArchived: boolean;
  isRevoked: boolean;
  canJoin: boolean;
}

export function courseAccessFlags(course: CourseAccessInput): CourseAccessFlags {
  const state = course.access.state;
  return {
    hasAccess: state === 'ACTIVE',
    isPending: state === 'PENDING_APPROVAL' || state === 'PENDING_PAYMENT',
    isExpired: state === 'EXPIRED',
    isArchived: state === 'ARCHIVED' || course.status === 'ARCHIVED',
    isRevoked: state === 'REVOKED',
    canJoin: state === 'NOT_ENROLLED' && course.status === 'PUBLISHED' && course.access.availableMethods.length > 0,
  };
}

/**
 * The join button's wording.
 *
 * "Join for free" only when the course *is* free. A paid course with no
 * current price row is not free — it is a course whose price is not on sale
 * yet — so it gets the neutral "Join now", never a free label.
 */
export type JoinLabel = { kind: 'free' } | { kind: 'buy'; price: Money } | { kind: 'join' };

export function joinLabel(course: { isFree: boolean; price: Money | null }): JoinLabel {
  if (course.isFree) return { kind: 'free' };
  if (course.price) return { kind: 'buy', price: course.price };
  return { kind: 'join' };
}

/** Badge key for a non-default access state, as on the mobile course card. */
export const ACCESS_BADGE: Readonly<Record<AccessState, { key: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } | null>> = {
  NOT_ENROLLED: null,
  ACTIVE: { key: 'access.active', tone: 'success' },
  PENDING_APPROVAL: { key: 'access.pendingApproval', tone: 'warning' },
  PENDING_PAYMENT: { key: 'access.pendingPayment', tone: 'warning' },
  EXPIRED: { key: 'access.expired', tone: 'danger' },
  REVOKED: { key: 'access.revoked', tone: 'danger' },
  ARCHIVED: { key: 'access.archived', tone: 'neutral' },
};

/**
 * Which ways in the join sheet offers. Online payment is never rendered: the
 * platform takes no card payments, and the mobile sheet shows nothing for it
 * either. A method is shown only when the server listed it — with one
 * exception, the part upgrade below.
 *
 * Part upgrade: a student who owns one part of a course (say Before Midterm)
 * is ACTIVE on it, and for an ACTIVE student the server's `enrollmentMethods`
 * is always empty — "already enrolled" leaves nothing to join. Yet
 * `POST /courses/:id/redeem` explicitly accepts a code from such a student
 * while the enrolment does not cover every section, because that is how the
 * next part is bought. So when the student is ACTIVE, does not own the whole
 * course and at least one part is still unowned, the code box is offered.
 * Free and approval stay hidden — those are first-join methods. Which content
 * the code unlocks is still decided entirely by the server from the code's
 * own scope; the box only lets the student reach that endpoint.
 */
export function joinSheetActions(options: {
  enrollmentMethods: EnrollmentMethod[];
  methods: { accessCode: boolean };
  fullCourse: { owned: boolean };
  accessState?: AccessState;
  hasParts?: boolean;
  parts?: ReadonlyArray<{ owned?: unknown }>;
}): { free: boolean; approval: boolean; code: boolean; none: boolean } {
  const owned = options.fullCourse.owned;
  const partCode = partCodeAvailable(options);
  return {
    free: options.enrollmentMethods.includes('FREE') && !owned,
    approval: options.enrollmentMethods.includes('ADMIN_APPROVAL') && !owned,
    code: (options.enrollmentMethods.includes('CODE') || partCode) && options.methods.accessCode,
    none: options.enrollmentMethods.length === 0 && !partCode,
  };
}

/**
 * Access states in which a student may not acquire anything themselves: a
 * revoked enrolment is an administrative decision, and an archived one belongs
 * to a course that is no longer on sale. Every other state may redeem a card.
 */
const NO_SELF_SERVICE: ReadonlySet<AccessState> = new Set(['REVOKED', 'ARCHIVED']);

/**
 * True only when the server said, in so many words, that the student does not
 * own this part. A missing, null or non-boolean `owned` is "unknown", and an
 * unknown part is never offered for sale — guessing "not owned" would invite a
 * student to pay again for what they hold.
 */
export function isUnownedPart(part: { owned?: unknown } | null | undefined): boolean {
  return part != null && part.owned === false;
}

/**
 * A course with parts, not owned whole, with at least one part the server
 * reports unowned, for a student allowed to acquire things. Part cards are the
 * only way a part is sold, so the code box must be reachable here even when
 * `enrollmentMethods` is empty — which it always is for an ACTIVE student.
 */
function partCodeAvailable(options: {
  fullCourse: { owned: boolean };
  accessState?: AccessState;
  hasParts?: boolean;
  parts?: ReadonlyArray<{ owned?: unknown }>;
}): boolean {
  return (
    options.accessState !== undefined &&
    !NO_SELF_SERVICE.has(options.accessState) &&
    !options.fullCourse.owned &&
    options.hasParts === true &&
    (options.parts ?? []).some(isUnownedPart)
  );
}

/**
 * ACTIVE on a course with parts, without the whole course, and a part still to
 * buy — the student is adding to what they have. Only changes the sheet's
 * wording ("Unlock a part"); what the sheet offers is `joinSheetActions`.
 */
export function isPartUpgrade(options: {
  fullCourse: { owned: boolean };
  accessState?: AccessState;
  hasParts?: boolean;
  parts?: ReadonlyArray<{ owned?: unknown }>;
}): boolean {
  return options.accessState === 'ACTIVE' && partCodeAvailable(options);
}

/**
 * THE rule for the "Unlock this part" button in a part's header:
 *
 *   show = the part exists in `GET /courses/:id/parts`
 *          && the server reports it `owned: false`
 *          && the student does not own the whole course (`ownsAllParts`)
 *          && the course is published and the student is not revoked/archived.
 *
 * Nothing about the part's CONTENT enters into it — not its section count, its
 * lesson count, whether its lessons are published, `course.sections[].locked`,
 * or free previews. An empty part is still a part that can be sold, and the
 * old content-derived checks are exactly what hid the button. Nor does it
 * depend on the part's name or on how many parts the course has. The
 * synthetic "other sections" group is not in `/parts`, so it never matches.
 *
 * The button only opens the existing sheet. Whether a code unlocks anything —
 * and what — is decided by `POST /courses/:id/redeem` from the code's scope.
 */
export function canUnlockPart(
  course: CourseAccessInput,
  part: { owned?: unknown } | null | undefined,
  parts?: { ownsAllParts?: unknown } | null,
): boolean {
  if (!isUnownedPart(part)) return false;
  if (parts?.ownsAllParts === true) return false;
  if (course.status !== 'PUBLISHED') return false;
  return !NO_SELF_SERVICE.has(course.access.state);
}
