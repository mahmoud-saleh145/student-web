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
  parts?: ReadonlyArray<{ owned: boolean }>;
}): { free: boolean; approval: boolean; code: boolean; none: boolean } {
  const owned = options.fullCourse.owned;
  const partUpgrade = isPartUpgrade(options);
  return {
    free: options.enrollmentMethods.includes('FREE') && !owned,
    approval: options.enrollmentMethods.includes('ADMIN_APPROVAL') && !owned,
    code: (options.enrollmentMethods.includes('CODE') || partUpgrade) && options.methods.accessCode,
    none: options.enrollmentMethods.length === 0 && !partUpgrade,
  };
}

/** ACTIVE on a course with parts, without the whole course, and a part still to buy. */
export function isPartUpgrade(options: {
  fullCourse: { owned: boolean };
  accessState?: AccessState;
  hasParts?: boolean;
  parts?: ReadonlyArray<{ owned: boolean }>;
}): boolean {
  return (
    options.accessState === 'ACTIVE' &&
    !options.fullCourse.owned &&
    options.hasParts === true &&
    (options.parts ?? []).some((p) => !p.owned)
  );
}

/**
 * Whether a part's header on the course page gets its own "Unlock this part"
 * button, which opens the join sheet with that part preselected.
 *
 * Ownership is the server's per-part `owned` flag from `GET /courses/:id/parts`
 * and nothing else — not a lock derived from lessons, and never a synthetic
 * curriculum group (the "other sections" bucket is not a part and cannot be
 * bought). Parts are sold only as access cards, so the button appears only
 * where a code could actually be redeemed for this course: a published course
 * the server lists CODE for (not joined, or expired), or one the student is
 * already ACTIVE on — the part-upgrade case above.
 */
export function canUnlockPart(course: CourseAccessInput, part: { owned: boolean } | undefined): boolean {
  if (!part || part.owned) return false;
  if (course.status !== 'PUBLISHED') return false;
  return course.access.state === 'ACTIVE' || course.access.availableMethods.includes('CODE');
}
