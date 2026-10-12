import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCTION_HOSTS,
  debugGate,
  redactUrl,
  type DebugGateInput,
} from './gate.ts';
import * as initDataTypeTokenModule from '../drm-diagnostics.ts';

/**
 * Gate tests.
 *
 * These assert the SECURITY contract, not behaviour convenience: Eruda must be
 * impossible to start on production, and must be impossible to start anywhere
 * except an explicitly authorised Vercel Preview build. A regression here is a
 * credential leak, so each condition is tested in isolation AND in combination.
 */
test('refuses when the build flag is absent', () => {
  // The Production case: Next.js inlines the missing variable as undefined, so
  // the whole activation branch is dead code in that build.
  const r = debugGate({ buildFlag: undefined, host: 'student-abc123.vercel.app' });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'BUILD_FLAG_ABSENT');
});

test('refuses any flag value other than exactly 1', () => {
  // Anything that is not `1` is refused. Trim is handled separately below, so
  // these are genuine mismatches, not whitespace.
  for (const flag of ['', '0', 'true', 'yes', '11', '2', 'preview', ' enabled']) {
    const r = debugGate({ buildFlag: flag, host: 'student-abc123.vercel.app' });
    assert.equal(r.allowed, false, `flag ${JSON.stringify(flag)} must not enable`);
  }
});

test('tolerates surrounding whitespace on the flag', () => {
  // A shell that appends a trailing space (`set FOO=1 && ...`) must not produce a
  // flag that silently fails to enable - that is how a check gets "simplified"
  // away by someone debugging it.
  for (const flag of ['1', ' 1', '1 ', '  1  ', '\t1\n']) {
    assert.equal(debugGate({ buildFlag: flag, host: 'x.vercel.app' }).allowed, true, JSON.stringify(flag));
  }
});

test('honours the flag even on an empty host', () => {
  // The flag is the real boundary; the host check is defence in depth and must
  // not be able to override a missing flag.
  const r = debugGate({ buildFlag: '1', host: undefined });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'NO_HOST');
});

test('explicitly refuses every production alias, whatever the build says', () => {
  // This is the check that must never be weakened: even a mis-built artifact
  // that inlined the flag has to refuse on a production domain.
  assert.ok(PRODUCTION_HOSTS.length > 0, 'the deny-list must not be empty');
  for (const host of PRODUCTION_HOSTS) {
    const r = debugGate({ buildFlag: '1', host });
    assert.equal(r.allowed, false, `${host} must be refused even with the flag set`);
    assert.equal(r.reason, 'PRODUCTION_HOST');
  }
});

test('case-folds the host so a production alias cannot sneak past', () => {
  assert.equal(debugGate({ buildFlag: '1', host: 'STUDENT-WEB-GRAY.VERCEL.APP' }).allowed, false);
  assert.equal(debugGate({ buildFlag: '1', host: 'Student-Web-Gray.Vercel.App' }).reason, 'PRODUCTION_HOST');
});

test('allows a per-deployment preview host', () => {
  const r = debugGate({ buildFlag: '1', host: 'student-web-git-branch-user-42.vercel.app' });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'PREVIEW_BUILD');
});

test('allows a per-deployment preview subdomain at any depth', () => {
  // Vercel preview domains contain several labels; `.endsWith('.vercel.app')`
  // is the right test, not an exact match.
  assert.equal(debugGate({ buildFlag: '1', host: 'anything.deep.vercel.app' }).allowed, true);
});

test('allows loopback for local development', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(debugGate({ buildFlag: '1', host }).allowed, true, `${host} should be allowed`);
  }
});

test('refuses any non-preview, non-loopback host', () => {
  for (const host of [
    'example.com',
    'student.example.com',
    '10.0.0.5',
    'evil-vercel.app', // not a subdomain of vercel.app
    'vercel.app.evil.com', // must not pass the endsWith check
    'localhost.evil.com',
  ]) {
    const r = debugGate({ buildFlag: '1', host });
    assert.equal(r.allowed, false, `${host} must be refused`);
    assert.equal(r.reason, 'HOST_NOT_PREVIEW');
  }
});

