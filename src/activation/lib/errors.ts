/**
 * Portal-specific wording for a backend refusal, by where it happened.
 *
 * The platform's generic sentences are right for most codes and are used
 * whenever this returns null. A few are wrong, or unhelpful, in the portal:
 *
 *   - `CODE_NOT_RECHARGEABLE` is the backend's answer for a card entered in
 *     the wrong place, in BOTH directions: a recharge card on a course, and a
 *     course card in the wallet. The generic sentence covers only the first.
 *   - `INVALID_CODE` on a course deliberately does not say why (unknown,
 *     expired, revoked, another course, another student — the backend keeps
 *     them indistinguishable so the endpoint is not an oracle). The portal
 *     says the one useful thing it can: check the code and the course.
 *   - `INVALID_STATE` on redemption means the card's part is not on sale; the
 *     transaction rolled back and the card is intact, which is worth saying.
 *
 * Returns a key of the portal dictionary, or null for the platform mapping.
 * Pure and dependency-free so it runs under `node --test`.
 */

export type ActivationErrorContext = 'course-code' | 'recharge' | 'general';

export function activationErrorKey(
  code: string | undefined,
  status: number | undefined,
  context: ActivationErrorContext,
): string | null {
  if (code === 'RATE_LIMITED' || status === 429) return 'act.err.rateLimited';

  if (context === 'course-code') {
    switch (code) {
      case 'CODE_NOT_RECHARGEABLE':
        return 'act.err.rechargeOnCourse';
      case 'INVALID_CODE':
        return 'act.err.invalidCourseCode';
      case 'CODE_ALREADY_USED':
        return 'act.err.codeUsed';
      case 'INVALID_STATE':
        return 'act.err.partUnavailable';
      case 'ALREADY_ENROLLED':
        return 'act.err.alreadyOwned';
      case 'FORBIDDEN':
        return 'act.course.codesNotAccepted';
      case 'COURSE_NOT_AVAILABLE':
      case 'NOT_FOUND':
        return 'act.course.notOnOffer';
      default:
        return null;
    }
  }

  if (context === 'recharge') {
    switch (code) {
      case 'CODE_NOT_RECHARGEABLE':
        return 'act.err.courseOnWallet';
      case 'INVALID_CODE':
        return 'act.err.invalidRecharge';
      case 'CODE_ALREADY_USED':
        return 'act.err.codeUsed';
      default:
        return null;
    }
  }

  return null;
}

/** A card entered in the wrong place: where the student should take it. */
export function wrongPlaceFor(code: string | undefined, context: ActivationErrorContext): 'wallet' | 'courses' | null {
  if (code !== 'CODE_NOT_RECHARGEABLE') return null;
  if (context === 'course-code') return 'wallet';
  if (context === 'recharge') return 'courses';
  return null;
}

/**
 * The shape of a card code, as both backend DTOs accept it once trimmed and
 * upper-cased: 4–40 characters. The course DTO allows letters, digits and
 * dashes only; a code that fails this is refused here instead of spending one
 * of the student's rate-limited attempts on a certain 422.
 */
export function normalizeCardCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export type CardCodeProblem = 'required' | 'format' | null;

export function cardCodeProblem(normalized: string): CardCodeProblem {
  if (normalized.length === 0) return 'required';
  if (normalized.length < 4 || normalized.length > 40 || !/^[A-Z0-9-]+$/.test(normalized)) return 'format';
  return null;
}
