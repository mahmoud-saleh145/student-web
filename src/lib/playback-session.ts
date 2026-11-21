/**
 * The web player's playback session: heartbeats, ticket renewal, revocation,
 * watch time and progress - independent of which player is on screen.
 *
 * WHY THIS EXISTS
 *
 * The player page used to run its heartbeat only while the legacy <video>
 * element was mounted (`if (!videoRef.current) return`). Every production web
 * ticket renders <DrmVideo> or the Gumlet embed instead, so no heartbeat was
 * ever sent: the server could not renew or revoke a web ticket, keep the
 * single-stream slot, count a play's watched seconds (so the three-play limit
 * never applied), or credit lesson progress.
 *
 * WHAT IT GUARANTEES
 *
 *   - One heartbeat in flight at a time, each with a timeout. Anyone who needs
 *     the server to have seen the last report (the end of the video, leaving)
 *     waits for the beat in flight before reporting or releasing, so a release
 *     can never overtake the final report.
 *   - Ticket renewal (the server's rotation) and recovery only replace the
 *     ticket the session reports with (`onTicket`). They never touch the
 *     player, so renewal causes no remount and no new DRM licence request.
 *   - A ticket that lapsed (expired while the network was down, or a rotation
 *     whose answer was lost) is replaced once through the normal ticket
 *     request, which re-runs every server check. The server's 45-minute play
 *     continuation makes that the same play, not a new one. Anything else the
 *     server refuses - revoked, refused, capture, a client error - ends
 *     playback. Transient failures are retried, but not forever.
 *   - Watched time comes from WatchClock: pauses, buffering, seeking and
 *     hidden tabs are never credited. Seconds are re-sent only when the
 *     failed report certainly never reached the server, so a report the
 *     server recorded but whose answer was lost is never credited twice.
 *   - A player left paused for `idleReleaseMs` gives its ticket back, so an
 *     open tab does not hold the student's single stream for hours. Pressing
 *     play again asks for a new ticket through the full request.
 *   - It never logs or surfaces a ticket id, URL or token.
 *
 * This module is framework-free so it can be tested under `node --test`; the
 * page owns the React wiring.
 */

import { WatchClock } from './watch-clock.ts';

export interface SessionTicket {
  ticketId: string;
  heartbeatIntervalSeconds?: number;
  resumePositionSeconds?: number;
}

export interface HeartbeatReply<T extends SessionTicket> {
  ok?: boolean;
  terminate?: { reason: string } | null;
  ticket?: T | null;
}

export interface HeartbeatBody {
  positionSeconds: number;
  watchedDeltaSeconds: number;
  protection: { recording: false; externalDisplay: false };
}

export interface ProgressBody {
  lessonId: string;
  positionSeconds: number;
  watchedSeconds: number;
}

/** The slice of HTMLMediaElement the session reads. */
export interface SessionMedia {
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  pause(): void;
}

