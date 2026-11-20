import { expect, test } from '@playwright/test';

import {
  DISABLED,
  GENERAL,
  PASSWORD,
  STAFF,
  WEB,
  backendExpireAccess,
  backendReset,
  backendState,
  calls,
  signIn,
  signInThroughForm,
  useEnglish,
} from './support';

/**
 * Who gets in, as what, and what the portal's server refuses to do.
 *
 * These are the properties that must hold whatever a page — or a hand-written
 * request — tries: the portal is its own tree with its own session, signing in
 * to it is not registering a device, and its proxy cannot reach protected
 * content.
 */

test.beforeEach(async ({ context, request }) => {
  await backendReset(request);
  await useEnglish(context);
});

test.describe('direct access and the portal’s own gate', () => {
  test('/activate without a session opens the portal sign-in, never the learning website’s', async ({ page }) => {
    await page.goto('/activate');
    await expect(page).toHaveURL(/\/activate\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Activation portal').first()).toBeVisible();
    // No way out of the portal from its sign-in: no register, no password-help link.
    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.filter((h) => h && !h.startsWith('/activate'))).toEqual([]);
  });

  test('a deep portal page remembers where the student was going', async ({ page }) => {
    await page.goto('/activate/courses/c-mech');
    await expect(page).toHaveURL(/\/activate\/login\?next=%2Factivate%2Fcourses%2Fc-mech$/);
    await page.locator('input[name="phone"]').fill(GENERAL.phone);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/activate\/courses\/c-mech$/);
    await expect(page.getByRole('heading', { name: 'Mechanics 101' })).toBeVisible();
  });

  test('a `next` that leaves the portal is ignored', async ({ page }) => {
    for (const next of ['/lessons/l1', '/player/v1', '/home', 'https://evil.test/activate', '/api/activate/proxy/courses']) {
      await page.context().clearCookies();
      await page.goto(`/activate/login?next=${encodeURIComponent(next)}`);
      await page.locator('input[name="phone"]').fill(GENERAL.phone);
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page, next).toHaveURL(/\/activate$/);
    }
  });

  test('an address under /activate that is not a page leads back to the portal', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech/watch');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the portal' })).toHaveAttribute('href', '/activate');
  });
});

