/**
 * The activation portal's own address space.
 *
 * Everything the portal serves lives under `/activate` (pages) and
 * `/api/activate` (its backend-for-frontend). Nothing in here names a route of
 * the learning website, and nothing in the portal navigates to one: a visitor
 * without a portal session goes to `/activate/login`, never to `/login`.
 *
 * No imports, so the edge middleware can use it, and pure so it runs under
 * `node --test`.
 */

export const ACTIVATION_ROOT = '/activate';
export const ACTIVATION_LOGIN = '/activate/login';
export const ACTIVATION_API_ROOT = '/api/activate';

export const activationRoutes = {
  home: ACTIVATION_ROOT,
  login: ACTIVATION_LOGIN,
  courses: '/activate/courses',
  course: (courseId: string) => `/activate/courses/${encodeURIComponent(courseId)}`,
  library: '/activate/library',
  material: (materialId: string) => `/activate/library/${encodeURIComponent(materialId)}`,
  wallet: '/activate/wallet',
  myActivations: '/activate/my-activations',
  account: '/activate/account',
  success: '/activate/success',
} as const;

function clean(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** True for every page of the portal, and for nothing else (`/activated` is not one). */
export function isActivationPath(pathname: string): boolean {
  const path = clean(pathname);
  return path === ACTIVATION_ROOT || path.startsWith(`${ACTIVATION_ROOT}/`);
}

/** The one portal page a visitor without a portal session may open. */
export function isActivationPublicPage(pathname: string): boolean {
  return clean(pathname) === ACTIVATION_LOGIN;
}

/** A base that exists only to resolve a relative `next` against. */
const NEXT_BASE = 'http://portal.invalid';

/**
 * Where to go after signing in to the portal.
 *
 * Only a page of the portal itself is accepted. A `next` that points at the
 * learning website, at an API route or at another origin is dropped, so
 * signing in to the portal can never land a student in the player or the PDF
 * reader.
 */
export function safeActivationNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  // Backslashes and control characters are rewritten or dropped by a URL
  // parser, so what is checked below would not be what the browser follows.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;

  const written = raw.split(/[?#]/, 1)[0] ?? raw;
  if (written.includes('..') || /%2e|%2f|%5c/i.test(written)) return null;

  // Resolve it the way the browser will, and judge the result: `%2e%2e` is a
  // dot segment to a URL parser, so a literal check alone can be walked past.
  // A path the parser would change in any way is refused rather than repaired.
  let resolved: URL;
  try {
    resolved = new URL(raw, NEXT_BASE);
  } catch {
    return null;
  }
  if (resolved.origin !== NEXT_BASE || resolved.pathname !== written) return null;

  if (!isActivationPath(resolved.pathname) || isActivationPublicPage(resolved.pathname)) return null;
  return raw;
}
