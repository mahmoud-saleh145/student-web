/**
 * The "Open Student Center" contract between the activation portal and the
 * mobile app.
 *
 * WHAT THE MOBILE APP SUPPORTS TODAY (audited 2026-11-20, `edu-mobile-final`)
 * --------------------------------------------------------------------------
 *   - A custom URL scheme only: `eduplatform` in the production variant
 *     (`app.config.ts` SCHEME), `eduplatform-stg` / `eduplatform-dev` otherwise.
 *   - No universal links (`ios.associatedDomains`), no Android App Links
 *     (`android.intentFilters` / `autoVerify`), no `assetlinks.json` or
 *     `apple-app-site-association` anywhere.
 *   - No inbound URL handling code. A URL that opens the app lands on the
 *     index gate, which sends a signed-in student to the tabs.
 *   - No store listing URL is recorded in the mobile repository.
 *
 * So nothing here is hard-coded. The portal opens the app only when an
 * operator sets `NEXT_PUBLIC_ACTIVATION_APP_URL`, and until then the button
 * explains how to return to the app by hand. That keeps an unverified scheme
 * out of production while leaving exactly one place to turn it on.
 *
 * WHAT MAY TRAVEL IN THE LINK
 * ---------------------------
 * Nothing. The link carries no query string and no fragment — not an access
 * code, not a token, not a course id. Entitlements live on the backend; the
 * app re-reads them when it returns to the foreground. A link that could carry
 * data would be a place for a code or a credential to leak into browser
 * history, logs and other apps' intent handlers, so the parser refuses one.
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
    openUrl: safeAppOpenUrl(env.openUrl),
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
 * signal when a custom scheme has no handler; the page simply stays visible.
 */
export const APP_OPEN_TIMEOUT_MS = 1800;
