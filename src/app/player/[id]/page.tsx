'use client';

import Hls from 'hls.js';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { Watermark } from '@/components/protection/Watermark';
import DrmVideo from '@/components/protection/DrmVideo';
import { ErrorState, FocusShell } from '@/components/ui/feedback';
import { useLessonByVideo } from '@/features/api';
import { api, ApiError } from '@/lib/api-client';
import { formatTimecode } from '@/lib/format';
import { detectPlaybackPlatform } from '@/lib/playback-platform';
import { isDrmPlaybackTicket } from '@/lib/drm-playback';
import { gumletEmbedSrc, isRejectedDeliveryField, playbackTicketRequestBody } from '@/lib/gumlet-embed';
import { PlaybackSession, type HeartbeatReply } from '@/lib/playback-session';
import { readPlaybackSessionFlagEnv, resolvePlaybackSessionMode } from '@/lib/playback-session-flag';
import { broadcastPlaybackReleased, createPlaybackTabLock, openPlaybackChannel } from '@/lib/playback-tab-lock';
import { terminationErrorCode } from '@/lib/playback-termination';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';
import { qk } from '@/lib/query-keys';
import { useSession, useTranslation } from '@/lib/session-context';
import { usePlayerStore } from '@/store/stores';
import type { PlaybackTicket } from '@/types/domain';

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const videoId = params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const autoplayNext = usePlayerStore((s) => s.autoplayNext);
  const rate = usePlayerStore((s) => s.rate);
  const captionsEnabled = usePlayerStore((s) => s.captionsEnabled);

  const lessonQuery = useLessonByVideo(videoId);
  const lesson = lessonQuery.data;

  const close = React.useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace('/home');
  }, [router]);

  if (lessonQuery.isLoading) {
    return (
      <FocusShell title={t('player.preparing')}>
        <div className="flex min-h-[60vh] items-center justify-center rounded-xl bg-black text-white">
          <p className="text-sm">{t('player.preparing')}</p>
        </div>
      </FocusShell>
    );
  }
  if (lessonQuery.isError || !lesson?.video) {
    return (
      <FocusShell title={t('player.notReadyTitle')}>
        <ErrorState error={lessonQuery.error} onRetry={() => void lessonQuery.refetch()} />
      </FocusShell>
    );
  }

  return (
    <ProtectedPlayer
      videoId={lesson.video.id}
      lessonId={lesson.id}
      courseId={lesson.courseId}
      title={lesson.title}
      resumeFrom={lesson.progress && lesson.progress.positionSeconds > 20 ? lesson.progress.positionSeconds : 0}
      rate={rate}
      captionsEnabled={captionsEnabled}
      onEnded={() => {
        if (autoplayNext && lesson.nextVideoId) router.replace(`/player/${lesson.nextVideoId}`);
        else close();
      }}
    />
  );
}

/**
 * One ticket request, exactly as the page has always made it. Shared by the
 * first load and by the playback session's recovery, so a recovered ticket
 * passes every server check a first ticket does.
 */
async function requestPlaybackTicket(videoId: string): Promise<PlaybackTicket> {
  // `platform` must reflect the real device: the backend switches to
  // FairPlay only for `ios`. Hardcoding 'web' handed Safari a Widevine
  // licence URL, and Safari - on iOS and on macOS alike - implements
  // FairPlay exclusively (lib/playback-platform.ts).
  // TEMPORARY hotfix: Safari web (iPhone, iPad and Mac) also opts in to
  // Gumlet's embed player (lib/gumlet-embed.ts); a backend that predates
  // the field rejects it, and the request is then repeated without it.
  const platform = detectPlaybackPlatform();
  const body = playbackTicketRequestBody(platform);
  const requestTicket = (payload: object) =>
    api.post<PlaybackTicket>(`playback/videos/${videoId}/ticket`, payload);
  return requestTicket(body).catch((e: unknown) => {
    if (body.delivery && isRejectedDeliveryField(e)) return requestTicket({ platform });
    throw e;
  });
}

function newTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function ProtectedPlayer({
  videoId,
  lessonId,
  courseId,
  title,
  resumeFrom,
  rate,
  captionsEnabled,
  onEnded,
}: {
  videoId: string;
  lessonId: string;
  courseId: string;
  title: string;
  resumeFrom: number;
  rate: number;
  captionsEnabled: boolean;
  onEnded: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [ticket, setTicket] = React.useState<PlaybackTicket | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [allowance, setAllowance] = React.useState<{ used: number; limit: number; remaining: number } | null>(null);
  const ticketRef = React.useRef<PlaybackTicket | null>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const queryClient = useQueryClient();

  // Playback session rollout (lib/playback-session-flag.ts). OFF by default:
  // with the flag unset every branch below behaves exactly as before.
  const { user } = useSession();
  const userId = user?.id ?? null;
  const userRole = user?.role ?? null;
  const computedSessionMode = React.useMemo(
    () =>
      resolvePlaybackSessionMode(
        readPlaybackSessionFlagEnv(),
        userId && userRole ? { id: userId, role: userRole } : null,
      ) === 'session',
    [userId, userRole],
  );
  // Latched once a ticket exists: a user record arriving or changing later must
  // never switch a lesson that is already playing between the two paths.
  const [latchedSessionMode, setLatchedSessionMode] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (ticket && latchedSessionMode === null) setLatchedSessionMode(computedSessionMode);
  }, [ticket, latchedSessionMode, computedSessionMode]);
  const sessionMode = latchedSessionMode ?? computedSessionMode;
  const sessionRef = React.useRef<PlaybackSession<PlaybackTicket> | null>(null);
  // The live session and its pending stop, so React StrictMode's dev-only
  // unmount/remount of the same ticket reuses the session instead of
  // releasing the ticket and starting over.
  const liveSessionRef = React.useRef<{
    ticket: PlaybackTicket;
    session: PlaybackSession<PlaybackTicket>;
    stopTimer: number | null;
  } | null>(null);
  // The element <DrmVideo> plays into (it owns its own <video>).
  const drmMediaRef = React.useRef<HTMLMediaElement | null>(null);
  const tabId = React.useMemo(newTabId, []);
  // Read when a session is created, never as effect dependencies: a lesson
  // change starts a new session only once its own ticket has loaded.
  const lessonIdRef = React.useRef(lessonId);
  lessonIdRef.current = lessonId;
  const videoIdRef = React.useRef(videoId);
  videoIdRef.current = videoId;

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current && frameRef.current !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void frame.requestFullscreen().catch(() => undefined);
  }, []);

  // Leaving the player shows fresh progress on the lesson and course pages,
  // as the mobile player does after it flushes.
  React.useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: qk.lessons.detail(lessonId) });
      void queryClient.invalidateQueries({ queryKey: qk.courses.detail(courseId) });
      void queryClient.invalidateQueries({ queryKey: qk.home.all });
    },
    [queryClient, lessonId, courseId]
  );
  const lastWallTimeRef = React.useRef<number | null>(null);
  const watchedAccumulatorRef = React.useRef(0);

  const handlePlay = React.useCallback(() => {
    lastWallTimeRef.current = performance.now();
  }, []);

  const handlePause = React.useCallback(() => {
    lastWallTimeRef.current = null;
  }, []);

  const handleSeeking = React.useCallback(() => {
    lastWallTimeRef.current = null;
  }, []);

  const handleSeeked = React.useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      lastWallTimeRef.current = performance.now();
    } else {
      lastWallTimeRef.current = null;
    }
  }, []);

  const handleTimeUpdate = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused || video.seeking) return;
    const now = performance.now();
    if (lastWallTimeRef.current !== null) {
      const elapsedSec = (now - lastWallTimeRef.current) / 1000;
      if (elapsedSec > 0 && elapsedSec < 3) {
        watchedAccumulatorRef.current += elapsedSec;
      }
    }
    lastWallTimeRef.current = now;
  }, []);

  const loadTicket = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tk, al] = await Promise.all([
        requestPlaybackTicket(videoId),
        api.get<{ used: number; limit: number; remaining: number }>(`playback/videos/${videoId}/allowance`).catch(() => null),
      ]);
      ticketRef.current = tk;
      setTicket(tk);
      setAllowance(al);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ code: 'UNKNOWN', status: 0, message: String(e) }));
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  React.useEffect(() => {
    void loadTicket();
  }, [loadTicket]);
  const loadTicketRef = React.useRef(loadTicket);
  loadTicketRef.current = loadTicket;

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !ticket) return;

    // --- DRM (Gumlet) path ------------------------------------------------
    // When the ticket is DRM-backed, `isDrmPlayback` renders <DrmVideo> instead
    // of this <video> element, so videoRef.current is null and this effect
    // returns here. hls.js cannot request a Widevine/FairPlay licence, so there
    // is deliberately no fallback into the branch below.
    if (isDrmPlayback) return;
    // --- legacy R2 / AES-128 HLS path -------------------------------------
    const url = ticket.manifestUrl;
    let hls: Hls | null = null;
    if (url.includes('.m3u8') && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }
    video.playbackRate = rate;
    if (resumeFrom > 0) {
      const onMeta = () => {
        try {
          video.currentTime = Math.min(resumeFrom, Math.max(0, video.duration - 15));
        } catch { /* ignore */ }
      };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
    }
    return () => {
      hls?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  // --- playback session (flag ON) -------------------------------------------
  // Heartbeats, renewal, revocation, watch time and progress for EVERY player
  // type (DRM, embed, legacy <video>). Keyed on the ticket from `loadTicket`
  // only: a renewal or recovery replaces `ticketRef`, never the `ticket` state,
  // so the player is never remounted and never asks for a new licence.
  React.useEffect(() => {
    if (!sessionMode || !ticket) return;
    const kind = gumletEmbedSrc(ticket) ? 'embed' : 'media';
    const stopHere = (code: ApiError['code'], message: string) => {
      setError(new ApiError({ code, status: 403, message }));
    };

    let session: PlaybackSession<PlaybackTicket>;
    // The session this effect created (if any), so its own release does not
    // make it re-assert itself.
    let created: PlaybackSession<PlaybackTicket> | null = null;
    const live = liveSessionRef.current;
    if (live && live.ticket === ticket && live.stopTimer !== null && !live.session.isStopped) {
      // StrictMode (dev) re-ran this effect for the same ticket: keep going.
      window.clearTimeout(live.stopTimer);
      live.stopTimer = null;
      session = live.session;
    } else {
      if (live && live.stopTimer !== null) {
        window.clearTimeout(live.stopTimer);
        void live.session.stop();
      }
      session = new PlaybackSession<PlaybackTicket>(
        ticket,
        {
          heartbeat: (id, body, signal) =>
            api.post<HeartbeatReply<PlaybackTicket>>(`playback/tickets/${id}/heartbeat`, body, { signal }),
          progress: (body) => api.post('progress', body),
          release: (id) => api.delete(`playback/tickets/${id}`),
          releaseOnUnload: (id) => {
            try {
              void fetch(`/api/proxy/playback/tickets/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                keepalive: true,
                credentials: 'same-origin',
                headers: { accept: 'application/json', [WEB_REQUEST_HEADER]: '1' },
              }).catch(() => undefined);
            } catch {
              /* unloading: best effort */
            }
          },
          // A release removes the browser's shared stream slot server-side:
          // tell the other tabs, and let a newer session in THIS tab (lesson
          // change) re-assert it at once.
          onReleased: () => {
            broadcastPlaybackReleased(tabId);
            const current = sessionRef.current;
            if (current && current !== created) current.reclaimAfterPeerRelease();
          },
          reissue: () => requestPlaybackTicket(videoIdRef.current),
          now: () => performance.now(),
          isVisible: () => document.visibilityState === 'visible',
          setInterval: (fn, ms) => window.setInterval(fn, ms),
          clearInterval: (handle) => window.clearInterval(handle as number),
          setTimeout: (fn, ms) => window.setTimeout(fn, ms),
          clearTimeout: (handle) => window.clearTimeout(handle as number),
        },
        {
          lessonId: lessonIdRef.current,
          kind,
          // Renewal: the session reports with the new ticket; the player keeps
          // its media and licence. Deliberately NOT setTicket.
          onTicket: (next) => {
            ticketRef.current = next;
          },
          onTerminate: (reason) => stopHere(terminationErrorCode(reason), reason),
        },
      );
      created = session;
      liveSessionRef.current = { ticket, session, stopTimer: null };
      session.start();
    }
    sessionRef.current = session;
    session.attachMedia(kind === 'media' ? (drmMediaRef.current ?? videoRef.current) : null);

    // Last tab wins: another tab of this browser starting a lesson stops this one.
    const lock = createPlaybackTabLock({
      channel: openPlaybackChannel(),
      tabId,
      onSuperseded: () => {
        if (sessionRef.current !== session) return;
        // Remembered as superseded, so a back/forward restore of this page does
        // not take playback back from the newer tab.
        void session.supersede();
        drmMediaRef.current?.pause();
        videoRef.current?.pause();
        stopHere('CONCURRENT_STREAM_LIMIT', 'Playing in another tab');
      },
      // Another tab released a ticket, which removed the shared slot: put it
      // back now, and once more shortly after (bounded; see the session).
      onPeerReleased: () => {
        if (sessionRef.current === session) session.reclaimAfterPeerRelease();
      },
    });
    lock.claim();

    // Closing the tab or reloading: React cleanup does not run, so hand the
    // ticket back with a keepalive request.
    const onPageHide = () => session.unload();
    window.addEventListener('pagehide', onPageHide);
    // Restored from the back/forward cache after that release: start over with
    // a fresh ticket rather than play on without a session. Only a session that
    // handed back a LIVE ticket on pagehide is restarted (`wasUnloaded`). A
    // revoked, refused or superseded session stays stopped with its message,
    // and the student restarts it explicitly; a parked one stays parked and
    // resumes through the normal play / visibility path.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && session.wasUnloaded && sessionRef.current === session) void loadTicketRef.current();
    };
    window.addEventListener('pageshow', onPageShow);
    // Visibility drives the Safari embed's idle release (its pause state is unknowable).
    const onVisibility = () => session.onVisibilityChange(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      lock.close();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
      if (sessionRef.current === session) sessionRef.current = null;
      const current = liveSessionRef.current;
      if (current && current.session === session) {
        // Deferred by a tick so a StrictMode re-run can take the session back.
        current.stopTimer = window.setTimeout(() => {
          if (liveSessionRef.current?.session === session) liveSessionRef.current = null;
          void session.stop();
        }, 0);
      } else {
        void session.stop();
      }
    };
  }, [sessionMode, ticket, tabId]);

  // --- legacy heartbeat (flag OFF): unchanged ---------------------------------
  React.useEffect(() => {
    if (!ticket || sessionMode) return;
    const id = ticket.ticketId;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const positionSeconds = Math.floor(video.currentTime);
      const watchedDeltaSeconds = Math.min(60, Math.round(watchedAccumulatorRef.current));
      watchedAccumulatorRef.current = 0;

      void api
        .post(`playback/tickets/${id}/heartbeat`, {
          positionSeconds,
          watchedDeltaSeconds,
          // secureSurface is deliberately OMITTED rather than sent as a constant.
          // No web API reports whether a <video> is rendering to a protected
          // surface: EME does not expose the negotiated security level, and
          // Safari has no equivalent of Android's FLAG_SECURE. Sending a
          // hardcoded `false` made the backend log INTEGRITY_FAILED at HIGH on
          // every heartbeat of every session on every platform, which fabricates
          // an integrity failure and buries real ones. Absent means "not
          // measured"; that is the honest signal.
          protection: { recording: false, externalDisplay: false },
        })
        .then((res: unknown) => {
          const r = res as { terminate?: { reason: string } | null; ticket?: PlaybackTicket };
          if (r?.terminate) {
            video.pause();
            setError(new ApiError({ code: 'PLAYBACK_DENIED', status: 403, message: r.terminate.reason }));
          } else if (r?.ticket) {
            ticketRef.current = r.ticket;
            setTicket(r.ticket);
          }
        })
        .catch(() => {});

      if (watchedDeltaSeconds > 0 || positionSeconds > 0) {
        void api.post(`progress`, { lessonId, positionSeconds, watchedSeconds: watchedDeltaSeconds }).catch(() => {});
      }
    }, Math.max(10, ticket.heartbeatIntervalSeconds || 30) * 1000);
    return () => clearInterval(interval);
  }, [ticket, lessonId, sessionMode]);

  // Legacy release-on-leave (flag OFF). With the flag ON the session's stop()
  // does this, after one last report.
  React.useEffect(() => {
    if (sessionMode) return;
    const video = videoRef.current;
    return () => {
      const id = ticketRef.current?.ticketId;
      if (id) void api.delete(`playback/tickets/${id}`).catch(() => {});
      if (video) {
        const positionSeconds = Math.floor(video.currentTime);
        const watchedDeltaSeconds = Math.min(60, Math.round(watchedAccumulatorRef.current));
        watchedAccumulatorRef.current = 0;
        if (watchedDeltaSeconds > 0) {
          void api.post(`progress`, { lessonId, positionSeconds, watchedSeconds: watchedDeltaSeconds }).catch(() => {});
        }
      }
    };
  }, [lessonId, sessionMode]);

  React.useEffect(() => {
    const onCopy = (e: ClipboardEvent) => e.preventDefault();
    const onContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContext);
    };
  }, []);

  // A ticket is DRM when the backend says so and handed us a licence to fetch.
  // hls.js cannot request a licence, so this must be decided before render.
  //
  // Deliberately NOT decided from the manifest extension alone: FairPlay is served
  // over HLS (Gumlet publishes no DASH FairPlay), and the legacy AES-128 path can
  // also carry a licence URL. See lib/drm-playback.ts.
  const isDrmPlayback = isDrmPlaybackTicket(ticket);
  // TEMPORARY playback hotfix: when the backend sends a signed Gumlet embed URL,
  // Gumlet's own player is used instead of DrmVideo. Null keeps today's routing.
  const embedSrc = gumletEmbedSrc(ticket);

  if (loading) {
    return (
      <FocusShell title={title}>
        <div className="flex min-h-[60vh] items-center justify-center rounded-xl bg-black text-white">
          <p className="text-sm">{t('player.authorizing')}</p>
        </div>
      </FocusShell>
    );
  }
  if (error || !ticket) {
    return (
      <FocusShell title={title}>
        <ErrorState error={error} onRetry={() => void loadTicket()} />
      </FocusShell>
    );
  }

  return (
    <FocusShell
      title={title}
      backHref={`/courses/${courseId}`}
      toolbar={
        allowance && allowance.remaining <= 1 ? (
          <span className="hidden rounded-md bg-warning/15 px-2 py-1 text-[11px] font-bold text-warning sm:inline">
            {t('player.lastPlayWarning')}
          </span>
        ) : null
      }
    >
      <div className="rounded-xl bg-black p-3 text-white sm:p-4">
        {allowance && allowance.remaining <= 1 ? (
          <p className="pb-3 text-center text-xs font-bold text-warning">{t('player.lastPlayWarning')}</p>
        ) : null}
        <div
          ref={frameRef}
          data-protected
          onDoubleClick={toggleFullscreen}
          className="relative mx-auto w-full max-w-5xl [&:fullscreen]:flex [&:fullscreen]:max-w-none [&:fullscreen]:items-center [&:fullscreen]:bg-black"
        >
          {embedSrc ? (
            // TEMPORARY playback hotfix: Gumlet's own player (lib/gumlet-embed.ts).
            // Only rendered when the backend issued a signed embed URL for this
            // ticket; otherwise the DRM / legacy players below are unchanged.
            <>
              <iframe
                src={embedSrc}
                title={title}
                className="aspect-video w-full rounded-lg bg-black"
                allow="encrypted-media; autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <Watermark
                primary={ticket.watermark.primary}
                secondary={ticket.watermark.secondary}
                opacity={ticket.watermark.opacity}
                intervalMs={Math.max(5, ticket.watermark.moveIntervalSeconds || 12) * 1000}
              />
            </>
          ) : isDrmPlayback ? (
            <DrmVideo
              manifestUrl={ticket.manifestUrl}
              drm={{
                licenseUrl: ticket.drm.licenseUrl,
                certificateUrl: ticket.drm.certificateUrl,
                scheme: ticket.drm.scheme,
              }}
              captions={ticket.captions}
              captionsEnabled={captionsEnabled}
              watermark={ticket.watermark}
              {...(sessionMode
                ? {
                    onMediaElement: (element: HTMLMediaElement | null) => {
                      drmMediaRef.current = element;
                      sessionRef.current?.attachMedia(element);
                    },
                    onPlayback: () => sessionRef.current?.onPlaying(),
                    onPause: () => sessionRef.current?.onPause(),
                    onTimeUpdate: () => sessionRef.current?.onTimeUpdate(),
                    onSeeking: () => sessionRef.current?.onSeeking(),
                    onSeeked: () => sessionRef.current?.onSeeked(),
                    onWaiting: () => sessionRef.current?.onWaiting(),
                  }
                : {})}
              onEnded={() => {
                if (sessionMode) {
                  // The real end position and the last watched seconds, through
                  // one final beat so the server observes them before progress.
                  void sessionRef.current?.ended();
                  onEnded();
                  return;
                }
                const watchedDeltaSeconds = Math.min(60, Math.round(watchedAccumulatorRef.current));
                watchedAccumulatorRef.current = 0;
                if (watchedDeltaSeconds > 0) {
                  void api.post('progress', { lessonId, positionSeconds: 0, watchedSeconds: watchedDeltaSeconds }).catch(() => {});
                }
                onEnded();
              }}
              onError={(reason) => {
                // `reason` is a STABLE, SANITISED stage code assembled in
                // DrmVideo - e.g. DRM_FAIRPLAY_FP_NO_SKD_URI,
                // DRM_LICENCE_LICENSE_RESPONSE_REJECTED. It contains no URL,
                // token, certificate, cookie or payload.
                //
                // This used to be discarded outright, which is why production
                // logs showed no DRM stage at all and the only server-side DRM
                // signal was the unrelated INTEGRITY_FAILED line. Keep it: it is
                // the only way to tell a certificate failure from a licence
                // contract failure on a real device.
                console.error(`[drm] stage=${reason}`);
              }}
            />
          ) : (
            <>
              <video
                ref={videoRef}
                controls
                playsInline
                controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
                disablePictureInPicture
                disableRemotePlayback
                onContextMenu={(e) => e.preventDefault()}
                className="aspect-video w-full select-none rounded-lg bg-black"
                onPlay={sessionMode ? () => sessionRef.current?.onPlaying() : handlePlay}
                onPause={sessionMode ? () => sessionRef.current?.onPause() : handlePause}
                onSeeking={sessionMode ? () => sessionRef.current?.onSeeking() : handleSeeking}
                onSeeked={sessionMode ? () => sessionRef.current?.onSeeked() : handleSeeked}
                onTimeUpdate={sessionMode ? () => sessionRef.current?.onTimeUpdate() : handleTimeUpdate}
                onWaiting={sessionMode ? () => sessionRef.current?.onWaiting() : undefined}
                onEnded={() => {
                  if (sessionMode) {
                    void sessionRef.current?.ended();
                    onEnded();
                    return;
                  }
                  const video = videoRef.current;
                  if (video) {
                    const positionSeconds = Math.floor(video.currentTime);
                    const watchedDeltaSeconds = Math.min(60, Math.round(watchedAccumulatorRef.current));
                    watchedAccumulatorRef.current = 0;
                    if (watchedDeltaSeconds > 0) {
                      void api.post('progress', { lessonId, positionSeconds, watchedSeconds: watchedDeltaSeconds }).catch(() => {});
                    }
                  }
                  onEnded();
                }}
                crossOrigin="anonymous"
              >
                {captionsEnabled
                  ? ticket.captions.map((c) => (
                      <track key={c.language} kind="subtitles" srcLang={c.language} label={c.label} src={c.url} default={c.isDefault} />
                    ))
                  : null}
              </video>
              <Watermark
                primary={ticket.watermark.primary}
                secondary={ticket.watermark.secondary}
                opacity={ticket.watermark.opacity}
                intervalMs={Math.max(5, ticket.watermark.moveIntervalSeconds || 12) * 1000}
              />
            </>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
            className="absolute end-3 top-3 z-20 cursor-pointer rounded-md bg-black/50 px-2 py-1 text-[11px] font-semibold text-white hover:bg-black/70"
          >
            {isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
          </button>
        </div>
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-4 px-4 pt-3 text-xs text-white/70">
          <button
            className="cursor-pointer underline"
            onClick={() => { const v = sessionMode ? (drmMediaRef.current ?? videoRef.current) : videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); }}
          >
            -10s
          </button>
          <span>{formatTimecode(resumeFrom)} →</span>
          <button
            className="cursor-pointer underline"
            onClick={() => { const v = sessionMode ? (drmMediaRef.current ?? videoRef.current) : videoRef.current; if (v) v.currentTime += 10; }}
          >
            +10s
          </button>
        </div>
        <p className="px-4 pt-2 text-center text-[11px] text-white/60">{t('player.protectedNotice')}</p>
      </div>
    </FocusShell>
  );
}
