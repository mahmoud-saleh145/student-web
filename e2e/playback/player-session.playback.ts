import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

/**
 * The web player against a stand-in backend, in real Chrome with Widevine.
 *
 * PUBLIC TEST CONTENT ONLY: Google's Shaka demo "Sintel" and Google's Widevine
 * test proxy. No Gumlet, R2, lecture, account or backend is involved.
 */

const EXPECT = (process.env.PLAYBACK_EXPECT_MODE ?? 'legacy') as 'legacy' | 'session';
const MANIFEST = 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd';
const LICENSE = 'https://cwip-shaka-proxy.appspot.com/no_auth';
const VIDEO_ID = 'vid-e2e';
const USER = { id: 'stu-e2e-1', fullName: 'E2E Student', phone: '01000000000' };

type Call = { method: string; path: string; body: unknown; at: number };

function ticketFor(n: number) {
  return {
    ticketId: `tk-${n}`,
    // A renewed ticket carries DIFFERENT URLs, as the real backend's would. If
    // the page handed them to the player, it would reload - which is what the
    // test is watching for.
    manifestUrl: n === 0 ? MANIFEST : `${MANIFEST}?renewed=${n}`,
    playbackHeaders: {},
    drm: { scheme: 'widevine', licenseUrl: n === 0 ? LICENSE : `${LICENSE}?renewed=${n}`, certificateUrl: null, licenseHeaders: {} },
    embedUrl: null,
    watermark: { primary: 'E2E Student', secondary: 'ID: e2e', sessionTag: 'e2e', opacity: 0.3, moveIntervalSeconds: 20 },
    captions: [],
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    ttlSeconds: 300,
    resumePositionSeconds: 0,
    streamSessionId: 'stream-e2e',
    heartbeatIntervalSeconds: 10,
  };
}

async function signIn(context: BrowserContext, baseURL: string) {
  const url = new URL(baseURL);
  const profile = encodeURIComponent(
    JSON.stringify({ ...USER, role: 'STUDENT', status: 'ACTIVE', avatarUrl: null }),
  );
  await context.addInitScript(() => {
    try {
      localStorage.setItem('edu-web-language', JSON.stringify({ state: { language: 'en' }, version: 0 }));
    } catch {
      /* ignore */
    }
  });
  await context.addCookies([
    { name: 'edu_at', value: 'test-access', domain: url.hostname, path: '/' },
    { name: 'edu_rt', value: 'test-refresh', domain: url.hostname, path: '/' },
    { name: 'edu_pf', value: profile, domain: url.hostname, path: '/' },
  ]);
}

/** Stand-in backend. `terminateOnBeat` makes that heartbeat answer with a stop. */
async function serve(
  page: Page,
  options: {
    terminateOnBeat?: number;
    terminateReason?: string;
    /** Answer that heartbeat with an HTTP error, as the proxy would relay it. */
    errorOnBeat?: { beat: number; status: number; code: string };
  } = {},
) {
  const calls: Call[] = [];
  let issued = 0;
  let beats = 0;
  await page.route('**/api/proxy/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^.*\/api\/proxy\//, '');
    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = undefined;
    }
    calls.push({ method: req.method(), path, body, at: Date.now() });
    const ok = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', json: { success: true, data } });

    if (path === 'auth/me') return ok({ ...USER, role: 'STUDENT', status: 'ACTIVE', avatarUrl: null });
    if (path === `lessons/by-video/${VIDEO_ID}`) {
      return ok({
        id: 'lesson-e2e',
        courseId: 'course-e2e',
        title: 'Sintel (public demo)',
        video: { id: VIDEO_ID },
        progress: null,
        nextVideoId: null,
      });
    }
    if (path === `playback/videos/${VIDEO_ID}/ticket`) return ok(ticketFor(issued++ === 0 ? 0 : 100 + issued));
    if (path === `playback/videos/${VIDEO_ID}/allowance`) return ok({ used: 0, limit: 3, remaining: 3 });
    const hb = /^playback\/tickets\/([^/]+)\/heartbeat$/.exec(path);
    if (hb) {
      beats += 1;
      if (options.errorOnBeat?.beat === beats) {
        const { status, code } = options.errorOnBeat;
        return route.fulfill({
          status,
          contentType: 'application/json',
          json: { success: false, error: { code, message: code }, code, message: code },
        });
      }
      if (options.terminateOnBeat === beats) {
        return ok({ ok: false, terminate: { reason: options.terminateReason ?? 'Session revoked' } });
      }
      return ok({ ok: true, terminate: null, ticket: ticketFor(beats) });
    }
    if (path === 'progress') return ok({});
    if (/^playback\/tickets\//.test(path) && req.method() === 'DELETE') return ok({ ok: true });
    return ok({});
  });
  return calls;
}

