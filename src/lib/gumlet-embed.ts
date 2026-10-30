/**
 * TEMPORARY playback hotfix: Gumlet's own embed player.
 *
 * When the backend is configured for it (GUMLET_WEB_EMBED_ENABLED) and the
 * request opted in (`delivery: 'embed'`, Apple FairPlay web clients only -
 * iPhone, iPad and macOS Safari; see `playbackTicketRequestBody`), a Gumlet
 * ticket also carries `embedUrl`: Gumlet's player page for the asset, with a
 * short-lived DRM token signed server-side after every access check passed.
 * Gumlet's player then does its own Widevine/FairPlay licensing - the path that
 * was observed working on iPhone Safari where our Shaka setup fails. macOS
 * Safari runs the same WebKit FairPlay stack, which is why the MacBook failure
 * (lib/playback-platform.ts) is routed through the same delivery.
 *
 * The URL is only accepted when it points exactly at Gumlet's embed player
 * over https. Anything else returns null and the page keeps its normal player,
 * so a malformed or unexpected value can never turn into an arbitrary iframe.
 *
 * Remove this file and its call site in app/player/[id]/page.tsx to revert.
 */

const GUMLET_EMBED_HOST = 'play.gumlet.io';

type TicketPlatform = 'ios' | 'android' | 'web';

/**
 * Body of the playback-ticket request.
 *
 * Only the FairPlay web platform - iOS / iPadOS, and Safari on macOS, which
 * `detectPlaybackPlatform` maps to the same `'ios'` key-system selector - opts
 * in to Gumlet's embed player (`delivery: 'embed'`): that is the flow where
 * our Shaka/FairPlay setup fails and Gumlet's player was observed working.
 * Every other platform sends exactly what it sent before. The opt-in is
 * explicit because `platform: 'ios'` alone is also what the native iOS app
 * sends, and the native app must not change.
 *
 * The backend still decides: it returns `embedUrl` only while
 * GUMLET_WEB_EMBED_ENABLED is on, so this opt-in is inert until then.
 */
export function playbackTicketRequestBody(platform: TicketPlatform): {
  platform: TicketPlatform;
  delivery?: 'embed';
} {
  return platform === 'ios' ? { platform, delivery: 'embed' } : { platform };
}

/**
 * True when the backend rejected the `delivery` field itself, i.e. a backend
 * that predates the hotfix (its DTO forbids unknown fields). The caller then
 * retries without the field, so deploying the web before the backend cannot
 * break iOS ticket requests.
 */
export function isRejectedDeliveryField(error: unknown): boolean {
  const e = error as { code?: unknown; errors?: Record<string, unknown> } | null | undefined;
  return (
    e?.code === 'VALIDATION_ERROR' &&
    !!e.errors &&
    Object.prototype.hasOwnProperty.call(e.errors, 'delivery')
  );
}

export function gumletEmbedSrc(
  ticket: { embedUrl?: string | null } | null | undefined,
): string | null {
  const raw = ticket?.embedUrl;
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== GUMLET_EMBED_HOST || url.port !== '') return null;
  if (url.username || url.password) return null;
  // Exactly /embed/<assetId>.
  if (!/^\/embed\/[A-Za-z0-9_-]+$/.test(url.pathname)) return null;
  // A DRM embed without its token cannot play; fall back to the normal player.
  if (!url.searchParams.get('token') || !url.searchParams.get('expires')) return null;

  return url.toString();
}
