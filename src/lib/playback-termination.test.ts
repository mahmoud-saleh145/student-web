import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { terminationErrorCode } from './playback-termination.ts';

describe('terminationErrorCode', () => {
  it('keeps known codes so the student sees the matching translated message', () => {
    for (const code of ['VIDEO_WATCH_LIMIT_REACHED', 'CONCURRENT_STREAM_LIMIT', 'PLAYBACK_TICKET_EXPIRED', 'CAPTURE_DETECTED', 'NOT_ENROLLED', 'SERVER_ERROR']) {
      assert.equal(terminationErrorCode(code), code);
    }
  });

  it('maps free text (an admin revocation note) to the generic "not allowed" message, as before', () => {
    assert.equal(terminationErrorCode('Session revoked'), 'PLAYBACK_DENIED');
    assert.equal(terminationErrorCode(''), 'PLAYBACK_DENIED');
  });
});
