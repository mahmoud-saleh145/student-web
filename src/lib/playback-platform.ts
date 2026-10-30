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
 * THE SAME FAILURE ON A MAC
 *
 * `'ios'` on the wire means "an Apple WebKit client that implements FairPlay
 * and nothing else" - that is the only thing the backend reads from it. Safari
 * on macOS is exactly such a client: Gumlet's own compatibility table lists
 * Safari on macOS as FairPlay-only, with Widevine marked unsupported. Yet a
 * MacBook has no touch points and no `iPhone`/`iPad` token, so it was
 * classified `'web'`, handed a Widevine DASH ticket, and failed at
 * `requestMediaKeySystemAccess` before any licence was requested - the
 * `KS_NONE` + REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE signature. Routing macOS
 * Safari to the FairPlay ticket (and, through `playbackTicketRequestBody`, to
 * the same Gumlet embed delivery that fixed iPhone Safari) is the fix.
 *
 * Only Safari is routed that way. Unlike iOS, macOS lets Chrome, Edge, Firefox
 * and friends ship their own engines, and those carry a Widevine CDM, so they
 * keep the Widevine ticket. Whether that ticket then plays is a separate
 * question: Widevine on desktop Chromium/Gecko is software-only (L3), so a
 * `HW_SECURE_ALL` request cannot be satisfied there. `needsSafariOnMac` names
 * that case so the player can say so instead of "not permitted".
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
 * Browsers on macOS that bring their own engine (Blink or Gecko) rather than
 * the system WebKit. Every one of them keeps Safari's `Safari/` token in its
 * user agent, so the token alone proves nothing; these are what rule it out.
 * Brave, Arc, Vivaldi and other Chromium shells carry `Chrome/` and are
 * excluded by it.
 */
const NON_WEBKIT_MAC_BROWSER =
  /\b(?:Chrome|Chromium|CriOS|Edg|EdgA|EdgiOS|OPR|Opera|Firefox|FxiOS|Vivaldi|YaBrowser|SamsungBrowser|UCBrowser)\b/i;

/**
 * True for a real Mac: a Macintosh user agent (or `MacIntel` platform) without
 * the multi-touch that marks an iPad masquerading as desktop Safari.
 */
export function isMacOs(nav: NavigatorLike | null | undefined): boolean {
  if (!nav) return false;
  const userAgent = nav.userAgent ?? '';
  const looksMac = /\bMacintosh\b|\bMac OS X\b/i.test(userAgent) || nav.platform === 'MacIntel';
  if (!looksMac) return false;
  // iPadOS 13+ reports MacIntel and a Mac UA; only touch points separate it.
  if ((nav.maxTouchPoints ?? 0) > 1) return false;
  // Belt and braces: a UA that names an iPhone/iPad/iPod is never a Mac.
  return !/\b(?:iPad|iPhone|iPod)\b/i.test(userAgent);
}

/**
 * True for Safari itself on macOS - the WebKit engine Apple ships, which is the
 * only macOS browser with a FairPlay CDM.
 *
 * `Version/x` is the token Safari emits and Chromium/Gecko browsers never do;
 * `Safari/` is required too, and every known non-WebKit shell is excluded by
 * name. A WebKit-based third-party browser without its own token (rare) is
 * classified Safari, which is the right DRM choice for it anyway.
 */
export function isMacSafari(nav: NavigatorLike | null | undefined): boolean {
  if (!isMacOs(nav)) return false;
  const userAgent = nav?.userAgent ?? '';
  return (
    /\bSafari\/\d/.test(userAgent) &&
    /\bVersion\/\d/.test(userAgent) &&
    !NON_WEBKIT_MAC_BROWSER.test(userAgent)
  );
}

/**
 * True when the viewer is on a Mac in a browser that cannot play this
 * platform's DRM at all: Chrome, Edge, Firefox and the other non-Safari
 * browsers on macOS only implement software Widevine (L3), and the player
 * requests hardware-secure decoding without fallback. The one browser on a
 * Mac that can play is Safari, through FairPlay.
 *
 * This is a MESSAGE decision only. It changes nothing about which ticket is
 * requested or how DRM is configured.
 */
export function needsSafariOnMac(nav: NavigatorLike | null | undefined): boolean {
  return isMacOs(nav) && !isMacSafari(nav);
}

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

  // Safari on macOS implements FairPlay and no Widevine, exactly like iOS, so
  // it must receive the FairPlay (HLS) ticket. `'ios'` is the backend's name
  // for that key system, not a claim about the device. Other macOS browsers
  // have their own Widevine CDM and stay on the Widevine ticket.
  if (isMacSafari(nav)) return 'ios';

  return 'web';
}