function watchLicenceAndManifest(page: Page) {
  const seen = { licence: 0, manifest: 0, renewedUrlsUsed: 0 };
  page.on('request', (r: Request) => {
    const u = r.url();
    if (u.startsWith(LICENSE) && r.method() === 'POST') seen.licence += 1;
    if (u.startsWith(MANIFEST)) seen.manifest += 1;
    if (u.includes('renewed=')) seen.renewedUrlsUsed += 1;
  });
  return seen;
}

/** Waits until Chrome's Widevine component is installed (first run of a fresh profile). */
async function ensureWidevine(page: Page) {
  await page.goto('/favicon.ico').catch(() => undefined);
  await page.waitForFunction(
    async () => {
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
          { initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] },
        ]);
        return true;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 120_000, polling: 2_000 },
  );
}

async function startPlaying(page: Page) {
  const video = page.locator('video').first();
  await expect(video).toBeAttached();
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return !!v && v.readyState >= 2;
  });
  await page.evaluate(async () => {
    const v = document.querySelector('video') as HTMLVideoElement & { __e2eMark?: string };
    v.muted = true;
    v.__e2eMark = 'original-element';
    await v.play();
  });
}

const currentTime = (page: Page) =>
  page.evaluate(() => (document.querySelector('video') as HTMLVideoElement | null)?.currentTime ?? -1);
const sameElement = (page: Page) =>
  page.evaluate(() => (document.querySelector('video') as (HTMLVideoElement & { __e2eMark?: string }) | null)?.__e2eMark ?? null);

test(`player session in a ${EXPECT} build`, async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  const calls = await serve(page);
  await ensureWidevine(page);
  const seen = watchLicenceAndManifest(page);
  await page.goto(`/player/${VIDEO_ID}`);
  await startPlaying(page);

  // Let the first licence settle, then measure across ~3 renewal periods.
  await page.waitForTimeout(3_000);
  const licenceAfterStart = seen.licence;
  const manifestAfterStart = seen.manifest;
  const t0 = await currentTime(page);
  await page.waitForTimeout(34_000);
  const t1 = await currentTime(page);

  const beats = calls.filter((c) => /heartbeat$/.test(c.path));
  const tickets = calls.filter((c) => /\/ticket$/.test(c.path));

  test.info().annotations.push(
    { type: 'heartbeats', description: String(beats.length) },
    { type: 'heartbeat ticket ids', description: beats.map((b) => b.path.split('/')[2]).join(',') },
    { type: 'licence POSTs at start / end', description: `${licenceAfterStart} / ${seen.licence}` },
    { type: 'manifest loads at start / end', description: `${manifestAfterStart} / ${seen.manifest}` },
    { type: 'currentTime t0 / t1', description: `${t0.toFixed(1)} / ${t1.toFixed(1)}` },
    { type: 'ticket requests', description: String(tickets.length) },
  );

  console.log(`[e2e-measure] mode=${EXPECT} ` + JSON.stringify({ heartbeats: beats.length, heartbeatTickets: beats.map((b) => b.path.split("/")[2]), watchedDeltas: beats.map((b) => (b.body as { watchedDeltaSeconds?: number })?.watchedDeltaSeconds ?? null), positions: beats.map((b) => (b.body as { positionSeconds?: number })?.positionSeconds ?? null), licencePostsStart: licenceAfterStart, licencePostsEnd: seen.licence, manifestLoadsStart: manifestAfterStart, manifestLoadsEnd: seen.manifest, renewedUrlsUsed: seen.renewedUrlsUsed, ticketRequests: tickets.length, progressPosts: calls.filter((c) => c.path === "progress").length, t0, t1, sameElement: await sameElement(page) }));

  // The video kept playing on the same element in every build.
  expect(await sameElement(page)).toBe('original-element');
  expect(t1).toBeGreaterThan(t0 + 25);

  if (EXPECT === 'legacy') {
    // Flag OFF: exactly today's behaviour - the DRM player sends no heartbeat.
    expect(beats.length).toBe(0);
    expect(tickets.length).toBe(1);
    return;
  }

  // Flag ON: heartbeats flow and renew the ticket...
  expect(beats.length).toBeGreaterThanOrEqual(3);
  const ids = beats.map((b) => b.path.split('/')[2]);
  expect(ids[0]).toBe('tk-0');
  expect(ids[1]).toBe('tk-1');
  expect(ids[2]).toBe('tk-2');
  const watched = beats.reduce((s, b) => s + ((b.body as { watchedDeltaSeconds?: number })?.watchedDeltaSeconds ?? 0), 0);
  expect(watched).toBeGreaterThanOrEqual(20);
  const positions = beats.map((b) => (b.body as { positionSeconds: number }).positionSeconds);
  expect(positions.at(-1)!).toBeGreaterThan(positions[0]!);
  // ...WITHOUT a remount, a new manifest load, a new licence, or a new ticket request.
  expect(seen.licence).toBe(licenceAfterStart);
  expect(seen.manifest).toBe(manifestAfterStart);
  expect(seen.renewedUrlsUsed).toBe(0);
  expect(tickets.length).toBe(1);
  // Progress is reported after beats.
  expect(calls.filter((c) => c.path === 'progress').length).toBeGreaterThanOrEqual(2);
});

