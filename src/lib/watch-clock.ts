/**
 * Watched-time accounting for the web player.
 *
 * Only time that a student actually spent watching content advance on screen
 * is credited. Each sample compares the wall clock with the media clock since
 * the previous sample and credits the SMALLER of the two, and only when both
 * moved forward by a plausible step. That rules out, without special cases:
 *
 *   paused          the media clock does not advance           -> nothing
 *   buffering       the media clock does not advance           -> nothing
 *   seeking         a seek resets the baseline; a jump without
 *                   a seek event is larger than one step       -> nothing
 *   fast playback   media advances faster than the wall clock  -> wall time
 *   background tab  samples are ignored while hidden           -> nothing
 *   a frozen tab    the wall gap is larger than one step       -> nothing
 *
 * The server stays the authority: it caps every heartbeat delta and only
 * credits progress it observed through heartbeats. This only keeps the client
 * from claiming time it cannot justify.
 */

export interface WatchSample {
  wallMs: number;
  mediaTime: number;
  paused: boolean;
  seeking: boolean;
  visible: boolean;
}

export class WatchClock {
  private lastWallMs: number | null = null;
  private lastMediaTime: number | null = null;
  private credited = 0;
  private readonly maxStepSeconds: number;

  /** `maxStepSeconds` bounds one sample; `timeupdate` fires every ~0.25 s. */
  constructor(maxStepSeconds = 3) {
    this.maxStepSeconds = maxStepSeconds;
  }

  /** Forget the baseline (play/pause/seek/stall boundaries). Credit is kept. */
  reset(): void {
    this.lastWallMs = null;
    this.lastMediaTime = null;
  }

  sample(s: WatchSample): void {
    if (s.paused || s.seeking || !s.visible || !Number.isFinite(s.mediaTime) || !Number.isFinite(s.wallMs)) {
      this.reset();
      return;
    }
    if (this.lastWallMs !== null && this.lastMediaTime !== null) {
      const wall = (s.wallMs - this.lastWallMs) / 1000;
      const media = s.mediaTime - this.lastMediaTime;
      // A fast playback rate legitimately advances media faster than the wall
      // clock; allow it (we credit wall time anyway) but never a jump.
      if (wall > 0 && media > 0 && wall <= this.maxStepSeconds && media <= this.maxStepSeconds * 2) {
        this.credited += Math.min(wall, media);
      }
    }
    this.lastWallMs = s.wallMs;
    this.lastMediaTime = s.mediaTime;
  }

  /** Whole seconds credited and not yet reported (the fraction stays). */
  get pendingSeconds(): number {
    return Math.floor(this.credited);
  }

  /** Take up to `max` whole seconds for a report; the rest stays banked. */
  take(max: number): number {
    const whole = Math.max(0, Math.min(Math.floor(max), Math.floor(this.credited)));
    this.credited -= whole;
    return whole;
  }

  /** Give back seconds whose report did not reach the server. */
  restore(seconds: number): void {
    if (seconds > 0 && Number.isFinite(seconds)) this.credited += seconds;
  }
}
