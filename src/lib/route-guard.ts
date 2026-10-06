/**
 * Which pages a visitor without a session may open.
 *
 * The mobile app wraps every signed-in screen in a protected navigator; a
 * student without a session cannot reach them at all. The web had no
 * equivalent: every page rendered, fired its requests, and showed an error
 * card for each 401. Signing in, signing up and asking for password help are
 * the only screens that make sense without a session.
 */
const PUBLIC_PAGES = ['/', '/login', '/register', '/password-help'];

export function isPublicPage(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PAGES.includes(clean);
}

/** Only internal paths are accepted as a post-login destination. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.startsWith('/api/') || isPublicPage(raw.split('?')[0] ?? raw)) return null;
  return raw;
}
