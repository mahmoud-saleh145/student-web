import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PlaybackSession,
  type HeartbeatBody,
  type HeartbeatReply,
  type ProgressBody,
  type SessionMedia,
  type SessionTicket,
} from './playback-session.ts';

// ---------------------------------------------------------------------------
// A deterministic fake world: a manual clock, manual timers, a fake media
// element, and a scripted server.
// ---------------------------------------------------------------------------

type Ticket = SessionTicket & { manifestUrl: string };
type Reply = HeartbeatReply<Ticket>;

const ticket = (id: string, extra: Partial<Ticket> = {}): Ticket => ({
  ticketId: id,
  manifestUrl: `https://cdn.example/${id}/main.mpd`,
  heartbeatIntervalSeconds: 30,
  resumePositionSeconds: 0,
  ...extra,
});

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
};

function world(
  options: { kind?: 'media' | 'embed'; first?: Ticket; timeoutMs?: number; idleReleaseMs?: number; maxFailures?: number } = {},
) {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; every: number | null; fn: () => void }>();
  const heartbeats: { id: string; body: HeartbeatBody; signal: AbortSignal }[] = [];
  const progress: ProgressBody[] = [];
  const releases: string[] = [];
  const tickets: Ticket[] = [];
  const terminations: string[] = [];
  const log: string[] = [];
  const unloadReleases: string[] = [];
  let reissues = 0;
  let visible = true;

  // Scripted server: each heartbeat takes the next scripted answer, or OK.
  const script: (() => Promise<Reply>)[] = [];
  let reissueImpl: () => Promise<Ticket> = async () => ticket(`re-${reissues}`);

  const media: SessionMedia & { playing: boolean } = {
    currentTime: 0,
    paused: true,
    seeking: false,
    playing: false,
    pause() {
      this.paused = true;
      this.playing = false;
    },
  };

  const session = new PlaybackSession<Ticket>(
    options.first ?? ticket('t1'),
    {
      heartbeat: (id, body, signal) => {
        heartbeats.push({ id, body, signal });
        log.push(`hb:${id}`);
        const next = script.shift();
        const answer = next ? next() : Promise.resolve<Reply>({ ok: true, terminate: null });
        return answer.then((r) => {
          log.push(`hb-done:${id}`);
          return r;
        });
      },
      progress: async (body) => {
        progress.push(body);
      },
      release: async (id) => {
        releases.push(id);
        log.push(`release:${id}`);
      },
      releaseOnUnload: (id) => {
        unloadReleases.push(id);
      },
      reissue: () => {
        reissues += 1;
        return reissueImpl();
      },
      now: () => now,
      isVisible: () => visible,
      setInterval: (fn, ms) => {
        const h = nextHandle++;
        timers.set(h, { at: now + ms, every: ms, fn });
        return h;
      },
      clearInterval: (h) => void timers.delete(h as number),
      setTimeout: (fn, ms) => {
        const h = nextHandle++;
        timers.set(h, { at: now + ms, every: null, fn });
        return h;
      },
      clearTimeout: (h) => void timers.delete(h as number),
    },
    {
      lessonId: 'lesson-1',
      kind: options.kind ?? 'media',
      heartbeatTimeoutMs: options.timeoutMs ?? 15_000,
      ...(options.idleReleaseMs !== undefined ? { idleReleaseMs: options.idleReleaseMs } : {}),
      ...(options.maxFailures !== undefined ? { maxConsecutiveFailures: options.maxFailures } : {}),
      onTicket: (t) => tickets.push(t),
      onTerminate: (reason) => terminations.push(reason),
    },
  );

  /** Moves time forward in 250 ms steps, firing due timers and media events. */
  async function advance(ms: number) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 250);
      if (media.playing && !media.paused) {
        media.currentTime += 0.25;
        session.onTimeUpdate();
      }
      for (const [h, t] of [...timers]) {
        if (t.at <= now && timers.has(h)) {
          if (t.every === null) timers.delete(h);
          else t.at += t.every;
          t.fn();
        }
      }
      await flush();
    }
  }

  function play() {
    media.paused = false;
    media.playing = true;
    session.onPlaying();
  }
  function pause() {
    media.pause();
    session.onPause();
  }

  return {
    session,
    media,
    log,
    unloadReleases,
    heartbeats,
    progress,
    releases,
    tickets,
    terminations,
    script,
    advance,
    play,
    pause,
    get reissues() {
      return reissues;
    },
    setReissue(fn: () => Promise<Ticket>) {
      reissueImpl = fn;
    },
    setVisible(v: boolean) {
      visible = v;
    },
    get activeTimers() {
      return timers.size;
    },
  };
}

