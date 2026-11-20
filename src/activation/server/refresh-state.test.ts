import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  REFRESH_REUSE_WINDOW_MS,
  clearActivationRefreshCooldown,
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
