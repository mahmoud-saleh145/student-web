import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { cohortBucket, readPlaybackSessionFlagEnv, resolvePlaybackSessionMode } from './playback-session-flag.ts';

const student = (id: string) => ({ id, role: 'STUDENT' });

describe('playback session flag', () => {
  it('is OFF when nothing is configured', () => {
    assert.equal(resolvePlaybackSessionMode({}, student('u1')), 'legacy');
    assert.equal(resolvePlaybackSessionMode({ mode: undefined, percent: '100' }, student('u1')), 'legacy');
    assert.equal(resolvePlaybackSessionMode({ mode: '', percent: '100' }, { id: 'a', role: 'ADMIN' }), 'legacy');
  });

  it('is OFF for any value other than "session"', () => {
    for (const mode of ['legacy', 'on', 'true', '1', 'sessions', 'enabled']) {
      assert.equal(resolvePlaybackSessionMode({ mode, percent: '100' }, student('u1')), 'legacy', mode);
    }
  });

  it('is OFF without a signed-in user', () => {
    assert.equal(resolvePlaybackSessionMode({ mode: 'session', percent: '100' }, null), 'legacy');
  });

  it('includes staff, and no student, when only the mode is set', () => {
    assert.equal(resolvePlaybackSessionMode({ mode: 'session' }, { id: 'x', role: 'ADMIN' }), 'session');
    assert.equal(resolvePlaybackSessionMode({ mode: 'session' }, { id: 'x', role: 'MASTER' }), 'session');
    for (let i = 0; i < 200; i += 1) {
      assert.equal(resolvePlaybackSessionMode({ mode: 'session' }, student(`s${i}`)), 'legacy');
    }
  });

  it('takes the configured share of students, stably', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `cm-student-${i}`);
    const inAt = (p: string) => ids.filter((id) => resolvePlaybackSessionMode({ mode: 'session', percent: p }, student(id)) === 'session');
    assert.equal(inAt('0').length, 0);
    assert.equal(inAt('100').length, ids.length);
    const ten = inAt('10');
    assert.ok(ten.length > 120 && ten.length < 280, `10% cohort was ${ten.length}/2000`);
    // Raising the percentage only adds students; nobody flips back.
    const fifty = new Set(inAt('50'));
    assert.ok(ten.every((id) => fifty.has(id)));
    assert.equal(cohortBucket('same-id'), cohortBucket('same-id'));
  });

  it('treats a malformed percentage as 0', () => {
    for (const percent of ['-5', 'abc', '12.5', '', '1000x']) {
      assert.equal(resolvePlaybackSessionMode({ mode: 'session', percent }, student('cm-1')), 'legacy', percent);
    }
  });

  it('reads the two NEXT_PUBLIC variables literally (so Next.js inlines them)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, './playback-session-flag.ts'), 'utf8');
    assert.match(src, /process\.env\.NEXT_PUBLIC_PLAYBACK_SESSION_MODE/);
    assert.match(src, /process\.env\.NEXT_PUBLIC_PLAYBACK_SESSION_PERCENT/);
    const saved = { ...process.env };
    delete process.env.NEXT_PUBLIC_PLAYBACK_SESSION_MODE;
    delete process.env.NEXT_PUBLIC_PLAYBACK_SESSION_PERCENT;
    try {
      assert.equal(resolvePlaybackSessionMode(readPlaybackSessionFlagEnv(), { id: 'a', role: 'ADMIN' }), 'legacy');
    } finally {
      Object.assign(process.env, saved);
    }
  });
});