const sumWatched = (w: ReturnType<typeof world>) => w.heartbeats.reduce((s, h) => s + h.body.watchedDeltaSeconds, 0);

// ---------------------------------------------------------------------------

describe('PlaybackSession - heartbeats independent of the player type', () => {
  it('beats on schedule with a DRM media element attached', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    await w.advance(95_000);
    assert.equal(w.heartbeats.length, 3);
    assert.ok(w.heartbeats.every((h) => h.id === 't1'));
    assert.deepEqual(w.heartbeats[0]!.body.protection, { recording: false, externalDisplay: false });
  });

  it('beats for the Gumlet embed (no media element), crediting no watched time', async () => {
    const w = world({ kind: 'embed', first: ticket('t1', { resumePositionSeconds: 120 }) });
    w.session.start();
    await w.advance(65_000);
    assert.equal(w.heartbeats.length, 2);
    assert.ok(w.heartbeats.every((h) => h.body.watchedDeltaSeconds === 0 && h.body.positionSeconds === 120));
  });

  it('uses at least a 10 s interval whatever the server says', async () => {
    const w = world({ first: ticket('t1', { heartbeatIntervalSeconds: 1 }) });
    w.session.start();
    await w.advance(25_000);
    assert.equal(w.heartbeats.length, 2);
  });
});

describe('PlaybackSession - watch time, progress and the three-play rule', () => {
  it('reports real watched seconds so a watched play counts (>= 30 s)', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    await w.advance(61_000);
    const watched = sumWatched(w);
    assert.ok(watched >= 58 && watched <= 61, `watched ${watched}`);
    assert.ok(watched >= 30, 'a 1-minute view must reach the server as a counted play');
  });

  it('a paused, buffering or hidden player reports no watched time (so it never counts)', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    // Paused for two minutes.
    await w.advance(120_000);
    // "Playing" but stalled (buffering): media time does not advance.
    w.media.paused = false;
    w.session.onWaiting();
    await w.advance(60_000);
    // Playing in a hidden tab.
    w.setVisible(false);
    w.play();
    await w.advance(60_000);
    assert.equal(sumWatched(w), 0);
  });

  it('a seek cannot inflate watched time', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    await w.advance(10_000);
    w.session.onSeeking();
    w.media.currentTime += 1500;
    w.session.onSeeked();
    await w.advance(21_000);
    assert.ok(sumWatched(w) <= 31, `watched ${sumWatched(w)}`);
  });

  it('posts progress after the beat, with the same position and seconds', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    await w.advance(31_000);
    assert.equal(w.progress.length, 1);
    assert.equal(w.progress[0]!.lessonId, 'lesson-1');
    assert.equal(w.progress[0]!.positionSeconds, w.heartbeats[0]!.body.positionSeconds);
    assert.equal(w.progress[0]!.watchedSeconds, w.heartbeats[0]!.body.watchedDeltaSeconds);
  });

  it('ended() reports the real end position (not 0) and the remaining seconds, even if the page leaves at once', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.media.currentTime = 1180;
    w.play();
    await w.advance(20_000);
    // The server answers the final beat slowly; the page navigates away at once.
    let answer: (r: Reply) => void = () => undefined;
    w.script.push(() => new Promise<Reply>((r) => (answer = r)));
    const ended = w.session.ended();
    const stopped = w.session.stop();
    await w.advance(1_000);
    assert.deepEqual(w.releases, [], 'the release must wait for the final report');
    answer({ ok: true, terminate: null });
    await ended;
    await stopped;
    const last = w.progress.at(-1)!;
    assert.equal(last.positionSeconds, 1200);
    assert.ok(last.watchedSeconds >= 19, `last watched ${last.watchedSeconds}`);
    assert.deepEqual(w.releases, ['t1']);
    assert.ok(w.log.indexOf('hb-done:t1') < w.log.indexOf('release:t1'), w.log.join(' '));
  });

  it('leaving while a regular beat is in flight waits for it, then reports what is left, then releases', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    let answer: (r: Reply) => void = () => undefined;
    w.script.push(() => new Promise<Reply>((r) => (answer = r)));
    await w.advance(40_000); // beat at 30 s is pending; 10 s more watched since
    const stopped = w.session.stop();
    await w.advance(500);
    assert.deepEqual(w.releases, []);
    answer({ ok: true, terminate: null });
    await stopped;
    assert.equal(w.heartbeats.length, 2, 'a final beat carried the seconds after the pending one');
    assert.ok(w.heartbeats[1]!.body.watchedDeltaSeconds >= 9);
    const order = w.log.join(' ');
    assert.ok(w.log.lastIndexOf('hb-done:t1') < w.log.indexOf('release:t1'), order);
  });
});

