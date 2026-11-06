/**
 * Cache policy for the API proxy's own responses.
 *
 * Library answers are per student and change the moment the backend changes
 * its mind: a purchase, a revocation, an academic-scope change or the
 * storefront switch. The material view, My Library and every document ticket
 * (a short-lived signed URL) must therefore never be stored by the browser or
 * any shared cache, and a later read must always go back to the server.
 *
 * The Library pages themselves are already `private, no-cache, no-store`; the
 * JSON behind them used to carry no Cache-Control at all, which left the
 * decision to heuristics. This closes that gap for Library paths only — course
 * behaviour is unchanged.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

export const PROXY_NO_STORE = 'private, no-store';

/** Whether the proxied backend path is a Library path. */
export function isNoStoreProxyPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').split(/[?#]/, 1)[0]!.toLowerCase();
  return normalized === 'library' || normalized.startsWith('library/');
}

/**
 * Applies the cache policy to a proxy response, success or error alike: a
 * refusal must not be cached either, or a student could keep seeing "not
 * available" — or a stale answer — after the server has changed its mind.
 */
export function applyProxyCachePolicy(headers: Headers, path: string): void {
  if (isNoStoreProxyPath(path)) headers.set('Cache-Control', PROXY_NO_STORE);
}
