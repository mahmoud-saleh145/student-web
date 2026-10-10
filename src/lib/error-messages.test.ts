import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { endsSession, errorMessageKey } from './error-messages.ts';

const KEYS = new Set(['errors.INVALID_CODE', 'errors.FORBIDDEN', 'errors.SERVER_ERROR', 'errors.VALIDATION_ERROR']);
const has = (k: string) => KEYS.has(k);

describe('errorMessageKey', () => {
  it('uses the translation for a known code', () => {
    assert.equal(errorMessageKey('INVALID_CODE', 400, has), 'errors.INVALID_CODE');
  });

  it('falls back by status for a code this client has no words for', () => {
    // COURSE_NOT_TARGETED without a translation reads as FORBIDDEN, as on mobile.
    assert.equal(errorMessageKey('SOMETHING_NEW', 403, has), 'errors.FORBIDDEN');
    assert.equal(errorMessageKey('SOMETHING_NEW', 409, has), 'errors.VALIDATION_ERROR');
  });

  it('treats any 5xx as a server error', () => {
    assert.equal(errorMessageKey('WEIRD', 502, has), 'errors.SERVER_ERROR');
  });

  it('never returns the raw backend message, only a key', () => {
    assert.equal(errorMessageKey('', 418, has), 'errors.genericBody');
  });
});

describe('endsSession', () => {
  it('ends the session on a 401 or a session-ending code', () => {
    assert.equal(endsSession({ code: 'UNAUTHORIZED', status: 401 }), true);
    assert.equal(endsSession({ code: 'ACCOUNT_DISABLED', status: 403 }), true);
  });

  it('keeps the session for device-binding problems, like the mobile app', () => {
    assert.equal(endsSession({ code: 'DEVICE_NOT_AUTHORIZED', status: 403 }), false);
    assert.equal(endsSession({ code: 'FORBIDDEN', status: 403 }), false);
  });

  it('keeps the session when the proxy could not reach the backend to refresh', () => {
    // Regression. The proxy used to relay the upstream 401 when a refresh
    // failed for an unrelated reason (5xx, 429, timeout), and `endsSession`
    // treats every 401 as fatal — so one unreachable backend cleared the
    // cookies and threw the student back to sign-in while their session was
    // still perfectly valid. The proxy now answers 503, which must not end it.
    assert.equal(
      endsSession({ code: 'SESSION_REFRESH_UNAVAILABLE', status: 503 }),
      false
    );
  });
});