test.describe('sign-in with the existing Student Center account', () => {
  test('signs in, greets the student, and is not a playback device', async ({ page, request }) => {
    await signInThroughForm(page, GENERAL.phone);
    await expect(page).toHaveURL(/\/activate$/);
    await expect(page.getByRole('heading', { name: `Hello, ${GENERAL.firstName}` })).toBeVisible();

    const state = await backendState(request);
    // Exactly one sign-in, carrying no device identity of any kind.
    expect(state.loginHeaders).toEqual([{ 'x-device-id': null, 'x-device-platform': null, 'x-client': 'web' }]);
    // So the backend bound nothing: no device row, no mismatch event, no device on the session.
    expect(state.devices).toEqual([]);
    expect(state.securityEvents).toEqual([]);
    expect(state.sessions).toEqual([{ userId: GENERAL.id, deviceId: null, revoked: false }]);
  });

  test('no request the portal makes ever carries a device header', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    for (const path of ['/activate', '/activate/courses', '/activate/courses/c-mech', '/activate/library', '/activate/wallet', '/activate/my-activations', '/activate/account']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    const state = await backendState(request);
    expect(state.requests.length).toBeGreaterThan(8);
    expect(state.deviceHeaderRequests).toEqual([]);
    expect(state.devices).toEqual([]);
  });

  test('keeps tokens in its own HttpOnly cookies and leaves the learning website’s alone', async ({ page }) => {
    await signInThroughForm(page, GENERAL.phone);
    await expect(page).toHaveURL(/\/activate$/);
    const cookies = await page.context().cookies();
    const byName = Object.fromEntries(cookies.map((c) => [c.name, c]));

    for (const name of ['edu_act_at', 'edu_act_rt', 'edu_act_pf']) {
      expect(byName[name], name).toBeTruthy();
      expect(byName[name]!.httpOnly, name).toBe(true);
      expect(byName[name]!.sameSite, name).toBe('Lax');
    }
    // No learning-website session, and no device identity cookie.
    for (const name of ['edu_at', 'edu_rt', 'edu_pf', 'edu_did']) expect(byName[name], name).toBeUndefined();
    // Nothing a page script can read holds a token.
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/edu_act|at\.|rt\./);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/\b(at|rt)\.[0-9a-f-]{8}/);
  });

  test('refuses a wrong password without creating a session', async ({ page, request }) => {
    await signInThroughForm(page, GENERAL.phone, 'not-the-password');
    await expect(page.getByTestId('login-error')).toContainText('The phone number or password is incorrect.');
    await expect(page).toHaveURL(/\/activate\/login$/);
    expect((await page.context().cookies()).filter((c) => c.name.startsWith('edu_act'))).toEqual([]);
    expect((await backendState(request)).sessions).toEqual([]);
  });

  test('refuses a staff account and ends the session the backend opened for it', async ({ page, request }) => {
    await signInThroughForm(page, STAFF.phone);
    await expect(page.getByTestId('login-error')).toContainText('This portal is for student accounts only.');
    expect((await page.context().cookies()).filter((c) => c.name.startsWith('edu_act'))).toEqual([]);
    expect((await backendState(request)).sessions).toEqual([{ userId: STAFF.id, deviceId: null, revoked: true }]);
  });

  test('refuses a disabled account', async ({ page }) => {
    await signInThroughForm(page, DISABLED.phone);
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/activate\/login$/);
  });

  test('renews an expired access token without signing the student out', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses');
    await expect(page.getByTestId('course-card').first()).toBeVisible();

    await backendExpireAccess(request, GENERAL.id);
    await page.goto('/activate/wallet');
    await expect(page.getByTestId('wallet-balance')).toBeVisible();
    await expect(page).toHaveURL(/\/activate\/wallet$/);

    const state = await backendState(request);
    // One refresh for the burst of requests the page made, not one each.
    expect(calls(state, 'POST', '/auth/refresh')).toBe(1);
    expect(state.sessions).toEqual([{ userId: GENERAL.id, deviceId: null, revoked: false }]);
  });

  test('sign out ends only the portal session', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/account');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/activate\/login$/);

    const state = await backendState(request);
    expect(calls(state, 'POST', '/auth/logout')).toBe(1);
    // Never the call that would sign the phone out too.
    expect(calls(state, 'POST', '/auth/logout-all')).toBe(0);
    expect((await page.context().cookies()).filter((c) => c.name.startsWith('edu_act') && c.value)).toEqual([]);

    await page.goto('/activate/courses');
    await expect(page).toHaveURL(/\/activate\/login/);
  });
});

