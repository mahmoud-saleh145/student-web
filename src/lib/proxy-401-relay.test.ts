import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { endsSession } from './error-messages.ts';
import { isResourceLevelUnauthorized, RESOURCE_LEVEL_401_RELAY_STATUS } from './proxy-rules.ts';

/**
 * L1: a heartbeat for a ticket unknown to the signed-in user is answered 401
 * PLAYBACK_TICKET_EXPIRED by the backend. The proxy used to treat it as an
 * expired login, refresh, retry, and clear the session cookies - signing the
 * student out. It must be relayed as a ticket-level error instead.
 */
describe('isResourceLevelUnauthorized', () => {
  it('matches only the ticket-level 401', () => {
    assert.equal(isResourceLevelUnauthorized(401, 'PLAYBACK_TICKET_EXPIRED'), true);
  });

  it('never matches a real authentication failure, so those keep refreshing and ending sessions', () => {
    for (const code of ['UNAUTHORIZED', 'SESSION_EXPIRED', 'INVALID_CREDENTIALS', 'SESSION_CHANGED', '', 'whatever']) {
      assert.equal(isResourceLevelUnauthorized(401, code), false, code);
    }
    assert.equal(isResourceLevelUnauthorized(401, null), false);
    assert.equal(isResourceLevelUnauthorized(401, undefined), false);
  });

  it('only applies to 401 answers', () => {
    for (const status of [400, 403, 404, 410, 429, 500]) {
      assert.equal(isResourceLevelUnauthorized(status, 'PLAYBACK_TICKET_EXPIRED'), false, String(status));
    }
  });

  it('is relayed with a status the client never treats as "session ended"', () => {
    assert.equal(RESOURCE_LEVEL_401_RELAY_STATUS, 410);
    assert.equal(endsSession({ status: RESOURCE_LEVEL_401_RELAY_STATUS, code: 'PLAYBACK_TICKET_EXPIRED' }), false);
    // ...whereas a genuine 401 still ends the session, as before.
    assert.equal(endsSession({ status: 401, code: 'UNAUTHORIZED' }), true);
  });
});

describe('proxy route wiring', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(resolve(here, '../app/api/proxy/[...path]/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  it('relays a ticket-level 401 BEFORE any refresh attempt, without touching cookies', () => {
    const early = route.indexOf('if (isResourceLevelUnauthorized(apiErr.status, apiErr.code)) {');
    const refresh = route.indexOf('const refreshToken = await getRefreshToken();');
    assert.ok(early > 0 && refresh > 0 && early < refresh, 'the relay must come before the refresh');
    const branch = route.slice(early, route.indexOf('}', early) + 1);
    assert.match(branch, /return jsonError\(RESOURCE_LEVEL_401_RELAY_STATUS, apiErr\.code, apiErr\.message\);/);
    assert.doesNotMatch(branch, /clearSessionCookies|setSessionCookies/);
  });

  it('after a successful refresh, a ticket-level 401 keeps (persists) the rotated session instead of clearing it', () => {
    assert.match(route, /const resourceLevel = isResourceLevelUnauthorized\(retryApiErr\.status, retryApiErr\.code\);/);
    assert.match(route, /if \(retryApiErr\.status === 401 && !resourceLevel\) \{\s*clearSessionCookies\(response\);/);
  });
});
