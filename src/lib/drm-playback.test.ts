import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDrmPlaybackTicket, type PlaybackRouteInput } from './drm-playback.ts';

const ticket = (over: Partial<PlaybackRouteInput> = {}): PlaybackRouteInput => ({
  manifestUrl: 'https://video.example/ws/asset/main.mpd',
  drm: { scheme: 'widevine', licenseUrl: 'https://widevine.example/licence/opaque' },
  ...over,
});

describe('isDrmPlaybackTicket', () => {
  it('routes Gumlet DRM over DASH to the DRM player', () => {
    assert.equal(isDrmPlaybackTicket(ticket()), true);
    assert.equal(
      isDrmPlaybackTicket(ticket({ manifestUrl: 'https://v.example/ws/a/main.mpd?x=1' })),
      true,
    );
  });

  it('routes Gumlet FairPlay over HLS to the DRM player', () => {
    // THE REGRESSION: iOS is served main.m3u8, and the old inline `.mpd` test
    // sent this ticket to a plain <video>, where Safari failed natively.
    assert.equal(
      isDrmPlaybackTicket(
        ticket({
          manifestUrl: 'https://v.example/ws/a/main.m3u8',
          drm: { scheme: 'fairplay', licenseUrl: 'https://fairplay.example/licence/opaque' },
        }),
      ),
      true,
    );
  });

  it('never routes a legacy AES-128 HLS lesson into the DRM player', () => {
    // drmBlock() can report scheme 'widevine' WITH a licence URL when
    // DRM_WIDEVINE_LICENSE_URL is configured. That lesson is HLS and not CENC,
    // so accepting any .m3u8 would be a real regression.
    assert.equal(
      isDrmPlaybackTicket(ticket({ manifestUrl: 'https://api.example/tickets/t_1/master.m3u8' })),
      false,
    );
  });

  it('refuses a ticket with no DRM or no licence', () => {
    assert.equal(isDrmPlaybackTicket(ticket({ drm: { scheme: 'none', licenseUrl: null } })), false);
    assert.equal(isDrmPlaybackTicket(ticket({ drm: { scheme: 'widevine', licenseUrl: null } })), false);
    assert.equal(isDrmPlaybackTicket(ticket({ drm: { scheme: 'fairplay', licenseUrl: null } })), false);
  });

  it('refuses a FairPlay scheme on anything that is not a recognised manifest', () => {
    // Defence in depth: never route to the DRM player without a manifest shape
    // Shaka can actually load.
    assert.equal(
      isDrmPlaybackTicket(
        ticket({ manifestUrl: 'https://v.example/ws/a/master', drm: { scheme: 'fairplay', licenseUrl: 'x' } }),
      ),
      false,
    );
  });

  it('handles a missing ticket', () => {
    assert.equal(isDrmPlaybackTicket(null), false);
    assert.equal(isDrmPlaybackTicket(undefined), false);
  });
});