export interface PlaybackSessionDeps<T extends SessionTicket> {
  heartbeat(ticketId: string, body: HeartbeatBody, signal: AbortSignal): Promise<HeartbeatReply<T>>;
  progress(body: ProgressBody): Promise<unknown>;
  release(ticketId: string): Promise<unknown>;
  /** Fire-and-forget release that survives the page unloading (keepalive). */
  releaseOnUnload?(ticketId: string): void;
  /** A brand-new ticket through the full ticket request (every server check). */
  reissue(): Promise<T>;
  now(): number;
  isVisible(): boolean;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PlaybackSessionOptions<T extends SessionTicket> {
  lessonId: string;
  /** `embed`: Gumlet's iframe player - no media element, no watched time. */
  kind: 'media' | 'embed';
  onTicket(ticket: T): void;
  onTerminate(reason: string): void;
  heartbeatTimeoutMs?: number;
  /** Minimum gap between two recovery re-issues. */
  reissueCooldownMs?: number;
  /** Paused this long (media players only): give the ticket back. */
  idleReleaseMs?: number;
  /** This many transient failures in a row end playback. */
  maxConsecutiveFailures?: number;
}

/**
 * Server terminations that mean "this ticket is over", not "this student may
 * not watch": an expired ticket (`PLAYBACK_TICKET_EXPIRED`, also used after the
 * server reclaimed a silent session) and a ticket the server already released
 * because it rotated it while our copy of the answer was lost. Both are
 * recovered by asking for a new ticket, which repeats every check.
 */
export const RECOVERABLE_TERMINATIONS: ReadonlySet<string> = new Set([
  'PLAYBACK_TICKET_EXPIRED',
  'Playback session already ended',
]);

/** Error codes the api client uses when a request never reached the server. */
const NOT_SENT_CODES: ReadonlySet<string> = new Set(['NETWORK_OFFLINE', 'SERVER_UNREACHABLE']);

export const MAX_WATCHED_DELTA_PER_BEAT = 60;
export const MIN_HEARTBEAT_INTERVAL_SECONDS = 10;
export const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30;
export const DEFAULT_IDLE_RELEASE_MS = 10 * 60_000;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 10;

class HeartbeatTimeout extends Error {}

type FailureKind = 'not-sent' | 'unknown' | 'refused';

function classify(error: unknown): { kind: FailureKind; code: string | null } {
  if (error instanceof HeartbeatTimeout) return { kind: 'unknown', code: 'NETWORK_TIMEOUT' };
  const e = error as { code?: unknown; status?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : null;
  const status = typeof e?.status === 'number' ? e.status : 0;
  if (code && NOT_SENT_CODES.has(code)) return { kind: 'not-sent', code };
  // A 4xx is the server's answer about this ticket or this user (expired row,
  // forbidden, signed out). 408/429 are "try again".
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { kind: 'refused', code: code ?? 'PLAYBACK_DENIED' };
  }
  // 5xx, 408, 429, or anything unrecognised: the server may have recorded it.
  return { kind: 'unknown', code: code ?? 'SERVER_ERROR' };
}

export class PlaybackSession<T extends SessionTicket> {
  private ticket: T;
  private media: SessionMedia | null = null;
  private readonly clock = new WatchClock();
  private interval: unknown = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private terminated = false;
  private released = false;
  private parked = false;
  private resuming = false;
  private lastReissueAt: number | null = null;
  private lastActiveAt: number;
  private lastKnownPosition: number;
  private failures = 0;
  private readonly deps: PlaybackSessionDeps<T>;
  private readonly opts: PlaybackSessionOptions<T>;

  constructor(ticket: T, deps: PlaybackSessionDeps<T>, opts: PlaybackSessionOptions<T>) {
    this.deps = deps;
    this.opts = opts;
    this.ticket = ticket;
    this.lastKnownPosition = Math.max(0, Math.floor(ticket.resumePositionSeconds ?? 0));
    this.lastActiveAt = deps.now();
  }

