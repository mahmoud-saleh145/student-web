/**
 * TEMPORARY playback hotfix: Gumlet's own embed player.
 *
 * When the backend is configured for it (GUMLET_WEB_EMBED_ENABLED) and the
 * request opted in (`delivery: 'embed'`, iOS web only - see
 * `playbackTicketRequestBody`), a Gumlet ticket also carries `embedUrl`:
 * Gumlet's player page for the asset, with a
 * short-lived DRM token signed server-side after every access check passed.
 * Gumlet's player then does its own Widevine/FairPlay licensing - the path that
 * was observed working on iPhone Safari where our Shaka setup fails.
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
 * PREVIEW EXPERIMENT ONLY (Huawei DRM diagnosis): a manual `?gumletEmbed=1`
 * on the player URL extends the same embed flow to non-iOS platforms. The flag
 * is read from the real location at ticket-request time and never inferred
 * from the user agent, so its absence leaves every request byte-identical to
 * today. The backend still decides - it returns `embedUrl` only while
 * GUMLET_WEB_EMBED_ENABLED is on and the asset is Gumlet-backed - and
 * `gumletEmbedSrc()` still validates whatever comes back. Remove this helper,
 * the option on the body builder and the page call site to revert.
 */
export function gumletEmbedExperimentRequested(search: string): boolean {
  return new URLSearchParams(search).get('gumletEmbed') === '1';
}

/**
 * Body of the playback-ticket request.
 *
 * iOS / iPadOS web playback always opts in to Gumlet's embed player
 * (`delivery: 'embed'`): that is the flow where our Shaka/FairPlay setup fails
 * and Gumlet's player was observed working. Every other platform sends exactly
 * what it sent before unless the manual preview experiment
 * (`gumletEmbedExperimentRequested`) is on. The opt-in is explicit because
 * `platform: 'ios'` alone is also what the native iOS app sends, and the
 * native app must not change.
 *
 * The backend still decides: it returns `embedUrl` only while
 * GUMLET_WEB_EMBED_ENABLED is on, so this opt-in is inert until then.
 */
export function playbackTicketRequestBody(
  platform: TicketPlatform,
  opts?: { embedExperiment?: boolean },
): {
  platform: TicketPlatform;
  delivery?: 'embed';
} {
  if (platform === 'ios') return { platform, delivery: 'embed' };
  return opts?.embedExperiment ? { platform, delivery: 'embed' } : { platform };
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