describe('PlaybackSession - renewal without touching the player', () => {
  it('a rotation switches the reporting ticket only, and never re-issues', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.script.push(async () => ({ ok: true, terminate: null, ticket: ticket('t2') }));
    await w.advance(61_000);
    assert.deepEqual(
      w.tickets.map((t) => t.ticketId),
      ['t2'],
    );
    assert.deepEqual(
      w.heartbeats.map((h) => h.id),
      ['t1', 't2'],
    );
    assert.equal(w.reissues, 0);
    assert.equal(w.terminations.length, 0);
    assert.equal(w.media.paused, false, 'playback continues through renewal');
  });
});

describe('PlaybackSession - failures, timeouts and recovery', () => {
  it('a heartbeat that never reached the server changes nothing on screen and re-banks its seconds', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.script.push(() => Promise.reject(Object.assign(new Error('offline'), { code: 'SERVER_UNREACHABLE', status: 0 })));
    await w.advance(31_000);
    assert.equal(w.session.consecutiveFailures, 1);
    assert.equal(w.terminations.length, 0);
    assert.equal(w.progress.length, 0, 'no progress claim for a beat the server never saw');
    await w.advance(30_000);
    assert.equal(w.session.consecutiveFailures, 0);
    const second = w.heartbeats[1]!.body.watchedDeltaSeconds;
    assert.ok(second >= 58, `re-banked seconds reported on the next beat (${second})`);
  });

  it('a heartbeat that hangs times out, is aborted, and never overlaps the next one', async () => {
    const w = world({ timeoutMs: 15_000 });
    w.session.attachMedia(w.media);
    w.session.start();
    w.script.push(() => new Promise<Reply>(() => undefined));
    // Beat at 30 s hangs; the 15 s timeout aborts it at 45 s.
    await w.advance(46_000);
    assert.equal(w.heartbeats[0]!.signal.aborted, true);
    assert.equal(w.session.consecutiveFailures, 1);
    assert.equal(w.heartbeats.length, 1);
    // The next scheduled beat (60 s) runs normally.
    await w.advance(15_000);
    assert.equal(w.session.consecutiveFailures, 0, 'the beat after the timeout succeeded');
    assert.equal(w.heartbeats.length, 2);
    assert.equal(w.terminations.length, 0);
  });

  it('a slow heartbeat is not doubled up while in flight', async () => {
    const w = world({ timeoutMs: 60_000 });
    w.session.start();
    let resolveSlow: (r: Reply) => void = () => undefined;
    w.script.push(() => new Promise<Reply>((r) => (resolveSlow = r)));
    await w.advance(65_000);
    assert.equal(w.heartbeats.length, 1);
    resolveSlow({ ok: true, terminate: null });
    await w.advance(30_000);
    assert.equal(w.heartbeats.length, 2);
  });

  it('an expired ticket is replaced once through the full ticket request (same play on the server)', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.setReissue(async () => ticket('t9'));
    w.script.push(async () => ({ ok: false, terminate: { reason: 'PLAYBACK_TICKET_EXPIRED' } }));
    await w.advance(61_000);
    assert.equal(w.reissues, 1);
    assert.deepEqual(
      w.tickets.map((t) => t.ticketId),
      ['t9'],
    );
    assert.deepEqual(
      w.heartbeats.map((h) => h.id),
      ['t1', 't9'],
    );
    assert.equal(w.terminations.length, 0);
    assert.equal(w.media.paused, false);
  });

  it('a lost rotation ("already ended") is recovered the same way', async () => {
    const w = world();
    w.session.start();
    w.script.push(async () => ({ ok: false, terminate: { reason: 'Playback session already ended' } }));
    await w.advance(31_000);
    assert.equal(w.reissues, 1);
    assert.equal(w.terminations.length, 0);
  });

  it('recovery is rate-limited: a second expiry inside the cooldown ends playback', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.script.push(async () => ({ ok: false, terminate: { reason: 'PLAYBACK_TICKET_EXPIRED' } }));
    w.script.push(async () => ({ ok: false, terminate: { reason: 'PLAYBACK_TICKET_EXPIRED' } }));
    await w.advance(61_000);
    assert.equal(w.reissues, 1);
    assert.deepEqual(w.terminations, ['PLAYBACK_TICKET_EXPIRED']);
    assert.equal(w.media.paused, true);
  });

  it('a refused recovery (e.g. the play limit) ends playback with the server code', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.setReissue(() => Promise.reject(Object.assign(new Error('x'), { code: 'VIDEO_WATCH_LIMIT_REACHED' })));
    w.script.push(async () => ({ ok: false, terminate: { reason: 'PLAYBACK_TICKET_EXPIRED' } }));
    await w.advance(31_000);
    assert.deepEqual(w.terminations, ['VIDEO_WATCH_LIMIT_REACHED']);
    assert.equal(w.media.paused, true);
  });
});