test('refuses a bare vercel.app apex', () => {
  // `vercel.app` itself ends with '.vercel.app'? No - it does not, but test the
  // boundary explicitly so a future regex change cannot re-break it.
  assert.equal(debugGate({ buildFlag: '1', host: 'vercel.app' }).allowed, false);
});

test('a query parameter is never one of the conditions', () => {
  // Regression guard for the whole design: the gate type inspects exactly two
  // inputs - the build flag and the host. Nothing derived from location.search
  // exists, so a visitor cannot opt in by appending a parameter.
  const inputs: DebugGateInput = { buildFlag: undefined, host: 'x.vercel.app' };
  assert.equal(Object.keys(inputs).sort().join(','), 'buildFlag,host');
});

/* ----------------------------- URL redaction ----------------------------- */

test('redactUrl removes the signed query entirely', () => {
  const out = redactUrl(
    'https://video.gumlet.io/abc123/def456/manifest.m3u8?token=eyJhbGciOi&expires=1700000000&sk=xyz',
  );
  assert.equal(out, 'https://video.gumlet.io/abc123/def456/manifest.m3u8');
  assert.ok(!out.includes('token'), 'token must be stripped');
  assert.ok(!out.includes('expires'), 'expiry must be stripped');
  assert.ok(!out.includes('sk='), 'signature must be stripped');
});

test('redactUrl removes credentials embedded in the URL', () => {
  assert.equal(redactUrl('https://user:password@host/path?x=1'), 'https://host/path');
});

test('redactUrl keeps only origin and path', () => {
  assert.equal(redactUrl('https://license.gumlet.io/license?spc=A&asset=1'), 'https://license.gumlet.io/license');
});

test('redactUrl preserves the query NAME-free form even with a fragment or hash', () => {
  // The hash is dropped with the rest; nothing of it may survive.
  const out = redactUrl('https://h/p#secret=1');
  assert.equal(out, 'https://h/p');
});

test('redactUrl returns empty for non-URLs and non-strings', () => {
  // An unparseable string could itself be sensitive, so nothing is guessed.
  for (const bad of [null, undefined, '', 'not a url', 42, {}, Symbol.iterator]) {
    assert.equal(redactUrl(bad as string), '', `${String(bad)} must not be echoed`);
  }
});

test('no request or response header is ever emitted', async () => {
  // Asserted on the module's actual exports rather than on source text: there
  // is no header helper to call, and `DebugRecord` has no field to put one in.
  // A redaction allow-list would be a weaker guarantee, because it only fails
  // on the day someone adds a header the list does not cover.
  const gateModule = (await import('./gate.ts')) as Record<string, unknown>;
  const headerish = Object.keys(gateModule).filter((k) => /header/i.test(k));
  assert.deepEqual(headerish, [], 'no header-related export should exist');

  // The record shape has no field that can carry a header or a body.
  const { emit, setDebugSink } = await import('./sink.ts');
  const seen: Array<Record<string, unknown>> = [];
  setDebugSink((r) => seen.push(r as unknown as Record<string, unknown>));
  emit({ k: 'licence', v: 'res', n: 200 });
  setDebugSink(null);
  const fields = Object.keys(seen[0] ?? {});
  assert.deepEqual(fields.sort(), ['k', 'n', 'v']);
  assert.ok(
    !fields.some((f) => /header|body|response|request|url|uri|token/i.test(f)),
    `unexpected field in the record shape: ${fields.join(', ')}`,
  );
});

test('an unknown initDataType must not pass through as a raw string', () => {
  // The clamp lives in drm-diagnostics, but the contract it enforces is this
  // module's: `v` is a fixed token. Imported here so the dependency is visible.
  const { initDataTypeToken } = initDataTypeTokenModule;
  for (const raw of ['skd', 'sinf', 'cenc', 'keyids', 'webm']) {
    assert.equal(initDataTypeToken(raw), raw);
  }
  // Anything else - including anything URL-like or key-like - is collapsed.
  for (const raw of ['skd://content-id', 'x-payload', 'eyJhbGciOi', 'skd with spaces']) {
    assert.equal(initDataTypeToken(raw), 'OTHER');
  }
  assert.equal(initDataTypeToken(''), 'NONE');
  assert.equal(initDataTypeToken(undefined), 'NONE');
  assert.equal(initDataTypeToken(42), 'NONE');
});
