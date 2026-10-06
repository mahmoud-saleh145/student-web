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
 * either. A method is shown only when the server listed it.
 */
export function joinSheetActions(options: {
  enrollmentMethods: EnrollmentMethod[];
  methods: { accessCode: boolean };
  fullCourse: { owned: boolean };
}): { free: boolean; approval: boolean; code: boolean; none: boolean } {
  const owned = options.fullCourse.owned;
  return {
    free: options.enrollmentMethods.includes('FREE') && !owned,
    approval: options.enrollmentMethods.includes('ADMIN_APPROVAL') && !owned,
    code: options.enrollmentMethods.includes('CODE') && options.methods.accessCode,
    none: options.enrollmentMethods.length === 0,
  };
}
