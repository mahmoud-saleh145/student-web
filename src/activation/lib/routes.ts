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

/**
 * Where to go after signing in to the portal.
 *
 * Only a page of the portal itself is accepted. A `next` that points at the
 * learning website, at an API route or at another origin is dropped, so
 * signing in to the portal can never land a student in the player or the PDF
 * reader.
 */
export function safeActivationNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const pathname = raw.split(/[?#]/, 1)[0] ?? raw;
  if (pathname.includes('..')) return null;
  if (!isActivationPath(pathname) || isActivationPublicPage(pathname)) return null;
  return raw;
}
