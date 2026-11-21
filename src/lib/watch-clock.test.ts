import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WatchClock, type WatchSample } from './watch-clock.ts';

/** Plays `seconds` of normal playback in 250 ms steps from `start`. */
function play(clock: WatchClock, start: { wallMs: number; mediaTime: number }, seconds: number, over: Partial<WatchSample> = {}) {
  let wallMs = start.wallMs;
  let mediaTime = start.mediaTime;
  for (let i = 0; i < seconds * 4; i += 1) {
    wallMs += 250;
    mediaTime += 0.25;
    clock.sample({ wallMs, mediaTime, paused: false, seeking: false, visible: true, ...over });
  }
  return { wallMs, mediaTime };
}

const at0 = { wallMs: 0, mediaTime: 0 };

describe('WatchClock', () => {
  it('credits real playback', () => {
    const clock = new WatchClock();
    clock.sample({ ...at0, paused: false, seeking: false, visible: true });
    play(clock, at0, 30);
    assert.equal(clock.pendingSeconds, 30);
  });

  it('never credits a pause', () => {
    const clock = new WatchClock();
    let pos = play(clock, at0, 10);
    // 120 s on pause: the media clock stands still.
    for (let i = 0; i < 480; i += 1) {
      pos = { wallMs: pos.wallMs + 250, mediaTime: pos.mediaTime };
      clock.sample({ ...pos, paused: true, seeking: false, visible: true });
    }
    assert.equal(clock.pendingSeconds, 9);
  });

  it('never credits buffering (media time not advancing while "playing")', () => {
    const clock = new WatchClock();
    let pos = play(clock, at0, 5);
    for (let i = 0; i < 240; i += 1) {
      pos = { wallMs: pos.wallMs + 250, mediaTime: pos.mediaTime };
      clock.sample({ ...pos, paused: false, seeking: false, visible: true });
    }
    assert.equal(clock.pendingSeconds, 4);
  });

  it('cannot be inflated by seeking forward or backward', () => {
    const clock = new WatchClock();
    let pos = play(clock, at0, 4);
    // Jump 30 minutes ahead with no seek event at all.
    pos = { wallMs: pos.wallMs + 250, mediaTime: pos.mediaTime + 1800 };
    clock.sample({ ...pos, paused: false, seeking: false, visible: true });
    // Scrub back and forth while seeking.
    for (let i = 0; i < 40; i += 1) {
      pos = { wallMs: pos.wallMs + 250, mediaTime: i % 2 ? pos.mediaTime + 600 : pos.mediaTime - 300 };
      clock.sample({ ...pos, paused: false, seeking: true, visible: true });
    }
    assert.equal(clock.pendingSeconds, 3);
  });

  it('credits wall time, not media time, at a faster playback rate', () => {
    const clock = new WatchClock();
    let wallMs = 0;
    let mediaTime = 0;
    clock.sample({ wallMs, mediaTime, paused: false, seeking: false, visible: true });
    for (let i = 0; i < 40; i += 1) {
      wallMs += 250;
      mediaTime += 0.5; // 2x speed
      clock.sample({ wallMs, mediaTime, paused: false, seeking: false, visible: true });
    }
    assert.equal(clock.pendingSeconds, 10);
  });

  it('never credits time while the tab is hidden, or a frozen-tab gap', () => {
    const clock = new WatchClock();
    let pos = play(clock, at0, 2);
    pos = play(clock, pos, 60, { visible: false });
    // The tab was frozen for 5 minutes, then one sample arrives.
    pos = { wallMs: pos.wallMs + 300_000, mediaTime: pos.mediaTime + 300 };
    clock.sample({ ...pos, paused: false, seeking: false, visible: true });
    assert.equal(clock.pendingSeconds, 1);
  });

  it('take() reports whole seconds, caps them, and restore() gives them back', () => {
    const clock = new WatchClock();
    clock.sample({ ...at0, paused: false, seeking: false, visible: true });
    play(clock, at0, 90);
    assert.equal(clock.take(60), 60);
    assert.equal(clock.pendingSeconds, 30);
    clock.restore(60);
    assert.equal(clock.pendingSeconds, 90);
    assert.equal(clock.take(1000), 90);
    assert.equal(clock.take(60), 0);
  });
});