describe('PlaybackSession - revocation', () => {
  for (const reason of ['Session revoked', 'CAPTURE_DETECTED', 'NOT_ENROLLED', 'DEVICE_NOT_AUTHORIZED', 'PLAYBACK_DENIED']) {
    it(`"${reason}" stops playback at once, with no recovery and no further beats`, async () => {
      const w = world();
      w.session.attachMedia(w.media);
      w.session.start();
      w.play();
      w.script.push(async () => ({ ok: false, terminate: { reason } }));
      await w.advance(31_000);
      assert.deepEqual(w.terminations, [reason]);
      assert.equal(w.media.paused, true);
      assert.equal(w.reissues, 0);
      assert.equal(w.session.isStopped, true);
      assert.equal(w.activeTimers, 0);
      const beats = w.heartbeats.length;
      await w.advance(120_000);
      assert.equal(w.heartbeats.length, beats);
    });
  }
});

describe('PlaybackSession - leaving the player', () => {
  it('stop() sends the banked seconds, releases the CURRENT ticket, and is idempotent', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.script.push(async () => ({ ok: true, terminate: null, ticket: ticket('t2') }));
    await w.advance(45_000);
    await w.session.stop();
    await w.session.stop();
    assert.deepEqual(w.releases, ['t2']);
    const final = w.heartbeats.at(-1)!;
    assert.equal(final.id, 't2');
    assert.ok(final.body.watchedDeltaSeconds >= 14);
    const beats = w.heartbeats.length;
    await w.advance(120_000);
    assert.equal(w.heartbeats.length, beats, 'no beats after stop');
  });

  it('a rotation that arrives after the page left is given straight back', async () => {
    const w = world({ timeoutMs: 60_000 });
    w.session.start();
    let answer: (r: Reply) => void = () => undefined;
    w.script.push(() => new Promise<Reply>((r) => (answer = r)));
    await w.advance(31_000);
    const stopped = w.session.stop();
    answer({ ok: true, terminate: null, ticket: ticket('t3') });
    await stopped;
    await w.advance(1_000);
    assert.ok(w.releases.includes('t3'));
    assert.ok(w.releases.includes('t1'));
    assert.equal(w.tickets.length, 0, 'the player is not handed a ticket after leaving');
  });
});

