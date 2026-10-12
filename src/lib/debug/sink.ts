/**
 * A single, tiny sink the player writes redacted records into.
 *
 * The player must not know whether a debug console is attached: that decision
 * belongs to `DebugBoot`, which only ever attaches on an authorised Preview
 * build. So the sink starts as `null` and every call is a no-op.
 *
 * `emit` never throws. A failure in a debug console must not be able to take
 * playback down with it.
 */

import type { DebugRecord } from './gate';

type Sink = (record: DebugRecord) => void;

let sink: Sink | null = null;

/** Attach (or detach, with `null`) the console sink. */
export function setDebugSink(next: Sink | null): void {
  sink = next;
}

/** True when a console is currently attached. */
export function debugSinkAttached(): boolean {
  return sink !== null;
}

/** Publish one redacted record. Safe to call unconditionally. */
export function emit(record: DebugRecord): void {
  if (!sink) return;
  try {
    sink(record);
  } catch {
    // A debug console failure must never affect playback.
  }
}
