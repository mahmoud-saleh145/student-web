'use client';

import * as React from 'react';
// Bundles shaka-player into this route instead of fetching it from a CDN at
// runtime, so a CDN outage cannot take protected playback down.
//
// The namespace import is REQUIRED, and a bare side-effect import is not enough.
// shaka-player's UMD wrapper only assigns `window.shaka` on its third branch --
// the one taken when there is no module system. Under a bundler `exports` is
// always defined, so the wrapper populates the module's exports and leaves the
// global permanently undefined. Reading `window.shaka` here therefore always
// yielded `undefined`, and this component bailed out before ever constructing a
// player or requesting the manifest. See src/types/shaka-player.d.ts, which
// declares the module boundary so this import resolves at all.
import * as shaka from 'shaka-player';
import 'shaka-player/dist/controls.css';

import {
  needsNativeFairPlayHls,
  streamingConfigForNativeHls,
} from '@/lib/fairplay-native-hls';
import { Watermark } from '@/components/protection/Watermark';
import {
  buildFairPlayLicenseRequest,
  fairPlayStageFromErrorDetail,
  parseFairPlayLicenseResponse,
  traceInitDataTransform,
  videoErrorDetail,
} from '@/lib/fairplay';
import {
  DEFAULT_FAIRPLAY_DIAG_FLAGS,
  appendTraceEvent,
  fairPlayConfigTokens,
  fairPlayKeySystems,
  formatTrace,
  keySystemToken,
  licenceHttpStatusFromError,
  nativeErrorDomainCode,
  parseFairPlayDiagFlags,
  type TraceEntry,
} from '@/lib/drm-diagnostics';

/**
 * DRM video playback for Gumlet-backed lessons.
 *
 * WHY A SECOND PLAYER EXISTS
 *
 * hls.js has no EME/DRM support at all, so an HLS.js player can never request a
 * Widevine or FairPlay licence. Gumlet delivers DRM content as CENC-encrypted
 * DASH, which requires a player that speaks EME. Shaka is the player Gumlet's
 * own documentation recommends for browser DRM, so this is the documented
 * integration path rather than a custom one.
 *
 * SECURITY NOTES
 *
 *   * This component receives ONLY the short-lived signed licence URL minted by
 *     our backend. The Gumlet signing secret never reaches the client: the
 *     backend puts it nowhere in the ticket response, and the frontend has no
 *     code that could use it.
 *   * There is deliberately NO fallback to an unprotected source. If DRM init
 *     fails, the user sees an error and the lesson does not play. Silently
 *     swapping in a plain stream would defeat the point of the lesson being
 *     DRM-protected.
 *   * `videoRobustness` is what we REQUEST from the browser. It is not evidence
 *     that the negotiated Widevine security level is L1, and this component
 *     makes no such claim. The level is not observable from EME.
 */

/** What the backend ticket hands the player. */
export type DrmTicket = {
  /** Short-lived, asset-scoped Widevine/FairPlay licence URL, signed server-side. */
  licenseUrl: string | null;
  certificateUrl: string | null;
  scheme: 'widevine' | 'fairplay' | 'none';
};

type Props = {
  manifestUrl: string;
  drm: DrmTicket;
  captions: { language: string; label: string; url: string; isDefault: boolean }[];
  captionsEnabled: boolean;
  watermark: { primary: string; secondary: string; opacity: number; moveIntervalSeconds: number };
  /** Called when the backend asks us to stop (revoked, capture detected). */
  onTerminate?: (reason: string) => void;
  onError?: (message: string) => void;
  onPlayback?: () => void;
  onPause?: () => void;
  onTimeUpdate?: () => void;
  onEnded?: () => void;
};


