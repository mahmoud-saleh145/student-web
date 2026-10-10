/**
 * Routes the student web app must never reach.
 *
 * `admin/` is the obvious one, but the backend mounts plenty of staff surface
 * outside that prefix. The backend's RolesGuard is authoritative and will deny
 * these regardless — blocking them here is defence in depth, and it turns "a
 * student token relayed into a staff endpoint" from a 403 in the logs into a
 * request that is never made. The read paths of `catalog/`, `subjects/` and
 * `search/` stay allowed on purpose: they are public browsing.
 */
export const BLOCKED_PREFIXES = [
  "auth/login",
  "auth/register",
  "auth/refresh",
  "auth/logout",
  "payments/webhooks",
  "admin",
  "analytics",
  "audit",
  "security-events",
  "sessions",
  "master",
  "storage/admin",
  "storage/internal",
  "users/admin",
  "enrollments/admin",
  "courses/admin",
  "notifications/broadcast",
  "notifications/announcements",
  "notifications/course",
];

export function isBlockedPath(pathStr: string): boolean {
  const normalized = pathStr.replace(/^\/+|\/+$/g, "");
  if (
    BLOCKED_PREFIXES.some(
      (p) => normalized === p || normalized.startsWith(p + "/"),
    )
  ) {
    return true;
  }
  // Prevent access to staff breakdown/export routes
  const segments = normalized.split("/");
  if (segments.includes("admin") || segments.includes("students")) {
    return true;
  }
  return false;
}

/**
 * Reads the proxy forwards without a session.
 *
 * Creating an account means choosing a university, faculty, department and
 * academic year — before the student has a token. The proxy refused every
 * tokenless request, so those four lists came back empty and the registration
 * form could not be completed at all. The backend serves them publicly and the
 * mobile app reads them before sign-in; the web was the only client that could
 * not.
 *
 * Exact shapes only, GET only. A prefix match on `catalog/` would quietly let
 * any future catalog route through without a session, and that should be a
 * decision someone makes, not a side effect of where a route happens to live.
 */
const PUBLIC_READ_PATHS: RegExp[] = [
  /^catalog\/universities$/,
  /^catalog\/universities\/[A-Za-z0-9_-]+\/faculties$/,
  /^catalog\/faculties\/[A-Za-z0-9_-]+\/departments$/,
  /^catalog\/academic-years$/,
  /*
    The registration screen's single academic call. It replaces the separate
    `academic-years` fetch there, because the label ("Year" or "Level") and the
    options have to come from the same resolution — asking for them separately
    and reconciling on the client is how a levels college ends up asking
    "Which year are you in?".

    Exact for the same reason as the rest of this list: no prefix match, so a
    future catalog route is not made public by accident.
  */
  /^catalog\/academic-selection$/,
];

export function isPublicReadPath(method: string, pathStr: string): boolean {
  if (method !== "GET") return false;
  const normalized = pathStr.replace(/^\/+|\/+$/g, "");
  return PUBLIC_READ_PATHS.some((rx) => rx.test(normalized));
}
