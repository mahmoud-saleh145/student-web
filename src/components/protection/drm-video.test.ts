import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');

const DrmVideo = read('./DrmVideo.tsx');
const shakaTypes = read('../../types/shaka-player.d.ts');

/** Strips comments so assertions target code rather than explanatory prose. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const code = stripComments(DrmVideo);

/**
 * Regression guard for the Shaka module/global mismatch.
 *
 * shaka-player's UMD wrapper assigns `window.shaka` only on its third branch --
 * the one reached when no module system is present. Under Next.js/webpack
 * `exports` is always in scope, so the first branch wins, the module's exports
 * are populated, and `window.shaka` stays permanently undefined. The component
 * used to read that global and bail out at the "failed to initialise" guard
 * before it ever built a player or requested the manifest, so no DRM playback
 * was possible on any student device.
 *
 * These assertions are static because the failure is a wiring mismatch in the
 * module graph; nothing observable changes at runtime in this repo's plain
 * `node --test` environment.
 */
describe('DrmVideo Shaka wiring', () => {
  it('imports shaka-player as a namespace, not a discarded side-effect import', () => {
    assert.match(DrmVideo, /import \* as shaka from 'shaka-player';/);
    assert.doesNotMatch(DrmVideo, /^import 'shaka-player';$/m);
  });

  it('never reads the shaka global', () => {
    assert.doesNotMatch(code, /window\.shaka/);
    assert.doesNotMatch(code, /globalThis\.shaka/);
    assert.doesNotMatch(code, /ShakaLike/);
  });

  it('declares the module boundary shaka-player omits from its own typings', () => {
    // Without this declaration `import * as shaka from 'shaka-player'` is TS2306.
    assert.match(shakaTypes, /declare module 'shaka-player'/);
    assert.match(shakaTypes, /export = shaka;/);
  });

  it('keeps the DRM settings intact', () => {
    // Requested robustness must not be weakened to make playback "work".
    assert.match(DrmVideo, /videoRobustness: \['HW_SECURE_ALL'\]/);
    assert.match(DrmVideo, /audioRobustness: \['HW_SECURE_ALL'\]/);
    // No software-only fallback may be reintroduced.
    assert.doesNotMatch(DrmVideo, /'SW_SECURE_CRYPTO'/);
  });

  it('never references the absent shaka.drm namespace or gumlet helper', () => {
    // Shaka 4.11.7 exports no `drm` namespace and no `gumletFairPlayRequest`,
    // so both of these silently disabled the FairPlay filters.
    assert.doesNotMatch(code, /shaka\.drm/);
    assert.doesNotMatch(code, /gumletFairPlayRequest/);
    assert.doesNotMatch(code, /commonFairPlayResponse/);
  });

  it('registers the FairPlay filters through the networking engine', () => {
    assert.match(code, /registerRequestFilter/);
    assert.match(code, /registerResponseFilter/);
    // The certificate must be configured through the nested `advanced` object,
    // not a '.'-separated configure() path, which splits the key system name.
    assert.doesNotMatch(code, /configure\(`drm\.advanced\./);
    assert.match(code, /serverCertificateUri/);
  });

  it('configures the init-data transform on FairPlay only', () => {
    // Shaka's default transform guards on initDataType === 'skd', which
    // Gumlet's HLS never produces: the parser emits 'sinf' with an empty
    // buffer and puts the skd:// URI on drmInfo.keySystemUris. FairPlay
    // therefore needs ours; Widevine must keep Shaka's default untouched.
    assert.match(code, /initDataTransform/);
    assert.match(code, /createFairPlayInitDataTransform/);
    assert.match(code, /FairPlayUtils\.initDataTransform/);

    // Prove the transform sits inside the isFairPlay guard rather than in the
    // shared config, so no Widevine ticket can ever pick it up. Positional,
    // not a regex over formatting: the config KEY must appear exactly once,
    // and only after the isFairPlay spread opens. (The other textual hits are
    // the shaka.util.FairPlayUtils call it wraps.)
    const keys = code.match(/\n\s*initDataTransform:/g) ?? [];
    assert.equal(keys.length, 1);
    const guard = code.indexOf('...(isFairPlay');
    assert.ok(guard > -1, 'expected the isFairPlay guard');
    assert.ok(code.indexOf('initDataTransform:') > guard);
  });

  it('delegates the legacy-vs-modern decision to the tested helper', () => {
    // The MEDIA_3 guard used to be an inline `if` here, covered only by the
    // source-text match that sat at this spot - which would have stayed green if
    // the `if` were deleted and the comment kept. The decision now lives in
    // `lib/fairplay.ts` as `shouldTransformFairPlayInitData`, behaviourally
    // tested in fairplay.test.ts.
    //
    // What is asserted HERE is only the wiring: the component marks the trace
    // token and delegates, and no longer carries its own copy of the rule.
    assert.match(code, /createFairPlayInitDataTransform/);
    assert.match(code, /fairPlayTransform\(initData, initDataType, drmInfo\)/);

    // No second, divergent copy of the legacy-type check in this component.
    assert.doesNotMatch(code, /initDataType\s*!==\s*FAIRPLAY_LEGACY_INIT_DATA_TYPE/);
    assert.doesNotMatch(code, /initDataType\s*===\s*FAIRPLAY_LEGACY_INIT_DATA_TYPE/);

    // The trace token must still record which init-data type actually arrived.
    assert.match(code, /IDT_\$\{initDataType/);
  });

  it('configures both FairPlay key-system names', () => {
    // Safari negotiates com.apple.fps (Modern EME) or com.apple.fps.1_0
    // (legacy Apple Media Keys) depending on the device. Which one applies is
    // not knowable ahead of a real device, so both carry a licence server.
    assert.match(code, /com\.apple\.fps/);
    assert.match(code, /com\.apple\.fps\.1_0/);
  });

  it('reports a sanitised stage code rather than a raw error message', () => {
    // The reason string is the ONLY DRM telemetry the player produces, so it
    // must be a stable code. It must never carry a URL, token or payload.
    assert.match(code, /onError\?\.\(/);
    assert.match(code, /DRM_FAIRPLAY_/);
    assert.match(code, /fairPlayStageFromMessage/);
  });

  it('shows the stage code on screen, not only in the console', () => {
  // A student on a phone has no devtools. A code that exists only in the
  // console is a code nobody can report back.
  assert.match(code, /data-drm-stage=\{stage\}/);
  assert.match(code, /setStage\(/);
  // Codes are fixed tokens for every early exit too, not just Shaka errors.
  for (const s of ['FP_NO_LICENSE', 'FP_NO_MANIFEST', 'BROWSER_UNSUPPORTED']) {
    assert.match(code, new RegExp(s));
  }
});

it('traces the stages reached so a licence failure is separable', () => {
  // A single error code cannot say whether the licence was ever requested.
  assert.match(code, /data-drm-trace=\{trace\.join\('>'\)\}/);
  for (const t of ['MANIFEST', 'LIC_REQ', 'LIC_RES', 'LOADED', 'MEDIA_']) {
    assert.ok(code.includes(t), `missing trace token ${t}`);
  }
  // The Widevine branch observes the same stages without touching payloads.
  assert.match(code, /registerRequestFilter\(\(type\) => \{/);
});

it('still refuses to play without a licence or a manifest', () => {
    assert.match(DrmVideo, /if \(drm\.scheme === 'none' \|\| !drm\.licenseUrl\)/);
    assert.match(DrmVideo, /if \(!manifestUrl\)/);
  });

  it('never attaches MSE on the FairPlay path - that is the MEDIA_3 regression', () => {
    // `player.attach()` moves the media element under Media Source Extensions
    // control. Shaka supports FairPlay ONLY through native `src=` playback, so
    // calling attach() unconditionally disabled the only supported FairPlay path
    // on the only platform with no alternative CDM. The symptom was a DECODE
    // failure (MediaError.code 3) AFTER a successful licence exchange.
    //
    // This asserts the ordering rather than the presence of attach(): attach()
    // must exist for the Widevine path, and must be unreachable for FairPlay.
    const usesNativeFlag = /const useNativeHls\s*=\s*needsNativeFairPlayHls/.test(code);
    assert.ok(
      usesNativeFlag,
      'component must derive the native-HLS decision from the tested helper',
    );

    const guardedAttach = /if\s*\(\s*!useNativeHls\s*\)\s*\{\s*await player\.attach\(video\);\s*\}/.test(
      code,
    );
    assert.ok(
      guardedAttach,
      'player.attach() must be guarded by !useNativeHls; an unconditional attach is the MEDIA_3 cause',
    );

    // The helper must be consulted, not a hardcoded 'ios' check.
    assert.match(code, /needsNativeFairPlayHls/);
    assert.doesNotMatch(code, /userAgent|navigator\.platform/);
  });

  it('configures preferNativeHls so Shaka hands HLS to Safari', () => {
    assert.match(code, /streamingConfigForNativeHls\(\)/);
    assert.match(code, /player\.configure\(streamingConfigForNativeHls\(\)\)/);
  });

  it('keeps both FairPlay key systems and the certificate on the native path', () => {
    // Native playback still needs a licence server and a certificate: the EME
    // exchange is unchanged, only the demux path differs. Losing either here
    // would reintroduce a licence failure instead of fixing the decode one.
    assert.match(code, /\[fairplay\]:\s*drm\.licenseUrl/);
    assert.match(code, /serverCertificateUri:\s*drm\.certificateUrl/);
  });

  it('does not weaken DRM on the native path', () => {
    // No fallback to an unprotected source, no licence bypass.
    assert.doesNotMatch(code, /drmOnly|allowUnencrypted|skipDrm/);
    // The manifest URL is still the signed one from the ticket.
    assert.match(code, /player\.load\(manifestUrl\)/);
  });

  it('wires media events from the real element when there is no MSE attachment', () => {
    // getMediaElement() resolves only an attached element; on the native path
    // it would be null and playback telemetry would silently stop on iOS.
    assert.match(code, /useNativeHls\s*\?\s*video\s*:\s*\(player\.getMediaElement\(\)/);
  });

  it('skips addTextTrackAsync on the native path where it cannot exist', () => {
    assert.match(code, /!useNativeHls\s*&&\s*captionsEnabled/);
  });

  it('keeps the existing cleanup safe for an unattached player', () => {
    assert.match(code, /destroy\(\)\.catch\(\(\)\s*=>\s*undefined\)/);
  });

  it('destroys the player on cleanup', () => {
    assert.match(DrmVideo, /playerRef\.current\.destroy\(\)/);
  });
});