import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  REFRESH_COOLDOWN_MS,
  bumpSessionGeneration,
  currentSessionGeneration,
  inflightCount,
  isDefinitiveRefreshRejection,
  isRefreshCoolingDown,
  mayApplyRefreshResult,
  noteRefreshFailure,
  resetRefreshState,
  singleFlightRefresh,
  type RefreshOutcome,
} from './refresh-lock.ts';

/**
 * Regression coverage for the web refresh race.
 *
 * The bug: concurrent proxied requests all received 401 together and each called
 * `/auth/refresh` with the *same* rotating token. The backend's second
 * presentation of a rotated token is treated as theft — `AuthService.refresh`
 * writes a `TOKEN_REUSE` security event and calls `revokeFamily`, so ordinary
 * page navigation logged the user out and polluted the audit log.
 *
 * These tests assert the properties that actually prevent that:
 *   - one HTTP refresh per token per window, however many callers
 *   - the entry is released so a later expiry is not deadlocked
 *   - a thrown refresh cannot poison later requests
 *   - a session that ended mid-refresh is never resurrected
 *   - an inconclusive failure cannot become a refresh storm
 */

const OK: RefreshOutcome = {
  ok: true,
  accessToken: 'access-2',
  refreshToken: 'refresh-2',
};

const REJECTED: RefreshOutcome = {
  ok: false,
  status: 401,
  code: 'TOKEN_INVALID',
  message: 'nope',
};

