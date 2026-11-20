import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  MAX_ENDED_TOKENS,
  REFRESH_REUSE_WINDOW_MS,
  clearActivationRefreshCooldown,
  endedActivationTokenCountForTests,
  isActivationRefreshCoolingDown,
  isActivationSessionEnded,
  markActivationSessionEnded,
  noteActivationRefreshFailure,
  resetActivationRefreshStateForTests,
  singleFlightActivationRefresh,
} from './refresh-state.ts';

type Outcome = Awaited<ReturnType<typeof singleFlightActivationRefresh>>;

const success = (n: number): Outcome => ({ ok: true, accessToken: `at-${n}`, refreshToken: `rt-${n}` });
const failure = (status: number): Outcome => ({ ok: false, status, code: 'X', message: 'x' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => resetActivationRefreshStateForTests());

describe('portal refresh coordination', () => {
  it('presents a rotating refresh token once for a burst of concurrent requests', async () => {
    let runs = 0;
    const gate = deferred<Outcome>();
    const run = () => {
      runs += 1;
      return gate.promise;
    };
    const waiters = [1, 2, 3, 4, 5].map(() => singleFlightActivationRefresh('rt-old', run));
    gate.resolve(success(1));
    const results = await Promise.all(waiters);

    assert.equal(runs, 1);
    for (const r of results) assert.deepEqual(r, success(1));
  });

  it('hands a just-finished refresh to a late request instead of re-presenting the spent token', async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return success(runs);
    };
    const first = await singleFlightActivationRefresh('rt-old', run, 1_000);
    // A request that left the browser with the old cookie gets its 401 now.
    const late = await singleFlightActivationRefresh('rt-old', run, 1_000 + 5_000);

    assert.equal(runs, 1);
    assert.deepEqual(late, first);
  });

  it('forgets a finished refresh after the reuse window', async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return success(runs);
    };
    await singleFlightActivationRefresh('rt-old', run, 1_000);
    await singleFlightActivationRefresh('rt-old', run, 1_000 + REFRESH_REUSE_WINDOW_MS + 60_000);
    assert.equal(runs, 2);
  });

  it('does not replay a failure', async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return runs === 1 ? failure(503) : success(2);
    };
    assert.equal((await singleFlightActivationRefresh('rt-old', run)).ok, false);
    assert.equal((await singleFlightActivationRefresh('rt-old', run)).ok, true);
    assert.equal(runs, 2);
  });

  it('keeps two students apart: one never receives the other’s tokens', async () => {
    const a = singleFlightActivationRefresh('rt-student-a', async () => success(1));
    const b = singleFlightActivationRefresh('rt-student-b', async () => success(2));
    assert.deepEqual(await a, success(1));
    assert.deepEqual(await b, success(2));
  });

  it('does not leave a poisoned entry when the refresh throws', async () => {
    await assert.rejects(singleFlightActivationRefresh('rt-old', async () => Promise.reject(new Error('boom'))));
    assert.deepEqual(await singleFlightActivationRefresh('rt-old', async () => success(1)), success(1));
  });
});

describe('ended sessions', () => {
  it('marks only the token that was signed out', () => {
    markActivationSessionEnded('rt-student-a');
    assert.equal(isActivationSessionEnded('rt-student-a'), true);
    // Another student's session is not affected by this one's sign-out.
    assert.equal(isActivationSessionEnded('rt-student-b'), false);
  });

  it('drops a replayable result for a session that ended', async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return success(runs);
    };
    await singleFlightActivationRefresh('rt-old', run);
    markActivationSessionEnded('rt-old');
    await singleFlightActivationRefresh('rt-old', run);
    assert.equal(runs, 2);
    assert.equal(isActivationSessionEnded('rt-old'), true);
  });

  it('ignores a missing token', () => {
    assert.doesNotThrow(() => markActivationSessionEnded(null));
    assert.doesNotThrow(() => markActivationSessionEnded(undefined));
  });
});

describe('cooldown', () => {
  it('pauses refresh attempts after an inconclusive failure, and a sign-in clears it', () => {
    assert.equal(isActivationRefreshCoolingDown(1_000), false);
    noteActivationRefreshFailure(1_000);
    assert.equal(isActivationRefreshCoolingDown(1_000 + 29_000), true);
    assert.equal(isActivationRefreshCoolingDown(1_000 + 31_000), false);
    noteActivationRefreshFailure(1_000);
    clearActivationRefreshCooldown();
    assert.equal(isActivationRefreshCoolingDown(1_001), false);
  });
});

describe('ended tokens are bounded', () => {
  it('never remembers more than the cap, dropping the oldest first', () => {
    resetActivationRefreshStateForTests();
    const now = 1_000_000;
    for (let i = 0; i < MAX_ENDED_TOKENS + 500; i += 1) markActivationSessionEnded(`token-${i}`, now);
    assert.equal(endedActivationTokenCountForTests(), MAX_ENDED_TOKENS);
    assert.equal(isActivationSessionEnded('token-0', now), false);
    assert.equal(isActivationSessionEnded(`token-${MAX_ENDED_TOKENS + 499}`, now), true);
  });

  it('does not store a value too long to be a token', () => {
    resetActivationRefreshStateForTests();
    markActivationSessionEnded('x'.repeat(4000), 1_000);
    assert.equal(endedActivationTokenCountForTests(), 0);
  });

  it('ending a session also forgets the refresh that produced its token', async () => {
    resetActivationRefreshStateForTests();
    const now = 5_000;
    // RT0 was refreshed into RT1 a moment ago.
    await singleFlightActivationRefresh(
      'RT0',
      async () => ({ ok: true, accessToken: 'AT1', refreshToken: 'RT1' }) as never,
      now,
    );
    // The student signs out of the RT1 session.
    markActivationSessionEnded('RT1', now + 1_000);

    // A straggler still holding RT0 must not be handed AT1/RT1 back.
    let ran = false;
    await singleFlightActivationRefresh(
      'RT0',
      async () => {
        ran = true;
        return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'reused' } as never;
      },
      now + 2_000,
    );
    assert.equal(ran, true);
  });
});
