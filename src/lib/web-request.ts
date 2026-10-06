/**
 * Marker header that every state-changing call from this app carries.
 *
 * A cross-site HTML form or a "simple" cross-origin fetch cannot set a custom
 * header, and a non-simple cross-origin fetch needs a CORS preflight that this
 * app never answers. So a POST that arrives with this header came from a page
 * served by this origin. The proxy has always required it; the auth routes
 * (sign-in, sign-up, sign-out) now do too, which closes login CSRF (an attacker
 * signing the victim into the attacker's account) and forced sign-out.
 *
 * Shared by client and server so the two sides cannot drift apart.
 */
export const WEB_REQUEST_HEADER = 'x-web-request';

export function hasWebRequestHeader(headers: Pick<Headers, 'get'>): boolean {
  return headers.get(WEB_REQUEST_HEADER) === '1';
}
