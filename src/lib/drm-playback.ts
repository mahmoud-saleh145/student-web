/**
 * Which player a playback ticket must use.
 *
 * WHY THIS IS A FUNCTION AND NOT AN INLINE CONDITION
 *
 * It used to be an inline regex in the player page:
 *
 *     scheme !== 'none' && licenseUrl && /\.mpd(\?|$)/i.test(manifestUrl)
 *
 * The `.mpd` test was a proxy for "this is a Gumlet DRM asset", which was true
 * while DRM was DASH-only. FairPlay changed that: Gumlet publishes FairPlay for
 * HLS only, so an Apple client is now served `main.m3u8`. The proxy inverted,
 * and the ticket was routed to the plain <video> element instead of the DRM
 * player. Safari then failed natively, outside Shaka entirely - which is why the
 * failure produced a browser-level message rather than any Shaka error code.
 *
 * WHY THE EXTENSION ALONE MUST NOT BE TRUSTED
 *
 * The legacy AES-128 HLS path can report `scheme: 'widevine'` with a non-null
 * licence URL whenever `DRM_ENABLED` and `DRM_WIDEVINE_LICENSE_URL` are set
 * (see `drmBlock()` in playback.service.ts). Those lessons are served `.m3u8`.
 * So "scheme !== 'none' && licenceUrl" cannot identify DRM on its own, and
 * accepting any `.m3u8` would push every legacy lesson into a DRM player.
 *
 * `fairplay` is the discriminator that cannot collide: the backend emits it
 * only from the Gumlet branch, and only when the ticket asked for iOS.
 */

export type PlaybackRouteInput = {
  manifestUrl: string;
  drm: { scheme: 'widevine' | 'fairplay' | 'none'; licenseUrl: string | null };
};

const isDash = (url: string) => /\.mpd(\?|$)/i.test(url);
const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

export function isDrmPlaybackTicket(ticket: PlaybackRouteInput | null | undefined): boolean {
  if (!ticket) return false;

  const { scheme, licenseUrl } = ticket.drm;
  if (scheme === 'none' || !licenseUrl) return false;

  // Gumlet DRM on DASH: Chrome, Edge, Android.
  if (isDash(ticket.manifestUrl)) return true;

  // Gumlet FairPlay on HLS: iOS / iPadOS. FairPlay cannot be served over DASH
  // by Gumlet, so this is the only legitimate DRM-over-HLS shape.
  if (scheme === 'fairplay' && isHls(ticket.manifestUrl)) return true;

  // Anything else is a legacy, non-CENC lesson. hls.js / native HLS is correct.
  return false;
}