test(`revocation in a ${EXPECT} build`, async ({ page, context, baseURL }) => {
  test.skip(EXPECT !== 'session', 'revocation is only reachable with heartbeats (flag ON)');
  await signIn(context, baseURL!);
  await serve(page, { terminateOnBeat: 2, terminateReason: 'Session revoked' });
  await ensureWidevine(page);
  await page.goto(`/player/${VIDEO_ID}`);
  await startPlaying(page);
  // Beat 1 at ~10 s renews; beat 2 at ~20 s is answered with a stop.
  await expect(page.getByText(/not allowed to play this video/i)).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('video')).toHaveCount(0);
});

test(`a second tab stops the first in a ${EXPECT} build`, async ({ context, baseURL }) => {
  test.skip(EXPECT !== 'session', 'the tab lock belongs to the session (flag ON)');
  await signIn(context, baseURL!);
  const first = await context.newPage();
  const firstCalls = await serve(first);
  await ensureWidevine(first);
  await first.goto(`/player/${VIDEO_ID}`);
  await startPlaying(first);

  const second = await context.newPage();
  const secondCalls = await serve(second);
  await second.goto(`/player/${VIDEO_ID}`);
  await startPlaying(second);

  await expect(first.getByText(/watching on another session/i)).toBeVisible({ timeout: 20_000 });
  await expect(first.locator('video')).toHaveCount(0);
  expect(await sameElement(second)).toBe('original-element');

  // M1: the first tab's release removed the browser's shared stream slot on
  // the server; the second tab must re-assert it straight away (a heartbeat
  // right after the release), not at its next scheduled beat.
  const isRelease = (c: Call) => c.method === 'DELETE' && /^playback\/tickets\//.test(c.path);
  await expect.poll(() => firstCalls.some(isRelease), { timeout: 10_000 }).toBe(true);
  const release = firstCalls.find(isRelease)!;
  const isBeatAfter = (c: Call) => /heartbeat$/.test(c.path) && c.at >= release.at;
  await expect.poll(() => secondCalls.some(isBeatAfter), { timeout: 10_000 }).toBe(true);
  const reassert = secondCalls.find(isBeatAfter)!;
  const secondIssued = secondCalls.find((c) => /\/ticket$/.test(c.path))!;
  console.log(
    `[e2e-measure] reassert heartbeat ${reassert.at - release.at} ms after the other tab's release ` +
      `(${reassert.at - secondIssued.at} ms after this tab's ticket)`,
  );
  expect(reassert.at - release.at).toBeLessThan(1_500);
  // And it is the release-triggered beat, not this tab's early beat (~5 s after start).
  expect(reassert.at - secondIssued.at).toBeLessThan(4_500);
});

// Client-side handling of the proxy's 410 relay. The stand-in backend answers
// the browser directly, so the proxy route itself is NOT exercised here; its
// 401 -> 410 relay is covered by src/lib/proxy-401-relay.test.ts.
test(`a ticket-level 410 ends playback without signing out (client side) in a ${EXPECT} build`, async ({ page, context, baseURL }) => {
  test.skip(EXPECT !== 'session', 'heartbeats only run with the flag ON');
  await signIn(context, baseURL!);
  const calls = await serve(page, { errorOnBeat: { beat: 1, status: 410, code: 'PLAYBACK_TICKET_EXPIRED' } });
  await ensureWidevine(page);
  await page.goto(`/player/${VIDEO_ID}`);
  await startPlaying(page);
  await expect(page.getByText(/playback session expired/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('video')).toHaveCount(0);
  // Still signed in: no logout, no redirect to sign-in, session cookies intact.
  expect(page.url()).toContain(`/player/${VIDEO_ID}`);
  expect(calls.some((c) => c.path.startsWith('auth/logout'))).toBe(false);
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).toEqual(expect.arrayContaining(['edu_at', 'edu_rt']));
  // And no silent re-issue on a ticket the server does not know.
  expect(calls.filter((c) => /\/ticket$/.test(c.path)).length).toBe(1);
});
