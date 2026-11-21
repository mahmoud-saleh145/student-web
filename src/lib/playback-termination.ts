import type { ApiErrorCode } from '../types/api.ts';

/**
 * Which error the player shows when the playback session stops.
 *
 * The server's `terminate.reason` is sometimes one of our error codes (an
 * expired ticket, the play limit, a refused device) and sometimes free text
 * (an admin's revocation note). Known codes get their own translated message;
 * anything else is shown as "not allowed to play", exactly as before.
 */
const KNOWN: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'PLAYBACK_DENIED',
  'PLAYBACK_TICKET_EXPIRED',
  'CONCURRENT_STREAM_LIMIT',
  'VIDEO_WATCH_LIMIT_REACHED',
  'CAPTURE_DETECTED',
  'VIDEO_NOT_READY',
  'VIDEO_UNAVAILABLE',
  'NOT_ENROLLED',
  'ACCESS_EXPIRED',
  'DEVICE_NOT_AUTHORIZED',
  'DEVICE_INTEGRITY_FAILED',
  'RATE_LIMITED',
  'SESSION_EXPIRED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NETWORK_OFFLINE',
  'NETWORK_TIMEOUT',
  'SERVER_UNREACHABLE',
  'SERVER_ERROR',
]);

export function terminationErrorCode(reason: string): ApiErrorCode {
  return KNOWN.has(reason as ApiErrorCode) ? (reason as ApiErrorCode) : 'PLAYBACK_DENIED';
}
