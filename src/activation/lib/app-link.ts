/**
 * The "Open Student Center" contract between the activation portal and the
 * mobile app.
 *
 * WHAT THE MOBILE APP DECLARES (read 2026-11-20, `edu-mobile-final`, unchanged)
 * ---------------------------------------------------------------------------
 *   - A custom URL scheme: `eduplatform` in the production variant
 *     (`app.config.ts` SCHEME, selected by `APP_VARIANT=production` in the
 *     EAS production profile); `eduplatform-stg` / `eduplatform-dev` otherwise.
 *   - Expo Router with a root route, so `eduplatform://` opens the app on its
 *     index gate, which sends a signed-in student to the tabs. The app's own
 *     session is untouched: nothing here signs anyone in or out.
 *   - No universal links (`ios.associatedDomains`), no Android App Links
 *     (`android.intentFilters` / `autoVerify`), and no store listing URL.
 *
 * That is what the SOURCE says. Whether an installed build answers the scheme
 * can only be seen on a phone, which is why the button never depends on it:
 * if the page is still in front a moment after the tap, the card shows how to
 * open the app by hand.
 *
 * THE LINK
 * --------
 * `eduplatform://` — the root, and nothing else. It is the built-in default,
 * so the button works without any configuration. `NEXT_PUBLIC_ACTIVATION_APP_URL`
 * can replace it (a universal link, later) or turn it off (`off`).
 *
 * WHAT MAY TRAVEL IN THE LINK
 * ---------------------------
 * Nothing. The built-in link is the bare scheme, with no path. No link — the
 * built-in one or a replacement — may carry a query string or a fragment: not
 * an access code, not a token, not a student or course id. Entitlements live on
 * the backend; the app re-reads them when it returns to the foreground. A link
 * that could carry data would be a place for a code or a credential to leak
 * into browser history, logs and other apps' intent handlers, so the parser
 * refuses one.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

export interface AppLinkConfig {
  /** Opens the installed app, or null when no link is configured. */
  openUrl: string | null;
  /** Store listings offered when the app does not open. Null when unknown. */
  androidStoreUrl: string | null;
  iosStoreUrl: string | null;
}

export const NO_APP_LINK: AppLinkConfig = { openUrl: null, androidStoreUrl: null, iosStoreUrl: null };

/** The production app's own scheme, at its root. See the header. */
export const DEFAULT_APP_OPEN_URL = 'eduplatform://';

/** Values of `NEXT_PUBLIC_ACTIVATION_APP_URL` that switch the link off. */
const LINK_OFF = /^(off|none|disabled|false|0)$/i;

const CUSTOM_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** Schemes that execute or embed content rather than open an app. */
const FORBIDDEN_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'http']);

/**
 * A link that opens the app: `https://…` (a universal / app link) or a custom
 * scheme such as `eduplatform://`. Anything carrying a query string, a
 * fragment or credentials is refused.
 */
export function safeAppOpenUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || !CUSTOM_SCHEME.test(value)) return null;
  if (/[?#@\s]/.test(value)) return null;

  const scheme = value.slice(0, value.indexOf(':')).toLowerCase();
  if (FORBIDDEN_SCHEMES.has(scheme)) return null;

  return value;
}

/**
 * The link the button opens.
 *
 *   unset / empty      → the built-in `eduplatform://`
 *   `off` (or `none`)  → no link: the card shows the manual steps
 *   anything else      → that link if it is safe, otherwise no link. A value
 *                        that fails the check is an operator's mistake, and
 *                        the manual steps are a safer answer to it than a
 *                        guess.
 */
export function resolveAppOpenUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return DEFAULT_APP_OPEN_URL;
  if (LINK_OFF.test(value)) return null;
  return safeAppOpenUrl(value);
}

/**
 * Is this a device the mobile app can be installed on?
 *
 * A custom scheme is only attempted on a phone or tablet. On a computer there
 * is no app to open, and some desktop browsers answer an unknown scheme by
 * replacing the page with an error — which would take the student away from
 * their receipt. iPadOS presents itself as desktop Safari, so touch points
 * are what tell it apart from a Mac.
 */
export function isPhoneOrTablet(userAgent: string, maxTouchPoints = 0): boolean {
  if (/android|iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Is the page inside another app's embedded browser?
 *
 * An embedded browser (an Android WebView, or the in-app browser of a chat or
 * social app) often does not hand an unknown scheme to the system: it loads it
 * as a page and shows an error in place of the portal. A real browser never
 * does that on a phone, so the scheme is attempted only there; in an embedded
 * browser the card shows the manual steps instead.
 *
 * `; wv)` is how an Android WebView identifies itself. The names are the
 * in-app browsers students are most likely to arrive from. A browser this
 * misses still has the page's own fallback behind it.
 */
export function isEmbeddedBrowser(userAgent: string): boolean {
  if (/;\s*wv\)/i.test(userAgent)) return true;
  return /\b(FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Telegram|WhatsApp|MicroMessenger)\b/i.test(userAgent);
}

const STORE_HOSTS: Readonly<Record<'android' | 'ios', readonly string[]>> = {
  android: ['play.google.com'],
  ios: ['apps.apple.com'],
};

/** A store listing on the store's own host, over https. */
export function safeStoreUrl(raw: string | null | undefined, store: 'android' | 'ios'): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return STORE_HOSTS[store].includes(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseAppLinkConfig(env: {
  openUrl?: string | null;
  androidStoreUrl?: string | null;
  iosStoreUrl?: string | null;
}): AppLinkConfig {
  return {
    openUrl: resolveAppOpenUrl(env.openUrl),
    androidStoreUrl: safeStoreUrl(env.androidStoreUrl, 'android'),
    iosStoreUrl: safeStoreUrl(env.iosStoreUrl, 'ios'),
  };
}

/**
 * The store link for the device in hand, if one is configured. A desktop
 * browser gets none: there is nothing to install there.
 */
export function storeUrlFor(config: AppLinkConfig, userAgent: string): string | null {
  if (/android/i.test(userAgent)) return config.androidStoreUrl;
  if (/iphone|ipad|ipod/i.test(userAgent)) return config.iosStoreUrl;
  return null;
}

/**
 * How long to wait before concluding the app did not open. A browser gives no
 * signal when a custom scheme has no handler; the page simply stays in front.
 * Long enough for the system's "Open in Student Center?" sheet to appear and
 * be answered on most phones; if it is still being read when this elapses, the
 * manual steps simply show underneath it.
 */
export const APP_OPEN_TIMEOUT_MS = 2500;
