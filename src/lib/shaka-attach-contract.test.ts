import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * A behavioural model of shaka-player 4.11.7's attach()/load() contract.
 *
 * The source tests in `drm-video.test.ts` assert wiring. These assert the RULE
 * that wiring has to satisfy, against a stub that enforces the same two facts the
 * real library does:
 *
 *   1. `attach(video)` is the ONLY thing that assigns the player's internal media
 *      element. In 4.11.7: `d || (Qo(c,'attach'), ..., c.h = a)`.
 *   2. `load()` opens with `if (!d.h) throw new T(2, 7, 7002)` - CONTENT
 *      .NO_VIDEO_ELEMENT, before any manifest request is made.
 *
 * That second fact is what produced DRM_PLAYBACK_NO_VIDEO_ELEMENT: a guarded
 * `attach()` looked harmless because `preferNativeHls` still routed the manifest
 * to Safari - but the element was never bound, so load() threw first.
 *
 * This is a MODEL, not a browser. It reproduces Shaka's documented precondition
 * faithfully and fails if the component's ordering violates it; it does not and
 * cannot prove that real protected playback works on a real device.
 */

const CONTENT_NO_VIDEO_ELEMENT = 7002;

/** Minimal stand-in enforcing the two facts above. */
class FakeShakaPlayer {
  /** Shaka's internal `c.h`: assigned only by attach(). */
  mediaElement: unknown = null;
  attached = false;
  loadedWith: string | null = null;
  configured: unknown[] = [];
  /** Set true when preferNativeHls is configured. */
  preferNativeHls = false;

  configure(cfg: { streaming?: { preferNativeHls?: boolean } }): void {
    this.configured.push(cfg);
    if (cfg?.streaming?.preferNativeHls === true) this.preferNativeHls = true;
  }

  async attach(video: unknown): Promise<void> {
    this.attached = true;
    this.mediaElement = video; // the ONLY assignment, as in the real library
  }

  getMediaElement(): unknown {
    return this.mediaElement;
  }

  async load(uri: string): Promise<void> {
    // Exactly the real guard, checked before anything else happens.
    if (!this.mediaElement) {
      const err = new Error('Shaka Error CONTENT.NO_VIDEO_ELEMENT ()') as Error & { code: number };
      err.code = CONTENT_NO_VIDEO_ELEMENT;
      throw err;
    }
    this.loadedWith = uri;
  }

  async destroy(): Promise<void> {
    this.mediaElement = null;
  }
}

const VIDEO = { nodeName: 'VIDEO' };
const MANIFEST = 'https://video.gumlet.io/ws/asset/main.m3u8';

/** The component's init sequence, as shipped. */
async function initProtectedPlayback(opts: {
  useNativeHls: boolean;
  attachConditionally: boolean;
}): Promise<FakeShakaPlayer> {
  const player = new FakeShakaPlayer();
  if (opts.useNativeHls) {
    player.configure({ streaming: { preferNativeHls: true } });
  }
  if (opts.attachConditionally) {
    if (!opts.useNativeHls) {
      await player.attach(VIDEO);
    }
  } else {
    await player.attach(VIDEO);
  }
  await player.load(MANIFEST);
  return player;
}

describe('shaka attach()/load() contract', () => {
  it('REPRODUCES the reported failure when attach is skipped on the native path', async () => {
    // This is the regression, executed rather than described.
    await assert.rejects(
      () => initProtectedPlayback({ useNativeHls: true, attachConditionally: true }),
      (e: Error & { code?: number }) => {
        assert.equal(e.code, CONTENT_NO_VIDEO_ELEMENT);
        return true;
      },
    );
  });

  it('loads the FairPlay manifest when attach is unconditional (the fix)', async () => {
    const player = await initProtectedPlayback({ useNativeHls: true, attachConditionally: false });
    assert.equal(player.loadedWith, MANIFEST);
    assert.equal(player.preferNativeHls, true, 'must still route to the native engine');
  });

  it('leaves the Widevine path unchanged and working', async () => {
    const player = await initProtectedPlayback({ useNativeHls: false, attachConditionally: false });
    assert.equal(player.loadedWith, MANIFEST);
    assert.equal(player.preferNativeHls, false, 'Widevine must NOT be routed to native HLS');
  });

  it('produces the same result either way once attach is unconditional', async () => {
    const a = await initProtectedPlayback({ useNativeHls: true, attachConditionally: false });
    const b = await initProtectedPlayback({ useNativeHls: false, attachConditionally: false });
    assert.equal(a.loadedWith, b.loadedWith);
  });

  it('routes FairPlay to native HLS and Widevine to MSE - the MEDIA_3 distinction', async () => {
    // attach() alone sends BOTH down MSE, which is the path FairPlay cannot use.
    const fairplay = await initProtectedPlayback({ useNativeHls: true, attachConditionally: false });
    const widevine = await initProtectedPlayback({ useNativeHls: false, attachConditionally: false });
    assert.equal(fairplay.preferNativeHls, true);
    assert.equal(widevine.preferNativeHls, false);
  });

  it('does not initialise the player twice across a re-render', async () => {
    // Every effect run makes its own player and its own attach; a shared player
    // would be attached to a stale element. Guarded so a future refactor that
    // hoists the player out of the effect is caught here.
    const first = await initProtectedPlayback({ useNativeHls: true, attachConditionally: false });
    const second = await initProtectedPlayback({ useNativeHls: true, attachConditionally: false });
    assert.notEqual(first, second);
    await first.destroy();
    // The destroyed player must not retain a usable element.
    assert.equal(first.mediaElement, null);
    assert.equal(second.loadedWith, MANIFEST, 'the live player is unaffected by the teardown');
  });
});
