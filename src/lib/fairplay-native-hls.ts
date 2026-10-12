/**
 * Whether FairPlay must play through Safari's NATIVE HLS engine instead of Shaka.
 *
 * WHY THIS DECISION EXISTS
 *
 * Shaka Player does not support FairPlay through MSE (Media Source Extensions).
 * From the Shaka maintainer, on the `KEYFORMAT="com.apple.streamingkeydelivery"`
 * issue (shaka-project/shaka-player#2096):
 *
 *   "We only support FairPlay through native src= playback, we don't support it
 *    through MSE playback. If you don't pass the third argument to load, we'll
 *    default to using src= and it should work fine."
 *
 * That is the whole failure. Our component called `player.attach(video)` before
 * `player.load(...)`, and `attach()` is what puts the media element under Shaka's
 * control via MSE. So the one path Shaka supports for FairPlay was the one path
 * we disabled, on the one platform that has no alternative CDM.
 *
 * The symptom that resulted is NOT a licence error. The licence exchange
 * completes - Gumlet's licence URL is scoped by org and asset rather than by key
 * id, so it answers happily - and then the `cbcs` samples fail to decrypt. The
 * `<video>` element surfaces that as `MediaError.code === 3` (`MEDIA_ERR_DECODE`),
 * which is what was reported as `MEDIA_3`. Nothing in the trace pointed back at
 * the licence, which is exactly why the existing request/response filters and
 * `lib/fairplay.ts` fixes could never have caught it: they were all correct.
 *
 * WHY WIDEVINE IS UNAFFECTED
 *
 * Shaka does support Widevine through MSE, and Chrome/Edge/Android have no
 * native HLS DRM path worth using. This branch must therefore be narrow: it
 * engages ONLY for the FairPlay ticket, and everything else keeps the existing
 * MSE behaviour unchanged.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not disable DRM, expose an unprotected URL, or weaken any server-side
 * check. The native engine is given the SAME signed, entitlement-gated manifest
 * URL, and it performs the SAME EME/FairPlay exchange with the SAME licence
 * server and certificate. Only the local demux path changes.
 */

/** The slice of the ticket this decision reads. */
export type FairPlayRoutingInput = {
  /** The DRM scheme the backend selected for this device. */
  scheme: 'widevine' | 'fairplay' | 'none';
};

export const NATIVE_HLS_STAGE = 'FP_NATIVE_HLS';

/**
 * True when this ticket must be played by Safari's native engine.
 *
 * Keyed on `scheme === 'fairplay'` alone. That string is emitted by the backend
 * only from the Gumlet branch and only when the ticket asked for `ios`
 * (`playback.service.ts`: `useFairPlay = platform === 'ios'`), so it cannot be
 * produced by the legacy AES-128 path or by a client choosing its own value.
 */
export function needsNativeFairPlayHls(ticket: FairPlayRoutingInput | null | undefined): boolean {
  if (!ticket) return false;
  return ticket.scheme === 'fairplay';
}

/**
 * The Shaka configuration fragment for the two delivery modes.
 *
 * Exported so the rule is assertable without mounting a component, and so the
 * reason the flag exists sits next to the code that depends on it.
 */
export function streamingConfigForNativeHls(): { streaming: { preferNativeHls: boolean } } {
  return { streaming: { preferNativeHls: true } };
}
