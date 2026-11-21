import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Wiring guards for the web playback session.
 *
 * The page and DrmVideo are React components this repo's `node --test` cannot
 * render, so - like drm-video.test.ts - these assert on the source. They pin
 * the three properties that matter most and are easy to break by accident:
 * renewal never remounts the player, the flag-OFF path is the old code, and
 * DrmVideo's player effect still depends on exactly what it did before.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const page = stripComments(read('./[id]/page.tsx'));
const drm = stripComments(read('../../components/protection/DrmVideo.tsx'));

function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  assert.ok(a >= 0, `missing: ${start}`);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, `missing after ${start}: ${end}`);
  return src.slice(a, b);
}

describe('renewal never remounts the player', () => {
  it('a renewed or recovered ticket only replaces ticketRef', () => {
    const onTicket = between(page, 'onTicket: (next) => {', 'onTerminate:');
    assert.match(onTicket, /ticketRef\.current = next;/);
    assert.doesNotMatch(onTicket, /setTicket/);
  });

  it('the session is keyed on the loaded ticket state, not on renewals', () => {
    assert.match(page, /\}, \[sessionMode, ticket, tabId\]\);/);
  });

  it('the ticket state is only set by loadTicket and by the unchanged legacy heartbeat', () => {
    const calls = page.match(/setTicket\(/g) ?? [];
    assert.equal(calls.length, 2);
    const legacy = between(page, 'if (!ticket || sessionMode) return;', '}, [ticket, lessonId, sessionMode]);');
    assert.match(legacy, /setTicket\(r\.ticket\)/);
  });

  it("DrmVideo's player effect still depends on exactly the same values", () => {
    assert.match(
      drm,
      /\}, \[manifestUrl, drm\.scheme, drm\.licenseUrl, drm\.certificateUrl, captionsEnabled, captions, mark, markMediaState\]\);/,
    );
  });

  it('DrmVideo exposes its element and seek/stall events through the callback ref, not effect deps', () => {
    assert.match(drm, /cbs\.current\.onMediaElement\?\.\(mediaElement\)/);
    assert.match(drm, /cbs\.current\.onMediaElement\?\.\(null\)/);
    for (const ev of ['seeking', 'seeked', 'waiting']) {
      assert.match(drm, new RegExp(`addEventListener\\('${ev}'`));
    }
  });
});

describe('flag OFF keeps the old behaviour', () => {
  it('the legacy heartbeat and release effects only stand down in session mode', () => {
    assert.match(page, /if \(!ticket \|\| sessionMode\) return;/);
    assert.match(page, /if \(sessionMode\) return;\s*const video = videoRef\.current;/);
  });

  it('the session effect does nothing unless session mode is on', () => {
    assert.match(page, /if \(!sessionMode \|\| !ticket\) return;/);
  });

  it('DRM event props are only passed in session mode', () => {
    assert.match(page, /\{\.\.\.\(sessionMode\s*\?\s*\{\s*onMediaElement:/);
  });

  it('the mode comes from the flag module, which defaults to legacy', () => {
    assert.match(page, /resolvePlaybackSessionMode\(\s*readPlaybackSessionFlagEnv\(\)/);
  });
});

describe('recovery uses the full ticket request', () => {
  it('first load and recovery share requestPlaybackTicket', () => {
    assert.match(page, /requestPlaybackTicket\(videoId\),/);
    assert.match(page, /reissue: \(\) => requestPlaybackTicket\(videoIdRef\.current\)/);
  });
});

describe('review fixes are wired', () => {
  it('closing the tab releases with keepalive; a bfcache restore starts over', () => {
    assert.match(page, /window\.addEventListener\('pagehide', onPageHide\)/);
    assert.match(page, /const onPageHide = \(\) => session\.unload\(\);/);
    assert.match(page, /keepalive: true/);
    assert.match(page, /event\.persisted && session\.wasUnloaded/);
  });

  it('StrictMode re-runs reuse the live session for the same ticket instead of releasing it', () => {
    assert.match(page, /live\.ticket === ticket && live\.stopTimer !== null && !live\.session\.isStopped/);
    assert.match(page, /current\.stopTimer = window\.setTimeout\(/);
  });

  it('the mode is latched once a ticket exists', () => {
    assert.match(page, /if \(ticket && latchedSessionMode === null\) setLatchedSessionMode\(computedSessionMode\);/);
    assert.match(page, /const sessionMode = latchedSessionMode \?\? computedSessionMode;/);
  });

  it('a session is bound to the lesson it was created for (refs, not effect deps)', () => {
    assert.match(page, /lessonId: lessonIdRef\.current,/);
  });
});

describe('no secrets on screen or in logs', () => {
  it('the session surfaces only the server reason, never a ticket, URL or token', () => {
    const session = between(page, 'if (!sessionMode || !ticket) return;', '}, [sessionMode, ticket, tabId]);');
    assert.doesNotMatch(session, /console\./);
    assert.match(session, /onTerminate: \(reason\) => stopHere\(terminationErrorCode\(reason\), reason\)/);
  });
});

describe('follow-up fixes are wired (M1, M2, L1)', () => {
  it('M1: every release is broadcast to other tabs and re-asserts a newer session in this tab', () => {
    assert.match(page, /onReleased: \(\) => \{\s*broadcastPlaybackReleased\(tabId\);/);
    assert.match(page, /if \(current && current !== created\) current\.reclaimAfterPeerRelease\(\);/);
  });

  it('M1/L-2: a release in another tab makes the playing session re-claim (now + one bounded follow-up)', () => {
    assert.match(page, /onPeerReleased: \(\) => \{\s*if \(sessionRef\.current === session\) session\.reclaimAfterPeerRelease\(\);/);
  });

  it('L-3: the tab lock marks a superseded session, so a bfcache restore never takes playback back', () => {
    assert.match(page, /onSuperseded: \(\) => \{\s*if \(sessionRef\.current !== session\) return;\s*void session\.supersede\(\);/);
    // The restore only restarts a session that handed back a LIVE ticket.
    assert.match(page, /event\.persisted && session\.wasUnloaded && sessionRef\.current === session/);
  });

  it('M2: page visibility drives the embed idle release', () => {
    assert.match(page, /document\.addEventListener\('visibilitychange', onVisibility\)/);
    assert.match(page, /session\.onVisibilityChange\(document\.visibilityState === 'visible'\)/);
    assert.match(page, /document\.removeEventListener\('visibilitychange', onVisibility\)/);
  });

  it('M2/L6: a bfcache restore only restarts a session that was unloaded', () => {
    assert.match(page, /event\.persisted && session\.wasUnloaded && sessionRef\.current === session/);
    assert.doesNotMatch(page, /event\.persisted && session\.isStopped/);
  });
});
