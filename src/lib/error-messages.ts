/**
 * How an API failure becomes words on the screen.
 *
 * Mirrors the mobile app's `api/errors.ts`: a known code is shown through its
 * own translation, and anything else falls back by HTTP status. The backend's
 * raw `message` is never shown — it is English, written for developers, and
 * would put a sentence like "This course is not offered to your department"
 * in front of an Arabic-speaking student while the phone, given the same
 * response, shows a translated one.
 *
 * Pure and dependency-free so it is shared by every screen and tested on its
 * own; the caller says which translation keys exist.
 */

const STATUS_FALLBACK: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'VALIDATION_ERROR',
  410: 'ACCESS_EXPIRED',
  422: 'VALIDATION_ERROR',
  426: 'APP_UPDATE_REQUIRED',
  429: 'RATE_LIMITED',
  503: 'MAINTENANCE',
};

export function errorMessageKey(code: string, status: number, hasKey: (key: string) => boolean): string {
  const direct = `errors.${code}`;
  if (code && hasKey(direct)) return direct;

  const fallback = STATUS_FALLBACK[status] ?? (status >= 500 ? 'SERVER_ERROR' : null);
  if (fallback && hasKey(`errors.${fallback}`)) return `errors.${fallback}`;

  return 'errors.genericBody';
}

/**
 * Codes after which the session cannot continue and the student is sent back
 * to sign in. The same two the mobile client treats as session-ending; the
 * device-binding codes are deliberately not here — on the phone they leave the
 * student signed in and explain the device problem instead.
 */
export const SESSION_ENDING_CODES: ReadonlySet<string> = new Set(['SESSION_EXPIRED', 'ACCOUNT_DISABLED']);

export function endsSession(error: { code: string; status: number }): boolean {
  return error.status === 401 || SESSION_ENDING_CODES.has(error.code);
}
