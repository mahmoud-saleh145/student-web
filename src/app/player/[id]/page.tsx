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
import { qk } from '@/lib/query-keys';
import { useTranslation } from '@/lib/session-context';
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
        api.post<PlaybackTicket>(`playback/videos/${videoId}/ticket`, {
          // Must reflect the real device: the backend switches to FairPlay only
          // for `ios`. Hardcoding 'web' handed Safari a Widevine licence URL,
          // and iOS implements FairPlay exclusively.
          platform: detectPlaybackPlatform(),
        }),
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

  React.useEffect(() => {
    if (!ticket) return;
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
          protection: { secureSurface: false, recording: false, externalDisplay: false },
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
  }, [ticket, lessonId]);

  React.useEffect(() => {
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
  }, [lessonId]);

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

  // A ticket is DRM when the backend says so and it points at a DASH manifest.
  // hls.js cannot request a licence, so this must be decided before render.
  const isDrmPlayback =
    Boolean(ticket) && ticket!.drm.scheme !== 'none' && Boolean(ticket!.drm.licenseUrl) && /\.mpd(\?|$)/i.test(ticket!.manifestUrl);

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
          {isDrmPlayback ? (
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
              onEnded={() => {
                const watchedDeltaSeconds = Math.min(60, Math.round(watchedAccumulatorRef.current));
                watchedAccumulatorRef.current = 0;
                if (watchedDeltaSeconds > 0) {
                  void api.post('progress', { lessonId, positionSeconds: 0, watchedSeconds: watchedDeltaSeconds }).catch(() => {});
                }
                onEnded();
              }}
              onError={() => {
                // Fatal for this lesson by design: we never fall back to an
                // unprotected stream. The reason is rendered inside the player.
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
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeking={handleSeeking}
                onSeeked={handleSeeked}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
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
            onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); }}
          >
            -10s
          </button>
          <span>{formatTimecode(resumeFrom)} →</span>
          <button
            className="cursor-pointer underline"
            onClick={() => { const v = videoRef.current; if (v) v.currentTime += 10; }}
          >
            +10s
          </button>
        </div>
        <p className="px-4 pt-2 text-center text-[11px] text-white/60">{t('player.protectedNotice')}</p>
      </div>
    </FocusShell>
  );
}
