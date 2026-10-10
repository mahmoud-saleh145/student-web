/**
 * Which DRM system the current browser actually needs.
 *
 * The backend selects Widevine or FairPlay from this value:
 * `playback.service.ts` does `useFairPlay = platform === 'ios'` and hands that
 * branch a FairPlay licence URL plus the FairPlay certificate, otherwise a
 * Widevine licence URL.
 *
 * The player used to send a hardcoded `'web'`, so Safari always received a
 * Widevine licence URL. iOS has no Widevine CDM at all - it only implements
 * FairPlay - so the licence could never be served and playback failed with
 * REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE.
 *
 * WHY THIS IS SAFE TO TRUST FROM THE CLIENT
 *
 * `platform` picks a DRM system. It grants no entitlement: viewer
 * authorization, device binding, the account's DRM flag and rate limits are
 * all resolved server-side before this value is read. A client that lies about
 * its platform can at worst request a licence for a system its own browser
 * cannot decrypt.
 */

/** Mirrors the `@IsIn(['ios', 'android', 'web'])` guard on the ticket DTO. */
export type PlaybackPlatform = 'ios' | 'android' | 'web';

/** The slice of `navigator` this needs, so tests can supply their own. */
export type NavigatorLike = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
};

/**
 * Best-effort client platform.
 *
 * Defaults to the real `navigator`, and to `'web'` when there is none (SSR),
 * which keeps a server render from ever claiming FairPlay.
 */
export function detectPlaybackPlatform(
  nav: NavigatorLike | null = typeof navigator === 'undefined' ? null : navigator,
): PlaybackPlatform {
  if (!nav) return 'web';

  const userAgent = nav.userAgent ?? '';

  // iPadOS 13+ is desktop Safari by user agent: it reports platform
  // "MacIntel" but keeps multi-touch. That pairing is the only thing that
  // separates an iPad from a real Mac, and a real Mac has no touch points.
  const isIpadOs = nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;

  // Every browser on iOS is WebKit underneath and can do FairPlay, so this is
  // a platform test rather than a Safari test.
  if (isIpadOs || /iPad|iPhone|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';

  return 'web';
}