describe('PlaybackSession - review fixes', () => {
  it('a heartbeat the server may have recorded (5xx / timeout) is NOT re-sent, so time is never credited twice', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.script.push(() => Promise.reject(Object.assign(new Error('boom'), { code: 'SERVER_ERROR', status: 500 })));
    await w.advance(61_000);
    assert.equal(w.heartbeats.length, 2);
    const second = w.heartbeats[1]!.body.watchedDeltaSeconds;
    assert.ok(second <= 31, `the 5xx beat's seconds were not re-sent (${second})`);
    assert.equal(w.terminations.length, 0);
  });

  it('a 4xx answer ends the session instead of retrying forever (expired row -> one recovery)', async () => {
    const w = world();
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    w.script.push(() =>
      Promise.reject(Object.assign(new Error('gone'), { code: 'PLAYBACK_TICKET_EXPIRED', status: 401 })),
    );
    await w.advance(31_000);
    assert.equal(w.reissues, 1, 'an expired ticket row is recovered once');
    const w2 = world();
    w2.session.attachMedia(w2.media);
    w2.session.start();
    w2.play();
    w2.script.push(() => Promise.reject(Object.assign(new Error('no'), { code: 'FORBIDDEN', status: 403 })));
    await w2.advance(31_000);
    assert.deepEqual(w2.terminations, ['FORBIDDEN']);
    assert.equal(w2.media.paused, true);
  });

  it('transient failures are bounded: N in a row end playback, fewer do not', async () => {
    const w = world({ maxFailures: 3 });
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    for (let i = 0; i < 3; i += 1) {
      w.script.push(() => Promise.reject(Object.assign(new Error('x'), { code: 'SERVER_ERROR', status: 503 })));
    }
    await w.advance(61_000);
    assert.equal(w.terminations.length, 0, 'two failures: still playing');
    await w.advance(30_000);
    assert.deepEqual(w.terminations, ['SERVER_ERROR']);
    assert.equal(w.media.paused, true);
  });

  it('a paused player gives its ticket back after the idle period, and stops beating', async () => {
    const w = world({ idleReleaseMs: 120_000 });
    w.session.attachMedia(w.media);
    w.session.start();
    w.play();
    await w.advance(20_000);
    w.pause();
    await w.advance(160_000);
    assert.equal(w.session.isParked, true);
    assert.deepEqual(w.releases, ['t1']);
    const beats = w.heartbeats.length;
    await w.advance(300_000);
    assert.equal(w.heartbeats.length, beats, 'no beats while parked: the slot is free for other devices');
    assert.equal(w.terminations.length, 0, 'parking is silent');
  });

  it('pressing play after parking resumes with a fresh ticket through the full request', async () => {
    const w = world({ idleReleaseMs: 120_000 });
    w.session.attachMedia(w.media);
    w.session.start();
    w.setReissue(async () => ticket('t-resume'));
    w.pause();
    await w.advance(160_000);
    assert.equal(w.session.isParked, true);
    w.play();
    await w.advance(31_000);
    assert.equal(w.session.isParked, false);
    assert.equal(w.reissues, 1);
    assert.deepEqual(
      w.tickets.map((t) => t.ticketId),
      ['t-resume'],
    );
    assert.equal(w.heartbeats.at(-1)!.id, 't-resume');
    await w.session.stop();
    assert.deepEqual(w.releases, ['t1', 't-resume']);
  });

  it('a refused resume (e.g. another device is now playing) stops with the server code', async () => {
    const w = world({ idleReleaseMs: 120_000 });
    w.session.attachMedia(w.media);
    w.session.start();
    w.setReissue(() => Promise.reject(Object.assign(new Error('x'), { code: 'CONCURRENT_STREAM_LIMIT' })));
    w.pause();
    await w.advance(160_000);
    w.play();
    await w.advance(1_000);
    assert.deepEqual(w.terminations, ['CONCURRENT_STREAM_LIMIT']);
    assert.equal(w.media.paused, true);
    await w.session.stop();
    assert.deepEqual(w.releases, ['t1'], 'nothing left to release');
  });

  it('the Gumlet embed is never parked (its pause state is unknowable)', async () => {
    const w = world({ kind: 'embed', idleReleaseMs: 60_000 });
    w.session.start();
    await w.advance(300_000);
    assert.equal(w.session.isParked, false);
    assert.equal(w.releases.length, 0);
    assert.equal(w.heartbeats.length, 10);
  });

  it('closing the tab hands the current ticket back with a keepalive release, once', async () => {
    const w = world();
    w.session.start();
    w.script.push(async () => ({ ok: true, terminate: null, ticket: ticket('t2') }));
    await w.advance(31_000);
    w.session.unload();
    w.session.unload();
    await w.session.stop();
    assert.deepEqual(w.unloadReleases, ['t2']);
    assert.deepEqual(w.releases, [], 'no second release after the keepalive one');
    const beats = w.heartbeats.length;
    await w.advance(60_000);
    assert.equal(w.heartbeats.length, beats);
  });
});
