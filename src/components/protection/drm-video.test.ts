import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { streamingConfigForNativeHls } from '../../lib/fairplay-native-hls.ts';

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
    // FairPlay wraps Shaka's own default for the trace; Widevine never gets a
    // transform. The config KEY must appear exactly once, inside the FairPlay
    // spread, so no Widevine ticket can pick it up.
    const keys = code.match(/\n\s*initDataTransform:/g) ?? [];
    assert.equal(keys.length, 1);
    const guard = code.indexOf('...(isFairPlay && shakaDefaultInitDataTransform');
    assert.ok(guard > -1, 'expected the FairPlay guard around the transform');
    assert.ok(code.indexOf('initDataTransform:') > guard);
  });

  it("delegates FairPlay init data to Shaka's own default transform", () => {
    // Real-iPhone trace 2026-10-12: ENC_skd > IDT_skd > ERR_FP_NO_SKD_URI, no
    // licence request. The old transform read drmInfo.keySystemUris, which
    // Shaka never sets on the native src= route, and rebuilt Modern EME init
    // data that Shaka itself passes through untouched. The component must read
    // Shaka's default BEFORE configuring, and wrap - not replace - it.
    const captured = code.indexOf(
      'const shakaDefaultInitDataTransform = player.getConfiguration().drm.initDataTransform;',
    );
    assert.ok(captured > -1, "Shaka's default must be read from the player");
    assert.ok(
      captured < code.indexOf('initDataTransform: traceInitDataTransform('),
      'the default must be captured before our override is installed',
    );
    assert.match(code, /initDataTransform: traceInitDataTransform\(shakaDefaultInitDataTransform,/);

    // No custom rebuild, and nothing that depends on keySystemUris, may return.
    assert.doesNotMatch(code, /FairPlayUtils\.initDataTransform/);
    assert.doesNotMatch(code, /createFairPlayInitDataTransform/);
    assert.doesNotMatch(code, /keySystemUris/);
    assert.doesNotMatch(code, /shakaMediaKeysPolyfill/, 'the polyfill check belongs to Shaka');

    // The trace token must still record which init-data type actually arrived.
    assert.match(code, /IDT_\$\{initDataType/);
  });

  it('configures the FairPlay key systems from the tested helper', () => {
    // The list (default: com.apple.fps then com.apple.fps.1_0) lives in
    // lib/drm-diagnostics.ts and is behaviourally tested there; the component
    // must use that list for servers, preference order AND certificates.
    assert.match(code, /const fairPlayKeySystemList = fairPlayKeySystems\(diag\);/);
    assert.match(code, /preferredKeySystems: fairPlayKeySystemList/);
    assert.match(code, /fairPlayKeySystemList\.map\(\(ks\) => \[ks, drm\.licenseUrl\]\)/);
    assert.match(code, /fairPlayKeySystemList\.map\(\(ks\) => \[ks, \{ serverCertificateUri: drm\.certificateUrl \}\]\)/);
  });

  it('reads the diagnostic flags on the FairPlay branch only', () => {
    // Widevine tickets must never read the query-string experiments.
    assert.match(
      code,
      /const diag = isFairPlay\s*\?\s*parseFairPlayDiagFlags\([\s\S]{0,80}window\.location\.search\)\s*:\s*DEFAULT_FAIRPLAY_DIAG_FLAGS;/,
    );
    // fpcors=0 only removes the attribute, inside the FairPlay guard.
    assert.match(
      code,
      /if \(isFairPlay\) \{\s*for \(const token of fairPlayConfigTokens\(diag\)\) mark\(token\);\s*if \(diag\.omitCrossOrigin\) video\.removeAttribute\('crossorigin'\);\s*\}/,
      'config tokens and the crossorigin experiment must sit inside the FairPlay guard',
    );
    // The element still defaults to crossOrigin="anonymous" - no flag, no change.
    assert.match(code, /crossOrigin="anonymous"/);
  });

  it('reports a sanitised stage code rather than a raw error message', () => {
    // The reason string is the ONLY DRM telemetry the player produces, so it
    // must be a stable code. It must never carry a URL, token or payload.
    assert.match(code, /onError\?\.\(/);
    assert.match(code, /DRM_FAIRPLAY_/);
    // Both error paths must read the stage from the WHOLE detail, not just
    // `message`: Shaka hardcodes `message` to 'Shaka Error <code>' and keeps
    // the thrown text in `data[0]`, so reading only `message` reported the
    // generic INIT_DATA_TRANSFORM_ERROR instead of the guard that threw.
    assert.match(code, /fairPlayStageFromErrorDetail/);
    assert.doesNotMatch(
      code,
      /fairPlayStageFromMessage\(/,
      'reading only detail.message loses the stage entirely',
    );

    // Both the error event and the load() rejection must use it.
    const handler = code.slice(code.indexOf("addEventListener('error'"));
    assert.match(handler.slice(0, 2000), /fairPlayStageFromErrorDetail\(detail\)/);
    const catchBlock = code.slice(code.indexOf('} catch (e) {'));
    assert.match(catchBlock.slice(0, 2000), /fairPlayStageFromErrorDetail\(/);
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
  assert.match(code, /data-drm-trace=\{formatTrace\(trace, '>'\)\}/);
  for (const t of ['MANIFEST', 'LIC_REQ', 'LIC_RES', 'LOADED', 'MEDIA_']) {
    assert.ok(code.includes(t), `missing trace token ${t}`);
  }
  // Timestamped and counted (lib/drm-diagnostics.ts), with the clock reset at
  // the start of each player effect.
  assert.match(code, /setTrace\(\(prev\) => appendTraceEvent\(prev, token, atMs\)\)/);
  assert.match(code, /traceStartRef\.current = performance\.now\(\);\s*setTrace\(\[\]\);/);
  // The Widevine branch observes the same stages without touching payloads.
  assert.match(code, /registerRequestFilter\(\(type\) => \{/);
});

it('still refuses to play without a licence or a manifest', () => {
    assert.match(DrmVideo, /if \(drm\.scheme === 'none' \|\| !drm\.licenseUrl\)/);
    assert.match(DrmVideo, /if \(!manifestUrl\)/);
  });

  it('ALWAYS attaches the media element, including on the native FairPlay path', () => {
    // This is the DRM_PLAYBACK_NO_VIDEO_ELEMENT regression.
    //
    // In shaka-player 4.11.7 the player's internal media element (`c.h`) is
    // assigned ONLY inside attach(), and `load()` opens with
    // `if (!d.h) throw new T(2, 7, 7002)` - CONTENT.NO_VIDEO_ELEMENT. So an
    // unguarded-by-opposite `attach()` is not "switching MSE on": skipping it
    // makes EVERY load() throw before a single manifest request is made.
    //
    // attach() must therefore be unconditional. `preferNativeHls` is what routes
    // the load to Safari's native engine instead of MSE.
    const guardedAttach = /if\s*\(\s*!useNativeHls\s*\)\s*\{[^}]*player\.attach\(video\)/.test(code);
    assert.ok(
      !guardedAttach,
      'player.attach() must NOT be conditional on useNativeHls: Shaka load() throws CONTENT.NO_VIDEO_ELEMENT (7002) without it',
    );

    // Present, and not inside any conditional.
    assert.match(code, /await player\.attach\(video\)/);
  });

  it('configures preferNativeHls so Shaka hands HLS to Safari rather than MSE', () => {
    // Shaka does not support FairPlay through MSE at all
    // (shaka-project/shaka-player#2096). preferNativeHls is what routes
    // the load to Safari's native engine instead of MSE.
    assert.match(code, /streamingConfigForNativeHls\(\)/);
    assert.match(code, /player\.configure\(streamingConfigForNativeHls\(\)\)/);
    // And it is set on the native path specifically.
    assert.match(code, /if\s*\(useNativeHls\)\s*\{\s*mark\('NATIVE_HLS'\);\s*player\.configure/);
  });

  it('sets useNativeHlsForFairPlay, the flag Shaka 4.11.7 actually reads', () => {
    // Regression guard. Shaka picks the engine with
    //   isApple() && fpsServers ? streaming.useNativeHlsForFairPlay
    //                             : streaming.preferNativeHls
    // and we DO configure com.apple.fps servers, so preferNativeHls is dead
    // code for this ticket. Without this flag the previous fix changed nothing
    // and FairPlay stayed on MSE, producing MEDIA_3 again.
    const { streaming } = streamingConfigForNativeHls();
    assert.equal(streaming.useNativeHlsForFairPlay, true);
    assert.match(code, /player\.configure\(streamingConfigForNativeHls\(\)\)/);
  });

  it('reports which engine Shaka actually selected', () => {
    // Native-vs-MSE is not purely configuration: Shaka also falls back to MSE
    // when the manifest Content-Type is not HLS. Reading video.mediaSource is
    // the only direct observation, and it is what turns "MEDIA_3 happened"
    // into "FairPlay was decoded over MSE".
    assert.match(code, /const markRoute = React\.useCallback\(\(\) => \{/);
    assert.match(code, /mediaSource \? 'ROUTE_MSE' : 'ROUTE_NATIVE'/);

    // Both call sites, not merely the presence of the tokens. A run that fails
    // before LOADED has no other route evidence, so the error path matters most.
    assert.match(
      code,
      /mark\('LOADED'\);\s*markRoute\(\);/,
      'route must be recorded after a successful load',
    );
    const errorHandler = code.slice(code.indexOf("addEventListener('error'"));
    assert.match(
      errorHandler.slice(0, 2400),
      /markRoute\(\);/,
      'route must be recorded on the failure path too',
    );
  });

  it('disables in-band PSSH parsing on the FAIRPLAY path only', () => {
    // THE fix for MEDIA_3. Gumlet's HLS carries two #EXT-X-KEY lines: a
    // Widevine CENC PSSH (data: URI, urn:uuid:edef8ba9) and the FairPlay
    // skd:// entry. Shaka registers its `encrypted`-event handler - the only
    // route to the skd:// init data - only when in-band PSSH parsing is off:
    //
    //   if (!initData.length && !queued && !parseInbandPsshEnabled) {...}
    //
    // With it on, Shaka requests a licence for the Widevine PSSH instead, the
    // Apple CDM never gets a FairPlay content id, and the track fails to
    // decrypt (MediaError.code 3).
    assert.match(
      code,
      /isFairPlay \? \{ parseInbandPsshEnabled: false \} : \{\}/,
      'FairPlay must disable parseInbandPsshEnabled',
    );

    // It must stay scoped. Widevine DASH REQUIRES in-band PSSH; disabling it
    // globally would silently break every Chrome/Edge/Android video.
    const globalCount = (code.match(/parseInbandPsshEnabled\s*:\s*false/g) ?? []).length;
    assert.equal(globalCount, 1, 'exactly one site may disable it, and it must be conditional');
    assert.doesNotMatch(
      code,
      /drm:\s*\{\s*parseInbandPsshEnabled/,
      'parseInbandPsshEnabled must never be set unconditionally at the drm root',
    );
  });

  it('names the FairPlay key systems so the PSSH cannot win the session', () => {
    // The deployed `parseInbandPsshEnabled: false` did NOT fix this, and the
    // device trace proved why: `ENC_skd` fired without `IDT_*`. Stopping
    // in-band parsing is necessary but not sufficient - the manifest still
    // advertises a PSSH-bearing Widevine DrmInfo on the same stream, and
    // `fixDrmInfo` never removes a key system we serve no licence URL for.
    //
    // `chooseDecodingInfo(tracks, current, drm.preferredKeySystems)` is what
    // picks the session's DrmInfo, so naming the key systems we actually serve
    // is the control that matters.
    assert.match(
      code,
      /preferredKeySystems: fairPlayKeySystemList/,
      'FairPlay must name the FairPlay key systems it serves',
    );
    assert.match(
      code,
      /\?\s*\{\s*preferredKeySystems:\s*fairPlayKeySystemList\s*\}\s*:\s*\{\}/,
      'preferredKeySystems must be scoped to the FairPlay branch',
    );

    // Scoped: Widevine must keep its default ordering or DASH breaks, since a
    // Widevine ticket has no FairPlay entry and lives entirely off the PSSH.
    const sites = (code.match(/preferredKeySystems/g) ?? []).length;
    assert.equal(sites, 1, 'preferredKeySystems must be set in exactly one place');
    assert.doesNotMatch(
      code,
      /preferredKeySystems:\s*\[\s*\]/,
      'must never override the preference on the non-FairPlay path',
    );
  });

  it('keeps the two FairPlay fixes independent, neither alone is sufficient', () => {
    // Guards against "one of these must be enough" reasoning creeping back in:
    // in-band parsing off removes the *runtime* PSSH source, naming the key
    // systems removes the *manifest* one. Both are needed.
    assert.match(code, /isFairPlay \? \{ parseInbandPsshEnabled: false \} : \{\}/);
    assert.match(code, /preferredKeySystems: fairPlayKeySystemList/);
  });

  it('installs initDataTransform at the drm LEVEL, not inside `advanced`', () => {
    // `drm.initDataTransform` is a top-level DrmConfiguration field, a sibling
    // of `advanced`. AdvancedDrmConfiguration has no such field, so a transform
    // nested in `advanced` is never read: the IDT_* trace marker would silently
    // stop firing. (Shaka's default, which our wrapper delegates to, is the
    // correct behaviour for Modern EME - see lib/fairplay.ts.)
    //
    // Structural check: the `advanced` map is opened at a known indentation and
    // closed by the next line at that same indentation. `initDataTransform`
    // must not appear between them. Scanning by indentation is deliberate - an
    // earlier version of this test sliced between two `indexOf` calls and passed
    // even after the transform was moved back inside `advanced`, so it proved
    // nothing.
    const lines = code.split('\n');
    const openIdx = lines.findIndex((l) => l.trim() === 'advanced: {');
    assert.ok(openIdx >= 0, 'config must still contain an advanced map');
    const indentLen = lines[openIdx]!.match(/^\s*/)?.[0].length ?? 0;
    let closeIdx = -1;
    for (let i = openIdx + 1; i < lines.length; i++) {
      // Compared trimmed, not verbatim: the file uses CRLF, so a raw equality
      // check against an indented '},' never matches.
      const lead = lines[i]!.match(/^\s*/)?.[0].length ?? 0;
      if (lines[i]!.trim() === '},' && lead === indentLen) {
        closeIdx = i;
        break;
      }
    }
    assert.ok(closeIdx > openIdx, 'the advanced map must be closed at the same indentation');
    const advancedBody = lines.slice(openIdx + 1, closeIdx).join('\n');
    assert.doesNotMatch(
      advancedBody,
      /initDataTransform/,
      'initDataTransform must not sit inside the advanced map',
    );

    // And it must actually be installed, at the drm level, after that block.
    const afterAdvanced = lines.slice(closeIdx).join('\n');
    assert.match(
      afterAdvanced,
      /\.\.\.\(isFairPlay && shakaDefaultInitDataTransform\s*\?\s*\{\s*initDataTransform:/,
      'initDataTransform must be installed at the drm level',
    );

    // Shaka's AdvancedDrmConfiguration genuinely has no such field - pinned
    // against the SHIPPED externs (not our local shim) so the claim cannot
    // drift from the library we actually load.
    const externs = readFileSync(
      resolve(here, '../../../node_modules/shaka-player/dist/shaka-player.compiled.d.ts'),
      'utf8',
    );
    const adv = externs.slice(externs.indexOf('type AdvancedDrmConfiguration'));
    assert.ok(adv.startsWith('type AdvancedDrmConfiguration'), 'externs must define it');
    assert.doesNotMatch(
      adv.slice(0, 500),
      /initDataTransform/,
      'AdvancedDrmConfiguration must not gain an initDataTransform field',
    );
    const drm = externs.slice(externs.indexOf('type DrmConfiguration'));
    assert.match(
      drm.slice(0, 500),
      /initDataTransform \? :/,
      'DrmConfiguration must keep initDataTransform at the top level',
    );
  });

  it('reports whether the element announced encrypted media', () => {
    // The discriminator for the whole diagnosis: if ENC_* never appears, the
    // licence exchange that produced LIC_REQ cannot have come from FairPlay
    // signalling. Observe-only - initData is key-adjacent and must not be read.
    // The FairPlay branch that registers the observers is the one that sits
    // after the player has been configured.
    const fpBranch = code.slice(code.indexOf('if (isFairPlay) {', code.indexOf('player.configure({')));
    assert.match(fpBranch.slice(0, 900), /addEventListener\('encrypted'/);
    assert.match(code, /ENC_\$\{type \|\| 'NONE'\}/);
    assert.doesNotMatch(code, /initData\s*as\s*Uint8Array/);
    // Never read the event's init data, even for diagnostics.
    assert.doesNotMatch(code, /event as Event & \{ initData\??:/);
    assert.doesNotMatch(code, /\)\.initData\b(?!Type)/);
  });

  it('records key-related events without treating an HTTP response as acceptance', () => {
    // LIC_OK only from Shaka's drmsessionupdate (fired after session.update
    // resolved); LIC_RES remains "a response arrived".
    assert.match(code, /player\.addEventListener\('drmsessionupdate', \(\) => mark\('LIC_OK'\)\)/);
    assert.match(code, /addEventListener\('waitingforkey', \(\) => mark\('WAIT_KEY'\)\)/);
    assert.match(code, /markMediaState\('ENC'\)/);
    assert.match(code, /KS_\$\{keySystemToken\(player\.keySystem\(\)\)\}/);
    // Licence HTTP status: a number, from the response or the error detail.
    assert.match(code, /if \(typeof response\.status === 'number'\) mark\(`LIC_HTTP_\$\{response\.status\}`\)/);
    assert.match(code, /licenceHttpStatusFromError\(detail\)/);
  });

  it('records the native media error only as sanitised tokens', () => {
    // The raw MediaError.message may quote a URL, a signed query string or an
    // skd:// value, so it must never be interpolated into a marker. It may only
    // be PASSED to a classifier whose return value is a fixed token.
    assert.match(code, /nativeErrorDomainCode\(element\.error\?\.message\)/);
    assert.match(code, /mark\(\x60NMSG_\$\{nativeErrorClass\(element\.error\?\.message\)\}\x60\)/);
    assert.match(code, /RS_\$\{element\.readyState\}_NS_\$\{element\.networkState\}/);

    // The real invariant: no marker may contain the message itself. Any use of
    // it inside mark() must be nested in a classifier call, never spliced in.
    const markCalls = [...code.matchAll(/mark\(\x60[^\x60]*\x60\)/g)].map((m) => m[0]);
    for (const call of markCalls) {
      if (!call.includes('.message')) continue;
      assert.match(call, /nativeErrorClass\(/, 'unclassified message in a marker: ' + call);
    }
    assert.doesNotMatch(code, /\$\{element\.error\?*\.message\}/);
    assert.doesNotMatch(code, /\$\{(?:e|err|error)\.message\}/);
  });

  it('decodes the MediaError on the load() rejection path too', () => {
    // The native-HLS path reports a media failure by REJECTING load(), so the
    // catch block is where MediaError.code lives on the path that is supposed
    // to work. Without this the screen shows a bare ERR_VIDEO_ERROR.
    const catchBlock = code.slice(code.indexOf('} catch (e) {'));
    assert.match(catchBlock, /videoErrorDetail\(/);
    assert.match(catchBlock, /MEDIA_/);
  });

  it('keeps both FairPlay key systems and the certificate on the native path', () => {
    // Native playback still needs a licence server and a certificate: the EME
    // exchange is unchanged, only the demux path differs. Losing either here
    // would reintroduce a licence failure instead of fixing the decode one.
    assert.match(code, /\[ks, drm\.licenseUrl\]/);
    assert.match(code, /serverCertificateUri:\s*drm\.certificateUrl/);
  });

  it('does not weaken DRM on the native path', () => {
    // No fallback to an unprotected source, no licence bypass.
    assert.doesNotMatch(code, /drmOnly|allowUnencrypted|skipDrm/);
    // The manifest URL is still the signed one from the ticket.
    assert.match(code, /player\.load\(manifestUrl\)/);
  });

  it('reads media events from the attached element on every path', () => {
    assert.match(code, /const mediaElement = player\.getMediaElement\(\) \?\? video;/);
  });

  it('keeps captions available, since the player is always attached', () => {
    // Guarding this on useNativeHls would silently drop subtitles on iOS now
    // that attach() is unconditional again.
    assert.doesNotMatch(code, /!useNativeHls\s*&&\s*captionsEnabled/);
    assert.match(code, /if \(captionsEnabled && captions\.length > 0\)/);
  });

  it('keeps the existing cleanup safe', () => {
    assert.match(code, /destroy\(\)\.catch\(\(\)\s*=>\s*undefined\)/);
  });

  it('destroys the player on cleanup', () => {
    assert.match(DrmVideo, /playerRef\.current\.destroy\(\)/);
  });
});

/**
 * Production report 2026-10 (Huawei phone, student-web-gray.vercel.app,
 * build 4854b79): stage `DRM_PLAYBACK_VIDEO_ERROR`, trace beginning
 * `MANIFEST@25` - Shaka VIDEO_ERROR (3016) raised from the media element
 * after the manifest loaded. WHY it failed is a PROBABLE hypothesis (a CDM
 * without hardware-secure Widevine), not a confirmed fact: EME exposes no
 * security-level API, and this component never infers one from a media error,
 * a brand or a user agent. These tests pin the invariants that hold regardless
 * of the eventual cause:
 *
 *   1. the Widevine branch records `LIC_OK` on Shaka `drmsessionupdate`,
 *      which shaka 4.11.7 drm_engine.js dispatches only after
 *      `session.update()` RESOLVED (the CDM accepted the licence; a rejection
 *      raises LICENSE_RESPONSE_REJECTED instead) - so licence acceptance is
 *      distinguishable from a media-layer failure, without implying
 *      decryption or playback;
 *   2. a generic VIDEO_ERROR is NEVER attributed to Widevine L1: its payload
 *      carries MediaError codes 1-4 (ABORTED/NETWORK/DECODE/SRC_NOT_SUPPORTED),
 *      so codec, network and decode causes are all in the class, and a device
 *      that cannot satisfy HW_SECURE_ALL is refused at
 *      requestMediaKeySystemAccess as REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE,
 *      which keeps its own specific diagnostic;
 *   3. licence rejection, explicit key-system configuration refusal, manifest,
 *      certificate, network and every other class keep their existing
 *      classifications, stage tokens and wording - FairPlay/iOS included.
 */
describe('DrmVideo media-layer failure reporting (evidence-based classes)', () => {
  it('records CDM licence acceptance on the Widevine branch, not only FairPlay', () => {
    // Anchored on the Widevine request filter - its callback takes only
    // `(type)`, while the FairPlay filter takes `(type, request)` - and ended
    // at the Shaka error listener, so the slice is exactly the else-branch.
    const anchor = code.indexOf('ne.registerRequestFilter((type) => {');
    assert.ok(anchor > -1, 'the Widevine observe-only licence filter must exist');
    const widevineBranch = code.slice(anchor, code.indexOf("addEventListener('error'"));
    assert.match(
      widevineBranch,
      /player\.addEventListener\('drmsessionupdate', \(\) => mark\('LIC_OK'\)\)/,
    );
    // Still observe-only: the branch must touch no payload.
    assert.doesNotMatch(widevineBranch, /request\.body|response\.data/);
    // LIC_OK covers the licence-ACCEPTANCE stage only; playback-start stays a
    // separate, independently wired marker (case 7).
    assert.match(
      code,
      /video\?\.addEventListener\('playing', \(\) => mark\('PLAYING'\)\)/,
      'PLAYING must remain its own marker, never folded into LIC_OK',
    );
  });

  it('never blames a generic Widevine-path VIDEO_ERROR on missing Widevine L1', () => {
    // Android and Web share this ONE non-FairPlay path in the component
    // (`!isFairPlay`), so this single scope covers both cases: neither an
    // Android nor a Web 3016 may be classified as missing Widevine L1.
    const handler = code.slice(
      code.indexOf("addEventListener('error'"),
      code.indexOf("mark('MANIFEST')"),
    );
    assert.match(
      handler,
      /!isFairPlay && code === shaka\.util\.Error\.Code\.VIDEO_ERROR/,
      'the media-layer class stays scoped to the non-FairPlay path',
    );
    // The message must assert no cause the client cannot prove...
    assert.doesNotMatch(
      handler,
      /Widevine L1|hardware-protected|hardware security|likely lacks/,
    );
    // ...and must stay actionable rather than reload-only.
    assert.match(handler, /Try reloading once/);
    assert.match(handler, /Chrome or Edge/);
    assert.match(handler, /contact support/);
    // No brand or user-agent sniffing may enter the classifier.
    assert.doesNotMatch(handler, /userAgent|navigator\.platform|iPhone|Android|Huawei/);
  });

  it('keeps an explicit key-system configuration refusal in the licence class', () => {
    // Shaka 4.11.7 has no "unsupported robustness" code: a request the CDM
    // cannot satisfy surfaces as REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
    // (6001, "None of the requested key system configurations are available").
    // THAT - not a 3016 - is the evidence-backed security-configuration
    // diagnostic, and it keeps its specific message and stage prefix.
    const handler = code.slice(
      code.indexOf("addEventListener('error'"),
      code.indexOf("mark('MANIFEST')"),
    );
    assert.match(handler, /REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE/);
    assert.match(handler, /not permitted to play protected video/);
    assert.match(handler, /DRM_LICENCE_\$\{name\}/);
  });

  it('keeps licence rejection distinguishable from an unrelated media error', () => {
    // The licence class carries its own codes, stage prefix and HTTP marker;
    // a media-element failure falls through to the playback class with the
    // MEDIA_* discriminator.
    const handler = code.slice(
      code.indexOf("addEventListener('error'"),
      code.indexOf("mark('MANIFEST')"),
    );
    assert.match(handler, /LICENSE_REQUEST_FAILED/);
    assert.match(handler, /LICENSE_RESPONSE_REJECTED/);
    assert.match(handler, /DRM_LICENCE_\$\{name\}/);
    assert.match(handler, /DRM_PLAYBACK_\$\{name\}/);
    assert.match(handler, /LIC_HTTP_\$\{licenceHttp\}/);
    assert.match(handler, /MEDIA_\$\{media\.code\}/);
  });

  it('preserves the manifest, certificate, network and generic classifications', () => {
    // Manifest stage and its own load-rejection wording, the FairPlay
    // certificate config and stage classes, and the untouched generic reload
    // advice for every other class.
    const handler = code.slice(
      code.indexOf("addEventListener('error'"),
      code.indexOf("mark('CANPLAY')"),
    );
    assert.match(handler, /mark\('MANIFEST'\)/);
    assert.match(
      handler,
      /Could not start protected playback \(\$\{name\}\)\. Please reload the lesson\./,
    );
    assert.match(
      handler,
      /Protected playback failed \(\$\{name\}\)\. Please reload the lesson\./,
    );
    assert.match(handler, /DRM_FAIRPLAY_\$\{fpStage\}/);
    assert.match(code, /isFairPlay && drm\.certificateUrl/);
  });

  it('leaves the iOS/FairPlay path and messages unchanged', () => {
    // The media-layer special case is gated on `!isFairPlay`, so FairPlay
    // keeps the exact production wording for both classes, and the
    // native-HLS load rejection keeps its own wiring.
    const handler = code.slice(
      code.indexOf("addEventListener('error'"),
      code.indexOf("mark('MANIFEST')"),
    );
    assert.match(handler, /isLicence[\s\S]*not permitted to play protected video/);
    assert.match(handler, /DRM_FAIRPLAY_\$\{fpStage\}/);
    assert.match(code, /needsNativeFairPlayHls\(drm\)/);
  });
});