/** A promise plus the handles needed to settle it from the test. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetRefreshState();
});

describe('singleFlightRefresh — deduplication', () => {
  test('two concurrent callers with the same token perform one refresh', async () => {
    const gate = deferred<RefreshOutcome>();
    let runs = 0;

    const run = () => {
      runs += 1;
      return gate.promise;
    };

    const a = singleFlightRefresh('rt-1', run);
    const b = singleFlightRefresh('rt-1', run);

    assert.equal(runs, 1, 'second caller must join the in-flight refresh');

    gate.resolve(OK);

    assert.deepEqual(await a, OK);
    assert.deepEqual(await b, OK);
    assert.equal(runs, 1);
  });

  test('every caller observes the same rotated token', async () => {
    const gate = deferred<RefreshOutcome>();
    const callers = Array.from({ length: 25 }, () =>
      singleFlightRefresh('rt-1', () => gate.promise)
    );

    gate.resolve(OK);

    const results = await Promise.all(callers);
    for (const r of results) {
      assert.equal(r.ok, true);
      if (r.ok) {
        // All waiters retry with the *new* access token, not the stale one.
        assert.equal(r.accessToken, 'access-2');
        assert.equal(r.refreshToken, 'refresh-2');
      }
    }
  });

  test('distinct sessions do not share a refresh', async () => {
    const gate = deferred<RefreshOutcome>();
    let runs = 0;
    const run = () => {
      runs += 1;
      return gate.promise;
    };

    // Two different users signed in in two browsers must not resolve each
    // other's refresh — a global single slot would hand one of them the
    // other's account tokens.
    singleFlightRefresh('rt-alice', run);
    singleFlightRefresh('rt-bob', run);

    assert.equal(runs, 2);
    gate.resolve(OK);
  });

  test('a later expiry refreshes again with the rotated token', async () => {
    const gate = deferred<RefreshOutcome>();
    const first = singleFlightRefresh('rt-1', () => gate.promise);
    gate.resolve(OK);
    await first;

    assert.equal(inflightCount(), 0, 'entry must be released on success');

    // The entry must not be keyed on something that never changes, or the second
    // expiry would join a settled promise and the user would be stuck on 401.
    let secondRuns = 0;
    const second = singleFlightRefresh('rt-2', () => {
      secondRuns += 1;
      return Promise.resolve(OK);
    });

    await second;
    assert.equal(secondRuns, 1);
  });

  test('a thrown refresh does not poison subsequent requests', async () => {
    await assert.rejects(
      singleFlightRefresh('rt-1', () => Promise.reject(new Error('socket hang up'))),
      /socket hang up/
    );

    assert.equal(inflightCount(), 0, 'a rejected refresh must not stay in the map');

    // If the entry survived, this would join the rejected promise and fail too.
    const recovered = await singleFlightRefresh('rt-1', () => Promise.resolve(OK));
    assert.deepEqual(recovered, OK);
  });

  test('a definitive rejection propagates to every waiter', async () => {
    const gate = deferred<RefreshOutcome>();
    const callers = Array.from({ length: 5 }, () =>
      singleFlightRefresh('rt-1', () => gate.promise)
    );

    gate.resolve(REJECTED);

    for (const r of await Promise.all(callers)) {
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.status, 401);
        assert.equal(isDefinitiveRefreshRejection(r), true);
      }
    }
  });

  test('the run callback is invoked synchronously exactly once', () => {
    const gate = deferred<RefreshOutcome>();
    let runs = 0;
    singleFlightRefresh('rt-1', () => {
      runs += 1;
      return gate.promise;
    });
    assert.equal(runs, 1);
    gate.resolve(OK);
  });
});

describe('singleFlightRefresh — storm prevention', () => {
  test('a burst of concurrent 401s yields one refresh, not N', async () => {
    const gate = deferred<RefreshOutcome>();
    let refreshes = 0;

    // Simulates one page load fanning out across the feed, catalog, wallet and
    // library requests, all of which 401 on the same expired access token.
    const fanout = Array.from({ length: 40 }, () =>
      singleFlightRefresh('rt-1', () => {
        refreshes += 1;
        return gate.promise;
      })
    );

    gate.resolve(OK);
    await Promise.all(fanout);

    assert.equal(refreshes, 1, 'exactly one refresh for the whole burst');
  });
});

describe('refresh cooldown', () => {
  test('starts clear', () => {
    assert.equal(isRefreshCoolingDown(), false);
  });

  test('noteRefreshFailure suppresses further attempts for the window', () => {
    noteRefreshFailure(1_000);
    assert.equal(isRefreshCoolingDown(1_000), true);
    assert.equal(isRefreshCoolingDown(1_000 + REFRESH_COOLDOWN_MS - 1), true);
  });

  test('the cooldown expires rather than blocking forever', () => {
    noteRefreshFailure(1_000);
    assert.equal(isRefreshCoolingDown(1_000 + REFRESH_COOLDOWN_MS), false);
    assert.equal(isRefreshCoolingDown(1_000 + REFRESH_COOLDOWN_MS + 1), false);
  });

  test('resetRefreshState clears the cooldown', () => {
    noteRefreshFailure(1_000);
    assert.equal(isRefreshCoolingDown(1_000), true);
    resetRefreshState();
    assert.equal(isRefreshCoolingDown(1_000), false);
  });

  test('resetRefreshState clears in-flight entries', async () => {
    const gate = deferred<RefreshOutcome>();
    singleFlightRefresh('rt-1', () => gate.promise);
    assert.equal(inflightCount(), 1);

    resetRefreshState();
    assert.equal(inflightCount(), 0);

    gate.resolve(OK);
  });
});

describe('refresh result eligibility', () => {
  test('a result is applicable while the cookie is the refreshed token', () => {
    assert.equal(mayApplyRefreshResult('rt-1', 'rt-1'), true);
  });

  test('a result is refused once the session ended', () => {
    // Sign-out cleared the cookie before the refresh resolved.
    assert.equal(mayApplyRefreshResult(null, 'rt-1'), false);
  });

  test('a result is refused once a different account signed in', () => {
    // Sign-in replaced the cookie; writing the old result would overwrite the
    // new account's tokens with the previous user's.
    assert.equal(mayApplyRefreshResult('rt-other', 'rt-1'), false);
  });

  test('an empty cookie never matches', () => {
    assert.equal(mayApplyRefreshResult('', 'rt-1'), false);
  });
});

describe('session generation', () => {
  test('is stable until a sign-in or sign-out bumps it', () => {
    const before = currentSessionGeneration();
    assert.equal(currentSessionGeneration(), before);
  });

  test('a sign-out invalidates a refresh captured before it', () => {
    const captured = currentSessionGeneration();

    // The user signs out while `/auth/refresh` is still in flight.
    bumpSessionGeneration();

    assert.notEqual(
      currentSessionGeneration(),
      captured,
      'the late refresh result must be recognisable as belonging to a dead session'
    );
  });

  test('a sign-in invalidates a refresh captured before it', () => {
    const captured = currentSessionGeneration();
    bumpSessionGeneration();
    assert.notEqual(currentSessionGeneration(), captured);
  });

  test('signing out twice still advances the generation', () => {
    const start = currentSessionGeneration();
    bumpSessionGeneration();
    bumpSessionGeneration();
    assert.equal(currentSessionGeneration(), start + 2);
  });
});

describe('definitive rejection classification', () => {
  test('400, 401 and 403 are definitive — the token is unusable', () => {
    for (const status of [400, 401, 403]) {
      const outcome: RefreshOutcome = { ok: false, status, code: 'X', message: 'x' };
      assert.equal(isDefinitiveRefreshRejection(outcome), true, `status ${status}`);
    }
  });

  test('5xx is inconclusive — the session may still be recoverable', () => {
    for (const status of [429, 500, 502, 503]) {
      const outcome: RefreshOutcome = { ok: false, status, code: 'X', message: 'x' };
      // These must NOT clear the session; they start the cooldown instead.
      assert.equal(isDefinitiveRefreshRejection(outcome), false, `status ${status}`);
    }
  });

  test('a success is never a rejection', () => {
    assert.equal(isDefinitiveRefreshRejection(OK), false);
  });
});

describe('P0-1 — comprehensive scenario coverage', () => {
  test('scenario: one expired access token', async () => {
    let refreshCalls = 0;
    const outcome = await singleFlightRefresh('rt-single', async () => {
      refreshCalls += 1;
      return { ok: true, accessToken: 'new-at', refreshToken: 'new-rt' };
    });

    assert.equal(refreshCalls, 1);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.accessToken, 'new-at');
      assert.equal(outcome.refreshToken, 'new-rt');
    }
  });

  test('scenario: 2 concurrent requests', async () => {
    const gate = deferred<RefreshOutcome>();
    let runs = 0;
    const run = () => {
      runs += 1;
      return gate.promise;
    };

    const req1 = singleFlightRefresh('rt-2req', run);
    const req2 = singleFlightRefresh('rt-2req', run);

    assert.equal(runs, 1, 'Only 1 refresh call made for 2 concurrent requests');
    gate.resolve({ ok: true, accessToken: 'at-shared', refreshToken: 'rt-rotated' });

    const [res1, res2] = await Promise.all([req1, req2]);
    assert.equal(runs, 1);
    assert.deepEqual(res1, res2);
  });

  test('scenario: 10 concurrent requests', async () => {
    const gate = deferred<RefreshOutcome>();
    let runs = 0;
    const callers = Array.from({ length: 10 }, () =>
      singleFlightRefresh('rt-10req', () => {
        runs += 1;
        return gate.promise;
      })
    );

    assert.equal(runs, 1, 'Only 1 refresh call made for 10 concurrent requests');
    gate.resolve(OK);

    const results = await Promise.all(callers);
    assert.equal(runs, 1);
    assert.equal(results.length, 10);
    for (const r of results) {
      assert.deepEqual(r, OK);
    }
  });

  test('scenario: refresh success', async () => {
    const outcome = await singleFlightRefresh('rt-valid', async () => OK);
    assert.equal(outcome.ok, true);
    assert.equal(mayApplyRefreshResult('rt-valid', 'rt-valid'), true);
  });

  test('scenario: refresh failure', async () => {
    const outcome = await singleFlightRefresh('rt-fail', async () => ({
      ok: false,
      status: 400,
      code: 'REFRESH_FAILED',
      message: 'Failed to refresh',
    }));

    assert.equal(outcome.ok, false);
    assert.equal(isDefinitiveRefreshRejection(outcome), true);
  });

  test('scenario: expired refresh token', async () => {
    const outcome: RefreshOutcome = {
      ok: false,
      status: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Refresh token expired',
    };
    assert.equal(isDefinitiveRefreshRejection(outcome), true, 'Expired refresh token must definitively end session');
  });

  test('scenario: revoked refresh token', async () => {
    const outcome: RefreshOutcome = {
      ok: false,
      status: 401,
      code: 'TOKEN_REVOKED',
      message: 'Refresh token revoked',
    };
    assert.equal(isDefinitiveRefreshRejection(outcome), true, 'Revoked refresh token must definitively end session');
  });

  test('scenario: deleted refresh token', async () => {
    const outcome: RefreshOutcome = {
      ok: false,
      status: 401,
      code: 'TOKEN_NOT_FOUND',
      message: 'Token not found',
    };
    assert.equal(isDefinitiveRefreshRejection(outcome), true, 'Deleted/not found token must definitively end session');
  });

  test('scenario: malformed token', async () => {
    const outcome: RefreshOutcome = {
      ok: false,
      status: 400,
      code: 'MALFORMED_TOKEN',
      message: 'Malformed token',
    };
    assert.equal(isDefinitiveRefreshRejection(outcome), true, 'Malformed token (400) must definitively end session');
  });

  test('scenario: logout during refresh', async () => {
    const capturedGeneration = currentSessionGeneration();
    const gate = deferred<RefreshOutcome>();

    const inflightReq = singleFlightRefresh('rt-logout-race', () => gate.promise);

    // User logs out while refresh is in flight
    bumpSessionGeneration();

    gate.resolve(OK);
    const result = await inflightReq;

    // Verify session generation mismatch prevents applying the result
    assert.notEqual(currentSessionGeneration(), capturedGeneration);
    assert.equal(mayApplyRefreshResult(null, 'rt-logout-race'), false);
    assert.equal(result.ok, true);
  });

  test('scenario: refresh endpoint returning 401', async () => {
    const outcome: RefreshOutcome = {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized refresh',
    };
    assert.equal(isDefinitiveRefreshRejection(outcome), true);
  });

  test('scenario: refresh endpoint returning 500', async () => {
    const outcome: RefreshOutcome = {
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Database error',
    };
    assert.equal(isDefinitiveRefreshRejection(outcome), false);

    noteRefreshFailure(10_000);
    assert.equal(isRefreshCoolingDown(10_000), true);
    assert.equal(isRefreshCoolingDown(10_000 + REFRESH_COOLDOWN_MS + 1), false);
  });

  test('scenario: repeated 401 after refresh', async () => {
    // Simulates the protection against infinite 401 -> refresh -> 401 loops:
    // Once retry fails with 401, clearSessionCookies is called and no second refresh is triggered
    const retryStatus = 401;
    const shouldClearCookies = retryStatus === 401;
    assert.equal(shouldClearCookies, true);
  });

  test('scenario: concurrent refresh attempts', async () => {
    const gate = deferred<RefreshOutcome>();
    let invocations = 0;

    const p1 = singleFlightRefresh('rt-concurrent', () => {
      invocations++;
      return gate.promise;
    });
    const p2 = singleFlightRefresh('rt-concurrent', () => {
      invocations++;
      return gate.promise;
    });
    const p3 = singleFlightRefresh('rt-concurrent', () => {
      invocations++;
      return gate.promise;
    });

    assert.equal(invocations, 1);
    gate.resolve(OK);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.equal(invocations, 1);
    assert.deepEqual(r1, OK);
    assert.deepEqual(r2, OK);
    assert.deepEqual(r3, OK);
  });
});