  /** Current ticket id - for the page's release-on-leave and controls only. */
  get currentTicketId(): string {
    return this.ticket.ticketId;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** True while an idle player has given its ticket back. */
  get isParked(): boolean {
    return this.parked;
  }

  start(): void {
    if (this.stopped || this.interval !== null) return;
    const seconds = Math.max(
      MIN_HEARTBEAT_INTERVAL_SECONDS,
      this.ticket.heartbeatIntervalSeconds || DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
    );
    this.interval = this.deps.setInterval(() => void this.beat(), seconds * 1000);
  }

  attachMedia(media: SessionMedia | null): void {
    this.media = media;
    this.clock.reset();
  }

  // --- media events -------------------------------------------------------
  // Every event re-reads the element, so a stale event cannot credit time.

  onPlaying(): void {
    this.lastActiveAt = this.deps.now();
    if (this.parked) void this.resume();
    this.clock.reset();
    this.sample();
  }

  onPause(): void {
    this.sample();
    this.clock.reset();
  }

  onSeeking(): void {
    this.clock.reset();
  }

  onSeeked(): void {
    this.clock.reset();
    this.sample();
  }

  onWaiting(): void {
    this.clock.reset();
  }

  onTimeUpdate(): void {
    this.sample();
  }

  private sample(): void {
    const media = this.media;
    if (!media || this.opts.kind === 'embed') return;
    this.lastKnownPosition = Math.max(0, Math.floor(media.currentTime || 0));
    if (!media.paused) this.lastActiveAt = this.deps.now();
    this.clock.sample({
      wallMs: this.deps.now(),
      mediaTime: media.currentTime,
      paused: media.paused,
      seeking: media.seeking,
      visible: this.deps.isVisible(),
    });
  }

  private position(): number {
    const media = this.media;
    if (media && this.opts.kind === 'media' && Number.isFinite(media.currentTime)) {
      this.lastKnownPosition = Math.max(0, Math.floor(media.currentTime));
    }
    return this.lastKnownPosition;
  }

  private isIdle(): boolean {
    if (this.opts.kind !== 'media') return false; // the embed's state is unknowable
    const media = this.media;
    if (media && !media.paused) return false;
    return this.deps.now() - this.lastActiveAt >= (this.opts.idleReleaseMs ?? DEFAULT_IDLE_RELEASE_MS);
  }

  /** Resolves once no heartbeat is in flight (including one started meanwhile). */
  private async settle(): Promise<void> {
    while (this.inFlight) {
      await this.inFlight.catch(() => undefined);
    }
  }

  /**
   * One heartbeat. `final` is the last report of a session that is ending
   * (video ended, page left): it still runs after `stop()`, and its progress
   * is still posted, but a rotation it receives is given straight back.
   * Returns the beat already in flight, if any, so callers can wait for it.
   */
  beat(options: { final?: boolean } = {}): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.released || this.terminated || this.parked) return Promise.resolve();
    if (this.stopped && !options.final) return Promise.resolve();
    if (!options.final && this.isIdle()) {
      this.inFlight = this.park().finally(() => {
        this.inFlight = null;
      });
      return this.inFlight;
    }
    this.inFlight = this.runBeat(options.final === true).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runBeat(final: boolean): Promise<void> {
    const ticketId = this.ticket.ticketId;
    const positionSeconds = this.position();
    const watchedDeltaSeconds = this.clock.take(MAX_WATCHED_DELTA_PER_BEAT);

    let reply: HeartbeatReply<T>;
    try {
      reply = await this.withTimeout((signal) =>
        this.deps.heartbeat(
          ticketId,
          { positionSeconds, watchedDeltaSeconds, protection: { recording: false, externalDisplay: false } },
          signal,
        ),
      );
    } catch (error) {
      const { kind, code } = classify(error);
      if (kind === 'not-sent') this.clock.restore(watchedDeltaSeconds);
      if (kind === 'refused') {
        if (!this.stopped) await this.handleTermination(code ?? 'PLAYBACK_DENIED');
        return;
      }
      this.failures += 1;
      const max = this.opts.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
      if (!this.stopped && this.failures >= max) this.terminate(code ?? 'SERVER_ERROR');
      return;
    }
    this.failures = 0;

    if (this.stopped) {
      // The page left during this beat. A rotation minted in the meantime
      // is given straight back rather than left to expire.
      if (reply?.ticket?.ticketId && reply.ticket.ticketId !== ticketId) {
        void this.deps.release(reply.ticket.ticketId).catch(() => undefined);
      }
      if (final && !reply?.terminate && (watchedDeltaSeconds > 0 || positionSeconds > 0)) {
        await this.deps
          .progress({ lessonId: this.opts.lessonId, positionSeconds, watchedSeconds: watchedDeltaSeconds })
          .catch(() => undefined);
      }
      return;
    }

    if (reply?.terminate) {
      // A terminated beat credited nothing.
      this.clock.restore(watchedDeltaSeconds);
      await this.handleTermination(reply.terminate.reason);
      return;
    }

    if (reply?.ticket && reply.ticket.ticketId) {
      // Server-side rotation: report with the new ticket from now on. The
      // player is deliberately not told - it keeps its media and licence.
      this.ticket = reply.ticket;
      this.opts.onTicket(reply.ticket);
    }

    if (watchedDeltaSeconds > 0 || positionSeconds > 0) {
      // After the beat, so the server has already observed this watch time
      // when it decides how much of the progress claim to credit.
      const posting = this.deps
        .progress({ lessonId: this.opts.lessonId, positionSeconds, watchedSeconds: watchedDeltaSeconds })
        .catch(() => undefined);
      if (final) await posting;
    }
  }