test.describe('the portal proxy: allow-list, CSRF, no caching', () => {
  test('answers 401 to anyone without a portal session', async ({ request }) => {
    for (const path of ['courses', 'courses/c-mech', 'wallet', 'library/materials', 'auth/me']) {
      const res = await request.get(`/api/activate/proxy/${path}`);
      expect(res.status(), path).toBe(401);
    }
    const redeem = await request.post('/api/activate/proxy/courses/c-mech/redeem', { headers: WEB, data: { code: 'FULL-MECH-0001' } });
    expect(redeem.status()).toBe(401);
  });

  test('never forwards a protected-content, device or session route — signed in or not', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);

    const attempts: [string, string][] = [
      ['GET', 'lessons/l1'],
      ['GET', 'lessons/by-video/v1'],
      ['POST', 'playback/videos/v1/ticket'],
      ['GET', 'playback/manifest/t1/master.m3u8'],
      ['GET', 'attachments/att-1/ticket'],
      ['POST', 'library/parts/mp-1/open'],
      ['POST', 'library/parts/mp-free/open'],
      ['GET', 'devices'],
      ['POST', 'devices/change-request'],
      ['POST', 'auth/logout-all'],
      ['POST', 'auth/login'],
      ['GET', 'courses/c-mech/sections'],
    ];
    for (const [method, path] of attempts) {
      const res =
        method === 'GET'
          ? await page.request.get(`/api/activate/proxy/${path}`)
          : await page.request.post(`/api/activate/proxy/${path}`, { headers: WEB, data: {} });
      expect(res.status(), `${method} ${path}`).toBe(403);
      const body = await res.json();
      expect(body.code, `${method} ${path}`).toBe('PATH_NOT_ALLOWED');
      expect(JSON.stringify(body)).not.toContain('LEAK');
    }
    // Other verbs do not exist on the portal proxy at all.
    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await page.request[method]('/api/activate/proxy/profile', { headers: WEB, data: {} });
      expect(res.status(), method).toBe(405);
    }

    const state = await backendState(request);
    expect(state.protectedHits).toEqual([]);
    expect(calls(state, 'POST', '/auth/logout-all')).toBe(0);
  });

  test('refuses a state-changing request that did not come from the portal’s own pages', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    const url = '/api/activate/proxy/courses/c-mech/redeem';
    const data = { code: 'FULL-MECH-0001' };

    // No marker header (what a cross-site form can send).
    expect((await page.request.post(url, { data })).status()).toBe(403);
    // Marker header, but the browser says another site started it.
    expect((await page.request.post(url, { data, headers: { ...WEB, 'sec-fetch-site': 'cross-site' } })).status()).toBe(403);
    expect((await page.request.post(url, { data, headers: { ...WEB, origin: 'https://evil.test' } })).status()).toBe(403);
    // The same for sign-in and sign-out.
    expect((await page.request.post('/api/activate/auth/logout')).status()).toBe(403);
    expect((await request.post('/api/activate/auth/login', { data: { phone: GENERAL.phone, password: PASSWORD } })).status()).toBe(403);

    const state = await backendState(request);
    expect(calls(state, 'POST', '/courses/c-mech/redeem')).toBe(0);
    expect(state.codes['FULL-MECH-0001']!.redemptionCount).toBe(0);
    expect(calls(state, 'POST', '/auth/logout')).toBe(0);
  });

  test('never starts an online payment', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    const res = await page.request.post('/api/activate/proxy/courses/c-mech/enroll', { headers: WEB, data: { method: 'PAYMENT' } });
    expect(res.status()).toBe(403);
    expect(calls(await backendState(request), 'POST', '/courses/c-mech/enroll')).toBe(0);
  });

  test('marks every answer no-store, and never echoes a token', async ({ page }) => {
    const login = await page.request.post('/api/activate/auth/login', { headers: WEB, data: { phone: GENERAL.phone, password: PASSWORD } });
    expect(login.headers()['cache-control']).toBe('private, no-store');
    expect(await login.text()).not.toMatch(/accessToken|refreshToken|at\.|rt\./);

    for (const path of ['courses', 'wallet', 'library/materials', 'lessons/l1']) {
      const res = await page.request.get(`/api/activate/proxy/${path}`);
      expect(res.headers()['cache-control'], path).toBe('private, no-store');
    }
  });
});

test.describe('the learning website is untouched', () => {
  test('its sign-in and its gate behave as before', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();

    await page.goto('/my-courses');
    await expect(page).toHaveURL(/\/login\?next=%2Fmy-courses$/);
  });

  test('a portal session is not a learning-website session', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/my-courses');
    await expect(page).toHaveURL(/\/login\?next=%2Fmy-courses$/);
    // And the learning website's proxy does not accept the portal's cookies.
    expect((await page.request.get('/api/proxy/courses')).status()).toBe(401);
    // The portal session survived the detour.
    await page.goto('/activate/wallet');
    await expect(page).toHaveURL(/\/activate\/wallet$/);
    await expect(page.getByTestId('wallet-balance')).toBeVisible();
  });

  test('its own proxy keeps its own rules', async ({ request }) => {
    // Unauthenticated, as before: 401 for a route it serves, 403 for one it blocks.
    expect((await request.get('/api/proxy/lessons/l1')).status()).toBe(401);
    expect((await request.get('/api/proxy/admin/users')).status()).toBe(403);
    // Registration lists stay public.
    expect((await request.get('/api/proxy/catalog/academic-years')).status()).toBe(200);
  });
});