export default function DrmVideo({
  manifestUrl,
  drm,
  captions,
  captionsEnabled,
  watermark,
  onTerminate,
  onError,
  onPlayback,
  onPause,
  onTimeUpdate,
  onEnded,
}: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const playerRef = React.useRef<shaka.Player | null>(null);
  const [fatal, setFatal] = React.useState<string | null>(null);
  // Sanitised stage code, rendered on screen as well as logged. A student on a
  // phone has no console, so a code only in the console is a code nobody can
  // report back. Always a fixed token: never a URL, token, certificate or
  // Shaka message.
  const [stage, setStage] = React.useState<string | null>(null);
  // Ordered, sanitised trace of how far playback actually got. A single error
  // code cannot say whether the licence was ever requested, and that is the one
  // thing that separates a FairPlay contract failure from a media-layer failure.
  // Every token here is a fixed literal, a small integer, or a pattern-checked
  // identifier (lib/drm-diagnostics.ts). Each carries the ms since this player
  // effect started, and a repeat count, so timing and duplicate events (e.g. a
  // second `encrypted` event) are visible rather than inferred from ordering.
  const [trace, setTrace] = React.useState<TraceEntry[]>([]);
  const traceStartRef = React.useRef(0);
  const mark = React.useCallback((token: string) => {
    const atMs = performance.now() - traceStartRef.current;
    setTrace((prev) => appendTraceEvent(prev, token, atMs));
  }, []);

  /**
   * Safe snapshot of the media element: whether MediaKeys were attached at that
   * moment and, on failure, Safari's native error domain/code (never the
   * message text), readyState and networkState.
   */
  const markMediaState = React.useCallback(
    (where: 'ERR' | 'ENC') => {
      const element = videoRef.current;
      if (!element) return;
      mark(`MK_AT_${where}_${element.mediaKeys ? 1 : 0}`);
      if (where === 'ERR') {
        const native = nativeErrorDomainCode(element.error?.message);
        if (native) mark(`NERR_${native}`);
        mark(`RS_${element.readyState}_NS_${element.networkState}`);
      }
    },
    [mark],
  );

  /**
   * Which engine Shaka actually chose.
   *
   * `video.mediaSource` is non-null only while the element is under Media
   * Source Extensions control, so this reads the routing decision directly
   * through a public DOM API instead of inferring it. That matters because
   * Shaka's native-vs-MSE choice is not purely configuration: it also depends on
   * the manifest response's Content-Type, so a ticket can be routed onto MSE
   * even with every native flag set. FairPlay over MSE is the exact failure
   * this branch exists to prevent, and `LIC_REQ` only proves the DRM engine ran
   * - which is itself the tell. Recording the route makes it unambiguous on a
   * device report instead of something to be inferred from mark ordering.
   */
  const markRoute = React.useCallback(() => {
    // `HTMLMediaElement.mediaSource` is a standard DOM property but is absent
    // from this project's TypeScript DOM lib, so it is read through one narrow
    // optional property rather than a cast of the whole element. The value is
    // only ever tested for truthiness - nothing about it is ever emitted.
    const element = videoRef.current as (HTMLVideoElement & { mediaSource?: unknown }) | null;
    mark(element?.mediaSource ? 'ROUTE_MSE' : 'ROUTE_NATIVE');
  }, [mark]);

  // Keep the latest callbacks reachable without making them effect dependencies,
  // which would tear down and rebuild the player on every parent render.
  const cbs = React.useRef({ onTerminate, onError, onPlayback, onPause, onTimeUpdate, onEnded });
  cbs.current = { onTerminate, onError, onPlayback, onPause, onTimeUpdate, onEnded };

  React.useEffect(() => {
    let disposed = false;
    let video: HTMLVideoElement | null = null;

    traceStartRef.current = performance.now();
    setTrace([]);

    (async () => {
      if (!videoRef.current) return;

      // --- contract checks: refuse, do not downgrade -----------------------
      if (drm.scheme === 'none' || !drm.licenseUrl) {
        setStage('FP_NO_LICENSE');
        setFatal('This lesson requires DRM, but the server did not return a licence. Playback is blocked.');
        return;
      }
      if (!manifestUrl) {
        setStage('FP_NO_MANIFEST');
        setFatal('This lesson has no manifest URL. Playback is blocked.');
        return;
      }

      // Shaka is imported as a module (see the import at the top of this file),
      // so it is available here in every bundler context. The previous
      // `window.shaka` lookup was always undefined and short-circuited this
      // effect before a player or manifest request was ever made.
      if (disposed || !videoRef.current) return;

      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        setStage('BROWSER_UNSUPPORTED');
        setFatal('This browser cannot play protected video. Try the latest Chrome or Edge.');
        return;
      }

      const player = new shaka.Player();
      playerRef.current = player;
      video = videoRef.current;

      const widevine = 'com.widevine.alpha';
      const isFairPlay = drm.scheme === 'fairplay';
      // Diagnostic experiments (lib/drm-diagnostics.ts). OFF unless the page URL
      // carries exactly `fpks=1_0` or `fpcors=0`, and FairPlay-only: a
      // Widevine ticket never reads them. With no flag the FairPlay key systems
      // are `com.apple.fps` then `com.apple.fps.1_0`, both with a licence
      // server and the certificate - the production configuration.
      const diag = isFairPlay
        ? parseFairPlayDiagFlags(typeof window === 'undefined' ? '' : window.location.search)
        : DEFAULT_FAIRPLAY_DIAG_FLAGS;
      const fairPlayKeySystemList = fairPlayKeySystems(diag);
      if (isFairPlay) {
        for (const token of fairPlayConfigTokens(diag)) mark(token);
        // `fpcors=0`: drop the attribute before Shaka assigns any source.
        if (diag.omitCrossOrigin) video.removeAttribute('crossorigin');
      }

      // FairPlay on Safari: use the native HLS engine.
      //
      // Shaka supports FairPlay ONLY through native `src=` playback, never
      // through MSE - shaka-project/shaka-player#2096, Shaka maintainer:
      // "We only support FairPlay through native src= playback, we don't
      //  support it through MSE playback."
      //
      // `preferNativeHls` is what selects that route. `attach()` must STILL be
      // called, and that is the subtle part: attach() is not "switch MSE on".
      // In shaka-player 4.11.7 it is the ONLY thing that assigns the player's
      // internal media element (`c.h = a`), and `load()` opens with
      // `if (!d.h) throw new T(2, 7, 7002)` - CONTENT.NO_VIDEO_ELEMENT.
      //
      // So skipping attach() on this path produced exactly that: every FairPlay
      // ticket failed at load() with DRM_PLAYBACK_NO_VIDEO_ELEMENT, before any
      // manifest request. An earlier revision of this file guarded attach() with
      // `if (!useNativeHls)`; that was wrong. With preferNativeHls set, attach()
      // binds the element and load() then routes to the native engine instead of
      // the MSE one - which is the supported FairPlay path and the fix for the
      // MEDIA_3 decode failure.
      const useNativeHls = needsNativeFairPlayHls(drm);
      if (useNativeHls) {
        mark('NATIVE_HLS');
        player.configure(streamingConfigForNativeHls());
      }

      // Always attach. Required on BOTH paths; see above.
      await player.attach(video);

      // Shaka's own default init-data transform, read before anything overrides
      // it. The FairPlay branch below wraps it for the trace and delegates to it.
      const shakaDefaultInitDataTransform = player.getConfiguration().drm.initDataTransform;

      player.configure({
        drm: {
          // FairPlay ONLY - see below. Left at its default for every other key
          // system, because Widevine DASH depends on in-band PSSH parsing.
          //
          // WHY, for FairPlay only.
          //
          // Gumlet's HLS media playlist carries TWO `#EXT-X-KEY` lines: a
          // Widevine CENC PSSH as a `data:text/plain;base64,...` URI under
          // `KEYFORMAT="urn:uuid:edef8ba9-..."`, and the FairPlay entry under
          // `KEYFORMAT="com.apple.streamingkeydelivery"` with an `skd://` URI.
          // Both are `METHOD=SAMPLE-AES` over CMAF (`#EXT-X-MAP` present).
          //
          // Shaka's DRM engine registers its handler for the <video> element's
          // `encrypted` event - the ONLY thing that delivers the `skd://` init
          // data the Apple CDM needs to derive a content id - under exactly
          // this condition:
          //
          //     if (!drmInfo.initData.length && !queuedInitData &&
          //         !config.parseInbandPsshEnabled) { listenFor('encrypted') }
          //
          // With in-band PSSH parsing on, that handler is never registered.
          // Shaka instead takes the PSSH out of the CMAF init segment, requests
          // a licence for it, gets an HTTP answer, and installs a CKC the Apple
          // CDM cannot use for these segments: the track never decrypts and the
          // element reports MediaError.code 3.
          //
          // The observable signature of that state is a licence exchange with
          // NO `IDT_*` marker - `drm.initDataTransform` above marks on entry,
          // and it is only ever reached from the `encrypted` handler. That is
          // what the reported trace showed.
          //
          // This removes the Widevine PSSH from consideration on the FairPlay
          // path ONLY. It grants no access and disables no protection: the same
          // signed manifest, the same licence server and certificate, the same
          // key systems and the same entitlement checks all still apply.
          ...(isFairPlay ? { parseInbandPsshEnabled: false } : {}),
          // ...and the same PSSH still competes for the session.
          //
          // Shaka's parser maps the two key entries to two DrmInfos on the
          // SAME stream:
          //
          //   com.apple.fps       initDataType 'sinf', initData = Uint8Array(0)
          //   com.widevine.alpha  initDataType 'cenc', initData = the PSSH
          //
          // `DrmUtils.fixDrmInfo` does NOT drop a key system just because we
          // serve no licence URL for it, so both survive on the stream and
          // compete in `chooseDecodingInfo`. That chooser is the only thing
          // that decides which one the session is built from, and it is driven
          // by `preferredKeySystems`:
          //
          //   chooseDecodingInfo(tracks, current, drm.preferredKeySystems)
          //
          // with an empty list it picks by codec/key-system support alone, and
          // the PSSH-bearing DrmInfo wins. The session is then created from
          // the PSSH, `drmInfo.initData` is non-empty, and
          // `DrmEngine.attach` takes this branch instead of registering the
          // `encrypted` handler:
          //
          //   if (initData.length || queued.length || parseInbandPsshEnabled)
          //       -> no `encrypted` listener
          //
          // which is exactly the observed state: `ENC_skd` present (Safari did
          // hand us the `skd://` init data) but no `IDT_*` (our
          // `initDataTransform` was never reached), so the licence request went
          // out for the Widevine PSSH and the CKC it returned is not one the
          // Apple CDM can use for these segments.
          //
          // Naming the key systems we actually serve makes the chooser pick the
          // FairPlay DrmInfo, whose initData is legitimately empty because
          // FairPlay signalling arrives via the `encrypted` event. FairPlay
          // ONLY - Widevine must keep its own ordering untouched.
          ...(isFairPlay
            ? { preferredKeySystems: fairPlayKeySystemList }
            : {}),
          servers: isFairPlay
            ? Object.fromEntries(fairPlayKeySystemList.map((ks) => [ks, drm.licenseUrl]))
            : { [widevine]: drm.licenseUrl },
          advanced: {
            // Requested robustness only. No SW fallback: a software-only CDM
            // fails here rather than silently playing an unprotected stream.
            [widevine]: {
              videoRobustness: ['HW_SECURE_ALL'],
              audioRobustness: ['HW_SECURE_ALL'],
            },
            // The certificate goes in the nested object. `configure()` takes a
            // '.'-separated path as its first argument, so passing
            // 'drm.advanced.com.apple.fps.serverCertificateUri' would split the
            // key-system name at its dots and never reach the key system.
            ...(isFairPlay && drm.certificateUrl
              ? Object.fromEntries(
                  fairPlayKeySystemList.map((ks) => [ks, { serverCertificateUri: drm.certificateUrl }]),
                )
              : {}),
          },
          // FairPlay ONLY, at the `drm` level (Shaka 4.11.7 reads
          // `initDataTransform` only there, never from `advanced`).
          //
          // It changes nothing about the init data. It records which init-data
          // type Safari delivered (`IDT_*`) and hands the call to Shaka's own
          // default, which passes Modern EME init data through untouched and
          // rebuilds the legacy Apple layout only when Shaka's legacy media-keys
          // polyfill is installed. See `traceInitDataTransform` in
          // lib/fairplay.ts for why our previous rebuild was wrong on this path.
          ...(isFairPlay && shakaDefaultInitDataTransform
            ? {
                initDataTransform: traceInitDataTransform(shakaDefaultInitDataTransform, (initDataType) =>
                  mark(`IDT_${initDataType || 'NONE'}`),
                ),
              }
            : {}),
        },
        abr: { enabled: true },
      });

      if (isFairPlay) {
        // Whether the element ever announced encrypted media at all.
        //
        // This is the discriminator the whole diagnosis turns on. Safari only
        // fires `encrypted` once it has actually found encrypted content AND
        // EME is live on the element; Shaka's `encrypted` handler - the only
        // route to the `skd://` init data, and therefore to `IDT_*` and a
        // usable FairPlay content id - is registered behind the same conditions
        // described above. If `ENC_*` is absent the licence exchange that
        // produced LIC_REQ cannot have come from FairPlay signalling.
        //
        // Observes only. Nothing about the event is modified, and `initData` is
        // deliberately never read: it is key-adjacent material. Only the fixed
        // `initDataType` string is reported, which is a constant per spec.
        video?.addEventListener('encrypted', (event: Event) => {
          const type = (event as Event & { initDataType?: string }).initDataType;
          mark(`ENC_${type || 'NONE'}`);
          // Registered before Shaka's own listener, so this is the state Safari
          // had when it announced encrypted media.
          markMediaState('ENC');
        });
        // Safari is stalled waiting for a key (observe only).
        video?.addEventListener('waitingforkey', () => mark('WAIT_KEY'));
        // Shaka fires this only after `session.update(ckc)` RESOLVED - i.e. the
        // CDM accepted the licence. An HTTP response alone (LIC_RES) is not that.
        player.addEventListener('drmsessionupdate', () => mark('LIC_OK'));

        // Gumlet's licence server speaks JSON: it wants {"spc": "<base64>"} and
        // answers {"ckc": "<base64>"}. Shaka's generic FairPlay contract (and
        // shaka.util.FairPlayUtils.commonFairPlayResponse, which implements it)
        // expects a form-encoded `spc=` body and an optional <ckc> XML wrapper,
        // so that helper would not decode Gumlet's response. See lib/fairplay.ts
        // for the full rationale.
        const ne = player.getNetworkingEngine();
        if (!ne) {
          // Without these filters the licence exchange cannot work, so fail
          // loudly rather than degrading to a request Gumlet will reject.
          setStage('FP_NO_NETWORK_ENGINE');
          setFatal('Protected playback is unavailable: the player network stack failed to initialise.');
          return;
        }
        ne.registerRequestFilter((type, request) => {
          if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) return;
          mark('LIC_REQ');
          request.headers['Content-Type'] = 'application/json';
          request.body = buildFairPlayLicenseRequest(request.body);
        });
        ne.registerResponseFilter((type, response) => {
          if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) return;
          mark('LIC_RES');
          if (typeof response.status === 'number') mark(`LIC_HTTP_${response.status}`);
          response.data = parseFairPlayLicenseResponse(response.data);
        });
      } else {
        // Widevine/PlayReady branch: observe only. No payload is touched and no
        // DRM configuration changes - this exists so a healthy desktop/Android
        // run produces the same trace and can be compared against iOS.
        const ne = player.getNetworkingEngine();
        if (ne) {
          ne.registerRequestFilter((type) => {
            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) mark('LIC_REQ');
          });
          ne.registerResponseFilter((type) => {
            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) mark('LIC_RES');
          });
        }
      }

      // --- lifecycle --------------------------------------------------------
      player.addEventListener('error', (event: unknown) => {
        if (disposed) return;
        const detail = (event as { detail?: { code?: number; message?: string; data?: unknown } }).detail;
        const code = detail?.code ?? 0;
        const name = Object.entries(shaka.util.Error.Code).find(([, v]) => v === code)?.[0] ?? 'UNKNOWN';

        // A licence rejection is a distinct, reportable class of failure: it
        // means the backend issued a token but the CDM was refused.
        const licenceCodes = [
          shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE,
          shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
          shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
          shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
          shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
        ];
        const isLicence = licenceCodes.includes(code);
        setFatal(
          isLicence
            ? 'This browser or device is not permitted to play protected video.'
            : `Protected playback failed (${name}). Please reload the lesson.`,
        );
        // Our own init-data failures carry a stage tag so the failing step is
        // identifiable in production. Only the tag is emitted - never the
        // surrounding message, which could quote a URL or payload.
        const fpStage = fairPlayStageFromErrorDetail(detail);
        // VIDEO_ERROR (3016) is raised only from the <video> element's error by
        // StreamingEngine, which runs after DRM init and after the licence
        // exchange. Its payload is [code, MediaError.code, msExtendedCode,
        // message]; we read the two NUMBERS and never the message.
        const media = videoErrorDetail(detail);
        if (media) mark(`MEDIA_${media.code}${media.ext ? '_' + media.ext : ''}`);
        if (media) markMediaState('ERR');
        const licenceHttp = licenceHttpStatusFromError(detail);
        if (licenceHttp) mark(`LIC_HTTP_${licenceHttp}`);
        mark(`KS_${keySystemToken(player.keySystem())}`);
        // Record the route on failure too - this is where it matters most, and
        // a run that never reached LOADED has no other route evidence.
        markRoute();
        const reported = fpStage
          ? `DRM_FAIRPLAY_${fpStage}`
          : isLicence
            ? `DRM_LICENCE_${name}`
            : `DRM_PLAYBACK_${name}`;
        mark(fpStage ? `ERR_${fpStage}` : media ? `ERR_${name}_${media.code}` : `ERR_${name}`);
        setStage(reported);
        cbs.current.onError?.(reported);
      });

      try {
        mark('MANIFEST');
        await player.load(manifestUrl);
      } catch (e) {
        if (disposed) return;
        const code = (e as { code?: number })?.code;
        const name = code ? (Object.entries(shaka.util.Error.Code).find(([, v]) => v === code)?.[0] ?? 'UNKNOWN') : 'UNKNOWN';
        const fpStage = fairPlayStageFromErrorDetail(
          e as { message?: unknown; data?: unknown },
        );
        // The native-HLS path reports a media failure by REJECTING load() with
        // the same VIDEO_ERROR (3016) Shaka's error event carries, so this catch
        // is where MediaError.code lives on exactly the path that is supposed to
        // work. Decoding it here is what stops the screen showing a bare
        // ERR_VIDEO_ERROR with the code missing.
        const media = videoErrorDetail({
          code: typeof code === 'number' ? code : undefined,
          data: (e as { data?: unknown })?.data,
        });
        if (media) mark(`MEDIA_${media.code}${media.ext ? '_' + media.ext : ''}`);
        if (media) markMediaState('ERR');
        mark(`KS_${keySystemToken(player.keySystem())}`);
        setFatal(
          fpStage
            ? `Protected playback failed (${fpStage}). Please reload the lesson.`
            : code === shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
              ? 'This browser or device is not permitted to play protected video.'
              : `Could not start protected playback (${name}). Please reload the lesson.`,
        );
        const reported = fpStage ? `DRM_FAIRPLAY_${fpStage}` : `DRM_PLAYBACK_${name}`;
        mark(fpStage ? `ERR_${fpStage}` : media ? `ERR_${name}_${media.code}` : `ERR_${name}`);
        setStage(reported);
        cbs.current.onError?.(reported);
        return;
      }
      if (disposed) return;
      mark('LOADED');
      markRoute();
      mark(`KS_${keySystemToken(player.keySystem())}`);

      // Backstop for the media layer. Shaka raises VIDEO_ERROR from the same
      // signal, but a native-source failure can reach the element without it, and
      // MediaError.code is the single most useful discriminator on Safari:
      // 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED. Numbers only - the
      // MediaError message is never read, let alone logged.
      video?.addEventListener('error', () => {
        const err = video?.error;
        mark(`MEDIA_${err ? err.code : 'X'}`);
        markMediaState('ERR');
      });

      // Track-level discriminator. MediaError.code cannot say WHICH track
      // failed, and this asset carries audio in a separate rendition, so an
      // audio-only failure is otherwise indistinguishable from a video one.
      video?.addEventListener('loadedmetadata', () => mark('META'));
      video?.addEventListener('canplay', () => mark('CANPLAY'));
      video?.addEventListener('playing', () => mark('PLAYING'));

      // Captions: Gumlet delivers them as URLs, so push them into Shaka rather
      // than into <track> elements, which Shaka does not read.
      if (captionsEnabled && captions.length > 0) {
        for (const c of captions) {
          try {
            await player.addTextTrackAsync(c.url, c.language, 'subtitles', c.label, c.isDefault ? 'default' : 'none');
          } catch {
            // A missing caption must never block playback of the lesson.
          }
        }
      }

      // The player is attached on every path, so `getMediaElement()` always
      // resolves. The `?? video` fallback keeps this safe if a future change ever
      // restores a genuinely unattached state.
      const mediaElement = player.getMediaElement() ?? video;
      mediaElement?.addEventListener('ended', () => cbs.current.onEnded?.());
      mediaElement?.addEventListener('play', () => cbs.current.onPlayback?.());
      mediaElement?.addEventListener('pause', () => cbs.current.onPause?.());
      mediaElement?.addEventListener('timeupdate', () => cbs.current.onTimeUpdate?.());
    })().catch((e: unknown) => {
      if (disposed) return;
      const msg = e instanceof Error ? e.message : String(e);
      setFatal(msg);
      cbs.current.onError?.(`DRM_INIT_${msg}`);
    });

    return () => {
      disposed = true;
      // Stop the CDM and release the licence immediately on unmount/navigation.
      if (playerRef.current) {
        void playerRef.current.destroy().catch(() => undefined);
        playerRef.current = null;
      }
      void video;
    };
  }, [manifestUrl, drm.scheme, drm.licenseUrl, drm.certificateUrl, captionsEnabled, captions, mark, markMediaState]);

  return (
    <div ref={undefined} className="relative mx-auto w-full max-w-5xl" data-protected>
      <video
        ref={videoRef}
        controls
        playsInline
        crossOrigin="anonymous"
        className="aspect-video w-full select-none rounded-lg bg-black"
      />

      {fatal ? (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/95 p-6 text-center text-white"
        >
          <p className="text-sm font-semibold text-danger">Protected playback unavailable</p>
          <p className="max-w-md text-xs text-white/70">{fatal}</p>
          {stage ? (
            <p
              data-drm-stage={stage}
              className="max-w-md font-mono text-[11px] tracking-wider text-white/50 select-none"
            >
              {stage}
            </p>
          ) : null}
          {trace.length ? (
            <p
              data-drm-trace={formatTrace(trace, '>')}
              className="max-w-md font-mono text-[10px] tracking-wider text-white/35 select-none"
            >
              {formatTrace(trace, ' > ')}
            </p>
          ) : null}
          <p className="max-w-md text-[11px] text-white/40">
            This lesson is DRM-protected. Protected video cannot be shown in this browser or on this device.
          </p>
        </div>
      ) : null}

      <Watermark
        primary={watermark.primary}
        secondary={watermark.secondary}
        opacity={watermark.opacity}
        intervalMs={Math.max(5, watermark.moveIntervalSeconds || 12) * 1000}
      />
    </div>
  );
}
