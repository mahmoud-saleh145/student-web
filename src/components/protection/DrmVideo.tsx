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

import { Watermark } from '@/components/protection/Watermark';
import {
  buildFairPlayLicenseRequest,
  createFairPlayInitDataTransform,
  fairPlayStageFromMessage,
  parseFairPlayLicenseResponse,
  videoErrorDetail,
} from '@/lib/fairplay';

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
  // Every token here is a fixed literal or a MediaError number.
  const [trace, setTrace] = React.useState<string[]>([]);
  const mark = React.useCallback((token: string) => {
    setTrace((prev) => (prev.includes(token) ? prev : [...prev, token]));
  }, []);

  // Keep the latest callbacks reachable without making them effect dependencies,
  // which would tear down and rebuild the player on every parent render.
  const cbs = React.useRef({ onTerminate, onError, onPlayback, onPause, onTimeUpdate, onEnded });
  cbs.current = { onTerminate, onError, onPlayback, onPause, onTimeUpdate, onEnded };

  React.useEffect(() => {
    let disposed = false;
    let video: HTMLVideoElement | null = null;

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
      await player.attach(video);

      const widevine = 'com.widevine.alpha';
      const fairplay = 'com.apple.fps';
      // Legacy Apple Media Keys. Which of the two a manifest yields depends on
      // its signalling, so both get a licence server and the certificate.
      const fairplayLegacy = 'com.apple.fps.1_0';
      const isFairPlay = drm.scheme === 'fairplay';

      player.configure({
        drm: {
          servers: isFairPlay
            ? { [fairplay]: drm.licenseUrl, [fairplayLegacy]: drm.licenseUrl }
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
              ? {
                  [fairplay]: { serverCertificateUri: drm.certificateUrl },
                  [fairplayLegacy]: { serverCertificateUri: drm.certificateUrl },
                }
              : {}),
            // FairPlay ONLY. Gumlet's HLS signals keys with
            // KEYFORMAT=com.apple.streamingkeydelivery, which Shaka's parser
            // turns into initDataType 'sinf' with an EMPTY buffer plus the
            // skd:// URI on drmInfo.keySystemUris. Shaka's default transform
            // keys off 'skd', so it never fires here and the content id is
            // never derived - Safari would then build a licence request for an
            // empty content id that the server cannot satisfy. See
            // lib/fairplay.ts for the full trace.
            ...(isFairPlay
              ? {
                  initDataTransform: createFairPlayInitDataTransform((initData, contentId, cert) =>
                    shaka.util.FairPlayUtils.initDataTransform(initData, contentId, cert),
                  ),
                }
              : {}),
          },
        },
        abr: { enabled: true },
      });

      if (isFairPlay) {
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
        const fpStage = fairPlayStageFromMessage(detail?.message);
        // VIDEO_ERROR (3016) is raised only from the <video> element's error by
        // StreamingEngine, which runs after DRM init and after the licence
        // exchange. Its payload is [code, MediaError.code, msExtendedCode,
        // message]; we read the two NUMBERS and never the message.
        const media = videoErrorDetail(detail);
        if (media) mark(`MEDIA_${media.code}${media.ext ? '_' + media.ext : ''}`);
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
        const fpStage = fairPlayStageFromMessage((e as { message?: unknown })?.message);
        setFatal(
          fpStage
            ? `Protected playback failed (${fpStage}). Please reload the lesson.`
            : code === shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
              ? 'This browser or device is not permitted to play protected video.'
              : `Could not start protected playback (${name}). Please reload the lesson.`,
        );
        const reported = fpStage ? `DRM_FAIRPLAY_${fpStage}` : `DRM_PLAYBACK_${name}`;
        mark(fpStage ? `ERR_${fpStage}` : `ERR_${name}`);
        setStage(reported);
        cbs.current.onError?.(reported);
        return;
      }
      if (disposed) return;
      mark('LOADED');

      // Backstop for the media layer. Shaka raises VIDEO_ERROR from the same
      // signal, but a native-source failure can reach the element without it, and
      // MediaError.code is the single most useful discriminator on Safari:
      // 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED. Numbers only - the
      // MediaError message is never read, let alone logged.
      video?.addEventListener('error', () => {
        const err = video?.error;
        mark(`MEDIA_${err ? err.code : 'X'}`);
      });

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

      player.getMediaElement()?.addEventListener('ended', () => cbs.current.onEnded?.());
      player.getMediaElement()?.addEventListener('play', () => cbs.current.onPlayback?.());
      player.getMediaElement()?.addEventListener('pause', () => cbs.current.onPause?.());
      player.getMediaElement()?.addEventListener('timeupdate', () => cbs.current.onTimeUpdate?.());
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
  }, [manifestUrl, drm.scheme, drm.licenseUrl, drm.certificateUrl, captionsEnabled, captions, mark]);

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
              data-drm-trace={trace.join('>')}
              className="max-w-md font-mono text-[10px] tracking-wider text-white/35 select-none"
            >
              {trace.join(' > ')}
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
