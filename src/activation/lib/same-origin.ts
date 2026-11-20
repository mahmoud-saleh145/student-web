/**
 * Whether a state-changing request came from a page of this site.
 *
 * The portal's write routes (sign-in, sign-out, redeem, purchase, recharge)
 * already require the `x-web-request` marker header, which a cross-site form
 * cannot set and a cross-site fetch cannot send without a preflight this app
 * never answers. This is the second, independent check: what the browser
 * itself says about where the request started.
 *
 *   - `Sec-Fetch-Site`, when present, must be `same-origin`. Browsers set it
 *     and page scripts cannot forge it.
 *   - Otherwise `Origin`, when present, must name this host (or the configured
 *     `APP_ORIGIN`).
 *   - A request with neither header did not come from a browser page, so
 *     there is no victim's browser to ride on; the marker header still applies.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */
export function isSameOriginRequest(
  headers: { get(name: string): string | null },
  appOrigin?: string | null,
): boolean {
  const site = headers.get('sec-fetch-site');
  if (site) return site.toLowerCase() === 'same-origin';

  const origin = headers.get('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const allowed = new Set<string>();
  for (const name of ['x-forwarded-host', 'host']) {
    const value = headers.get(name)?.split(',')[0]?.trim().toLowerCase();
    if (value) allowed.add(value);
  }
  if (appOrigin) {
    try {
      allowed.add(new URL(appOrigin).host.toLowerCase());
    } catch {
      // An unparseable APP_ORIGIN allows nothing extra.
    }
  }

  return allowed.has(originHost);
}