  private async handleTermination(reason: string): Promise<void> {
    const now = this.deps.now();
    const cooldown = this.opts.reissueCooldownMs ?? 60_000;
    const mayRecover =
      RECOVERABLE_TERMINATIONS.has(reason) &&
      (this.lastReissueAt === null || now - this.lastReissueAt >= cooldown);

    if (mayRecover) {
      this.lastReissueAt = now;
      try {
        const fresh = await this.deps.reissue();
        if (this.stopped) {
          // The page left while we were recovering: give the new grant back.
          void this.deps.release(fresh.ticketId).catch(() => undefined);
          return;
        }
        this.ticket = fresh;
        this.opts.onTicket(fresh);
        return;
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        this.terminate(typeof code === 'string' && code ? code : reason);
        return;
      }
    }
    this.terminate(reason);
  }

  /** Idle: stop beating and give the ticket back; play again resumes. */
  private async park(): Promise<void> {
    this.parked = true;
    this.clearTimer();
    await this.deps.release(this.ticket.ticketId).catch(() => undefined);
  }

  private async resume(): Promise<void> {
    if (!this.parked || this.resuming || this.stopped) return;
    this.resuming = true;
    try {
      const fresh = await this.deps.reissue();
      if (this.stopped) {
        void this.deps.release(fresh.ticketId).catch(() => undefined);
        return;
      }
      this.ticket = fresh;
      this.parked = false;
      this.failures = 0;
      this.lastActiveAt = this.deps.now();
      this.opts.onTicket(fresh);
      this.start();
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      // Parked means our ticket is already released: nothing left to release.
      this.released = true;
      this.terminate(typeof code === 'string' && code ? code : 'PLAYBACK_DENIED');
    } finally {
      this.resuming = false;
    }
  }

  private terminate(reason: string): void {
    if (this.terminated) return;
    this.terminated = true;
    this.stopped = true;
    this.clearTimer();
    try {
      this.media?.pause();
    } catch {
      /* element already gone */
    }
    this.opts.onTerminate(reason);
  }

  /**
   * End of the video: report the real position and the remaining watched time
   * through one last beat (so the server observes it before progress). Waits
   * for any beat in flight first, so nothing is reported out of order.
   */
  async ended(): Promise<void> {
    this.sample();
    await this.settle();
    await this.beat({ final: true });
  }

  /**
   * Leaving the player. Idempotent. Waits for the report in flight, sends what
   * is still banked, and only then releases the ticket - a release must never
   * reach the server before the last report. Release does not close the play
   * on the server, so coming back within 45 minutes is the same play.
   */
  async stop(): Promise<void> {
    if (this.stopped) {
      await this.settle();
      return;
    }
    this.sample();
    this.stopped = true;
    this.clearTimer();
    await this.settle();
    if (!this.parked && !this.terminated && this.clock.pendingSeconds > 0) {
      await this.beat({ final: true }).catch(() => undefined);
    }
    // `ended()` may have started its final report meanwhile: the release must
    // still come after it.
    await this.settle();
    await this.releaseOnce();
  }

  /**
   * The page is being unloaded (tab closed, reload, navigation away from the
   * app). Nothing asynchronous can be awaited any more: hand the ticket back
   * with a keepalive request so the stream slot is freed at once.
   */
  unload(): void {
    if (this.released || this.parked || this.terminated) return;
    this.stopped = true;
    this.clearTimer();
    this.released = true;
    this.deps.releaseOnUnload?.(this.ticket.ticketId);
  }

  private async releaseOnce(): Promise<void> {
    if (this.released || this.parked || this.terminated) return;
    this.released = true;
    await this.deps.release(this.ticket.ticketId).catch(() => undefined);
  }

  private clearTimer(): void {
    if (this.interval !== null) {
      this.deps.clearInterval(this.interval);
      this.interval = null;
    }
  }

  private withTimeout<R>(run: (signal: AbortSignal) => Promise<R>): Promise<R> {
    const controller = new AbortController();
    const ms = this.opts.heartbeatTimeoutMs ?? 15_000;
    return new Promise<R>((resolve, reject) => {
      const timer = this.deps.setTimeout(() => {
        controller.abort();
        reject(new HeartbeatTimeout('heartbeat timed out'));
      }, ms);
      run(controller.signal).then(
        (value) => {
          this.deps.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          this.deps.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
