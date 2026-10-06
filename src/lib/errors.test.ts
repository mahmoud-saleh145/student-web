import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, httpStatusFor, networkError } from './errors.ts';

describe('httpStatusFor', () => {
  test('passes a real upstream status through untouched', () => {
    assert.equal(httpStatusFor(new ApiError({ code: 'NOT_FOUND', status: 404, message: 'x' })), 404);
    assert.equal(httpStatusFor(new ApiError({ code: 'UNAUTHORIZED', status: 401, message: 'x' })), 401);
  });

  test('maps a timeout to 504 rather than an impossible status', () => {
    // `status: 0` reached NextResponse.json and threw RangeError, which took
    // the route's own error handler down and answered a bodiless 500.
    assert.equal(httpStatusFor(networkError('timeout')), 504);
  });

  test('maps an unreachable or offline backend to 502', () => {
    assert.equal(httpStatusFor(networkError('unreachable')), 502);
    assert.equal(httpStatusFor(networkError('offline')), 502);
  });

  test('never returns a status Response would reject', () => {
    for (const status of [0, -1, 42, 600, 1000, Number.NaN]) {
      const out = httpStatusFor(new ApiError({ code: 'UNKNOWN', status, message: 'x' }));
      assert.ok(out >= 200 && out <= 599, `${status} produced ${out}`);
    }
  });
});
