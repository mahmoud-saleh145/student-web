/**
 * Turn a route the backend hands out into one this app actually serves.
 *
 * Search results and notifications carry a `route` written for the mobile
 * app, whose screens are `/course/:id` and `/lesson/:id`. The web names the
 * same pages `/courses/:id` and `/lessons/:id`, and was following the mobile
 * path verbatim — so every course and lesson a student found through search,
 * or tapped in a notification, opened a 404.
 *
 * Routes the web already serves under the same name pass through untouched.
 * Anything unrecognised resolves to the caller's fallback rather than being
 * pushed blind: a route the backend adds later should land somewhere sensible,
 * not on a missing page.
 */
const RENAMED: [RegExp, string][] = [
  [/^\/course\/([A-Za-z0-9_-]+)$/, '/courses/$1'],
  [/^\/lesson\/([A-Za-z0-9_-]+)$/, '/lessons/$1'],
];

const SERVED: RegExp[] = [
  /^\/courses\/[A-Za-z0-9_-]+$/,
  /^\/lessons\/[A-Za-z0-9_-]+$/,
  /^\/viewer\/[A-Za-z0-9_-]+$/,
  /^\/support\/[A-Za-z0-9_-]+$/,
  /^\/library\/[A-Za-z0-9_-]+$/,
  /^\/courses(\?.*)?$/,
  /^\/(home|my-courses|library|notifications|wallet|profile|support|settings)$/,
];

export function toWebRoute(route: string | null | undefined, fallback: string): string {
  if (!route || !route.startsWith('/') || route.startsWith('//')) return fallback;

  for (const [from, to] of RENAMED) {
    if (from.test(route)) return route.replace(from, to);
  }

  return SERVED.some((rx) => rx.test(route)) ? route : fallback;
}
