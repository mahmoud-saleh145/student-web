import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  PHONE_HEADERS,
  backend,
  card,
  closeDb,
  db,
  fx,
  phoneSignIn,
  resetRateLimits,
  type PhoneSession,
} from './backend';

/**
 * The activation portal against the real backend.
 *
 * One student, one story, in order: the phone is signed in first, then the
 * same student uses the portal in a browser — signs in, activates parts, a
 * section, a full course and a teacher card, tops up, buys a library document
 * — and the phone is checked again at the points where it matters.
 *
 * What a page says is never taken as proof. After each step the backend's own
 * database is read: the card's status, the entitlement rows, the wallet
 * ledger, the device and session rows.
 *
 * The tests are serial and share one browser page, because the state they
 * check accumulates in the backend. Re-seed (`seed.cjs`) before every run.
 */

test.describe.configure({ mode: 'serial' });

const WEB = { 'x-web-request': '1' };
const { mechanics, chemistry, physics, maths, free, programsOnly, draft } = fx.courses;

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture missing: ${what}. Re-run e2e/activation-real/seed.cjs.`);
  return value;
}

const statics = need(mechanics.sections[0], 'statics');
const dynamics = need(mechanics.sections[1], 'dynamics');
const fluids = need(mechanics.sections[2], 'fluids');
const revision = need(mechanics.sections[3], 'revision');
const chemistryLesson = need(chemistry.sections[0], 'chemistry section').lessonId;
const physicsLesson = need(physics.sections[0], 'physics section').lessonId;
const mathsLesson = need(maths.sections[0], 'maths section').lessonId;
const part1CardA = need(fx.codes.part1[0], 'part 1 card A');
const part1CardB = need(fx.codes.part1[1], 'part 1 card B');
const rechargeCard = need(fx.codes.recharge100[0], 'recharge card');

let context: BrowserContext;
let page: Page;
let phone: PhoneSession;

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      if (!localStorage.getItem('edu-web-language')) {
        localStorage.setItem('edu-web-language', JSON.stringify({ state: { language: 'en' }, version: 0 }));
      }
      if (!localStorage.getItem('edu-web-theme')) {
        localStorage.setItem('edu-web-theme', JSON.stringify({ state: { preference: 'light' }, version: 0 }));
      }
    } catch {
      // Storage unavailable: the page falls back to its defaults.
    }
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await closeDb();
});

const proxy = (path: string) => `/api/activate/proxy/${path}`;

async function enterCourseCode(code: string) {
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('code-submit').click();
}

/** What the phone is allowed to open, asked of the backend with the phone's own session. */
const phoneLesson = (lessonId: string) =>
  backend('GET', `/lessons/${lessonId}`, { token: phone.accessToken, headers: PHONE_HEADERS });

const devicesOf = (userId: string) =>
  db().device.findMany({ where: { userId }, select: { deviceKey: true, status: true, platform: true } });

// ---------------------------------------------------------------------------
// Sign-in, and the phone it must not disturb
// ---------------------------------------------------------------------------

test.describe('sign-in', () => {
  test('the phone signs in first and becomes the student’s one device', async () => {
    phone = await phoneSignIn(fx.student.phone);
    expect(await devicesOf(fx.student.id)).toEqual([
      { deviceKey: PHONE_HEADERS['X-Device-Id'], status: 'ACTIVE', platform: 'android' },
    ]);
  });

  test('a visitor who is not signed in is sent to the portal’s own sign-in', async () => {
    await page.goto('/activate/courses');
    await expect(page).toHaveURL(/\/activate\/login\?next=/);
    const res = await page.request.get(proxy('courses'), { headers: WEB });
    expect(res.status()).toBe(401);
  });

  test('wrong password, a disabled account and a staff account are all refused', async () => {
    const attempt = async (phoneNumber: string, password: string) => {
      await page.goto('/activate/login');
      await page.locator('input[name="phone"]').fill(phoneNumber);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByTestId('login-error')).toBeVisible();
      await expect(page).toHaveURL(/\/activate\/login/);
    };

    await attempt(fx.student.phone, 'not-the-password-1');
    await attempt(fx.disabled.phone, fx.password);
    await attempt(fx.teacher.phone, fx.password);
    await expect(page.getByTestId('login-error')).toContainText('student');

    // No portal cookie was issued, and the staff sign-in left no live session behind.
    const cookies = await context.cookies();
    expect(cookies.filter((c) => c.name.startsWith('edu_act_'))).toEqual([]);
    expect(await db().session.count({ where: { userId: fx.teacher.id, status: 'ACTIVE', revokedAt: null } })).toBe(0);
  });

  test('the student signs in with the same account — and is not registered as a device', async () => {
    const before = {
      changeRequests: await db().deviceChangeRequest.count({ where: { userId: fx.student.id } }),
      securityEventIds: (await db().securityEvent.findMany({ where: { userId: fx.student.id }, select: { id: true } })).map(
        (e: { id: string }) => e.id,
      ),
    };

    await page.goto('/activate/login');
    await page.locator('input[name="phone"]').fill(fx.student.phone);
    await page.locator('input[name="password"]').fill(fx.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/activate$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(fx.student.firstName);

    // Portal cookies only; none of the learning website's, and no device cookie.
    const names = (await context.cookies()).map((c) => c.name).sort();
    expect(names.filter((n) => n.startsWith('edu_'))).toEqual(['edu_act_at', 'edu_act_pf', 'edu_act_rt']);
    for (const cookie of (await context.cookies()).filter((c) => c.name.startsWith('edu_act_') && c.name !== 'edu_act_pf')) {
      expect(cookie.httpOnly, cookie.name).toBe(true);
    }

    // The backend: still exactly one device (the phone), no change request,
    // and the portal's session is bound to no device. The only thing the
    // sign-in recorded is the ordinary sign-in audit entry every login writes
    // — with no device on it, and no device event beside it.
    expect(await devicesOf(fx.student.id)).toEqual([
      { deviceKey: PHONE_HEADERS['X-Device-Id'], status: 'ACTIVE', platform: 'android' },
    ]);
    expect(await db().deviceChangeRequest.count({ where: { userId: fx.student.id } })).toBe(before.changeRequests);
    const newEvents = await db().securityEvent.findMany({
      where: { userId: fx.student.id, id: { notIn: before.securityEventIds } },
      select: { type: true, deviceKey: true },
    });
    expect(newEvents).toEqual([{ type: 'LOGIN_SUCCESS', deviceKey: null }]);

    const sessions = await db().session.findMany({
      where: { userId: fx.student.id },
      select: { deviceId: true, status: true, revokedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions.map((s: { deviceId: string | null }) => s.deviceId !== null)).toEqual([true, false]);
    expect(
      sessions.every((s: { status: string; revokedAt: Date | null }) => s.status === 'ACTIVE' && s.revokedAt === null),
    ).toBe(true);

    // And the phone is still signed in.
    expect((await backend('GET', '/auth/me', { token: phone.accessToken, headers: PHONE_HEADERS })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

test.describe('catalogue', () => {
  test('lists the courses the backend offers this student, and no others', async () => {
    await page.goto('/activate/courses');
    const cards = page.getByTestId('course-card');
    await expect(cards).toHaveCount(5);
    expect((await cards.locator('h3').allTextContents()).sort()).toEqual(
      [mechanics.title, chemistry.title, physics.title, maths.title, free.title].sort(),
    );
    await expect(page.getByText(programsOnly.title)).toHaveCount(0);
    await expect(page.getByText(draft.title)).toHaveCount(0);
  });

  test('a course page shows parts and prices from the backend, and nothing that plays', async () => {
    await page.goto(`/activate/courses/${mechanics.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(mechanics.title);

    const parts = page.getByTestId('part-row');
    await expect(parts).toHaveCount(2);
    await expect(parts.nth(0)).toContainText(fx.parts.part1.title);
    await expect(parts.nth(0)).toContainText('600');
    await expect(parts.nth(1)).toContainText(fx.parts.part2.title);
    await expect(parts.nth(1)).toContainText('400');
    await expect(parts.nth(0)).toHaveAttribute('data-owned', 'false');
    await expect(page.getByTestId('ownership-notice')).toHaveCount(0);
    await expect(page.getByTestId('code-input')).toBeVisible();

    await page.getByRole('tab', { name: 'Course outline' }).click();
    await expect(page.getByTestId('outline-section')).toHaveCount(4);
    await expect(page.locator('video, audio, iframe, embed, object')).toHaveCount(0);
    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.filter((h) => /^\/(lessons|player|viewer|home|my-courses|courses|library|wallet|login)(\/|$|\?)/.test(h))).toEqual([]);
  });

  test('a course outside the student’s faculty, and a draft, do not exist for them', async () => {
    for (const hidden of [programsOnly, draft]) {
      const res = await page.request.get(proxy(`courses/${hidden.id}`), { headers: WEB });
      expect([403, 404], hidden.title).toContain(res.status());
    }
  });
});

// ---------------------------------------------------------------------------
// Parts and sections
// ---------------------------------------------------------------------------

test.describe('parts and sections', () => {
  test('a part card unlocks exactly that part, for the phone too', async () => {
    // Before: the phone cannot open the lecture.
    expect((await phoneLesson(statics.lessonId)).status).toBe(403);

    await page.goto(`/activate/courses/${mechanics.id}`);
    await enterCourseCode(part1CardA);

    await expect(page).toHaveURL(/\/activate\/success$/);
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'parts');
    await expect(page.getByTestId('success-items').locator('li')).toHaveText([fx.parts.part1.title]);
    await expect(page.getByTestId('success-body')).not.toContainText('full course');
    expect(new URL(page.url()).search).toBe('');

    expect(await card(part1CardA)).toEqual({ status: 'EXHAUSTED', redemptionCount: 1 });
    expect(
      await db().coursePartEntitlement.findMany({
        where: { userId: fx.student.id, revokedAt: null },
        select: { coursePartId: true, source: true },
      }),
    ).toEqual([{ coursePartId: fx.parts.part1.id, source: 'CODE' }]);

    await page.getByRole('link', { name: 'Back to the course' }).click();
    const notice = page.getByTestId('ownership-notice');
    await expect(notice).toHaveAttribute('data-ownership', 'parts');
    await expect(notice).toContainText('You own 1 of 2 parts');
    await expect(page.getByTestId('part-row').nth(0)).toHaveAttribute('data-owned', 'true');
    await expect(page.getByTestId('part-row').nth(1)).toHaveAttribute('data-owned', 'false');

    // The phone, with the session it already had: the part's lectures open,
    // the other part's do not.
    expect((await phoneLesson(statics.lessonId)).status).toBe(200);
    expect((await phoneLesson(dynamics.lessonId)).status).toBe(200);
    expect((await phoneLesson(fluids.lessonId)).status).toBe(403);
  });

  test('a second card for the same part is refused by the backend and stays unspent', async () => {
    await page.goto(`/activate/courses/${mechanics.id}`);
    await enterCourseCode(part1CardB);

    // The portal asks first; the student insists.
    const confirm = page.getByTestId('code-confirm');
    await expect(confirm).toContainText('Check before you use this card');
    await page.getByTestId('code-use-anyway').click();

    await expect(page.getByTestId('activation-error')).toContainText('You already have everything this card unlocks');
    await expect(page.getByTestId('activation-error')).toContainText('was not used');
    await expect(page).toHaveURL(new RegExp(`/activate/courses/${mechanics.id}$`));

    // The backend, not the page: the card is exactly as it was printed.
    expect(await card(part1CardB)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
    expect(await db().accessCodeRedemption.count({ where: { userId: fx.student.id } })).toBe(1);
    expect(await db().coursePartPurchase.count({ where: { userId: fx.student.id } })).toBe(1);

    // Without the portal in the way — a direct call — the answer is the same.
    const direct = await page.request.post(proxy(`courses/${mechanics.id}/redeem`), { headers: WEB, data: { code: part1CardB } });
    expect(direct.status()).toBe(409);
    expect((await direct.json()).code).toBe('ALREADY_ENROLLED');
    expect(await card(part1CardB)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
  });

  test('a card for a section inside the owned part is refused and stays unspent', async () => {
    await page.goto(`/activate/courses/${mechanics.id}`);
    await enterCourseCode(fx.codes.sectionStatics);
    await expect(page.getByTestId('code-confirm')).toContainText(statics.title);
    await page.getByTestId('code-use-anyway').click();

    await expect(page.getByTestId('activation-error')).toContainText('You already have everything this card unlocks');
    expect(await card(fx.codes.sectionStatics)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
  });

  test('the refused card is still good: another student redeems it', async () => {
    const peer = await backend<{ accessToken: string }>('POST', '/auth/login', { body: { phone: fx.peer.phone, password: fx.password } });
    const res = await backend('POST', `/courses/${mechanics.id}/redeem`, { token: peer.data.accessToken, body: { code: part1CardB } });
    expect(res.status).toBe(200);
    expect(await card(part1CardB)).toEqual({ status: 'EXHAUSTED', redemptionCount: 1 });
  });

  test('a card for a section outside every part unlocks that section', async () => {
    await page.goto(`/activate/courses/${mechanics.id}`);
    await enterCourseCode(fx.codes.sectionRevision);
    // The backend says which section the card is for, and it is not one the
    // student can open — so there is nothing to ask first.
    await expect(page).toHaveURL(/\/activate\/success$/);
    await expect(page.getByTestId('success-items').locator('li')).toHaveText([revision.title]);
    expect(await card(fx.codes.sectionRevision)).toEqual({ status: 'EXHAUSTED', redemptionCount: 1 });
    expect((await phoneLesson(revision.lessonId)).status).toBe(200);
  });

  test('the other part’s card unlocks the other part: 2 of 2 parts, still not "the full course"', async () => {
    await page.goto(`/activate/courses/${mechanics.id}`);
    await enterCourseCode(fx.codes.part2);
    await page.getByTestId('code-use-anyway').click();

    await expect(page).toHaveURL(/\/activate\/success$/);
    await expect(page.getByTestId('success-items').locator('li')).toHaveText([fx.parts.part2.title]);
    expect(await card(fx.codes.part2)).toEqual({ status: 'EXHAUSTED', redemptionCount: 1 });

    await page.getByRole('link', { name: 'Back to the course' }).click();
    const notice = page.getByTestId('ownership-notice');
    await expect(notice).toHaveAttribute('data-ownership', 'parts');
    await expect(notice).toContainText('You own 2 of 2 parts');
    await expect(notice).not.toContainText('You own the full course');
    await expect(page.getByTestId('code-input')).toHaveCount(0);

    const enrollment = await db().enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId: fx.student.id, courseId: mechanics.id } },
      select: { state: true, coversAllSections: true },
    });
    expect(enrollment).toEqual({ state: 'ACTIVE', coversAllSections: false });
    expect((await phoneLesson(fluids.lessonId)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Whole course, teacher card, free course, refusals
// ---------------------------------------------------------------------------

test.describe('whole courses', () => {
  test.beforeAll(resetRateLimits);

  test('refused codes are explained, and nothing is spent', async () => {
    await page.goto(`/activate/courses/${chemistry.id}`);

    const refusals: [string, string][] = [
      ['ZZZZ-ZZZZ-ZZZZ', 'This code is not valid for this course'],
      [fx.codes.chemistryExpired, 'This code is not valid for this course'],
      [fx.codes.chemistryRevoked, 'This code is not valid for this course'],
      // A real, unused card — for another course.
      [fx.codes.teacherTwo, 'This code is not valid for this course'],
      [fx.codes.chemistryUsed, 'This code has already been used'],
    ];
    for (const [code, message] of refusals) {
      await enterCourseCode(code);
      await expect(page.getByTestId('activation-error'), code).toContainText(message);
    }

    await enterCourseCode(fx.codes.recharge50);
    const error = page.getByTestId('activation-error');
    await expect(error).toContainText('This is a recharge card, not a course code');
    await expect(error.getByRole('link', { name: 'Go to Credit' })).toHaveAttribute('href', '/activate/wallet');

    expect(await card(fx.codes.teacherTwo)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
    expect(await card(fx.codes.recharge50)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
    expect(await db().enrollment.count({ where: { userId: fx.student.id, courseId: chemistry.id } })).toBe(0);
  });

  test('a full-course card unlocks the full course, and says so', async () => {
    await page.goto(`/activate/courses/${chemistry.id}`);
    await enterCourseCode(fx.codes.chemistryFull.toLowerCase());

    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'whole-course');
    await expect(page.getByTestId('success-body')).toContainText(`The full course “${chemistry.title}” is now unlocked`);
    expect(await card(fx.codes.chemistryFull)).toEqual({ status: 'EXHAUSTED', redemptionCount: 1 });

    await page.getByRole('link', { name: 'Back to the course' }).click();
    await expect(page.getByTestId('ownership-notice')).toHaveAttribute('data-ownership', 'full');
    await expect(page.getByTestId('code-input')).toHaveCount(0);

    // A spare card for a course already owned in full is refused, unspent.
    const spare = await page.request.post(proxy(`courses/${chemistry.id}/redeem`), { headers: WEB, data: { code: fx.codes.chemistrySpare } });
    expect(spare.status()).toBe(409);
    expect((await spare.json()).code).toBe('ALREADY_ENROLLED');
    expect(await card(fx.codes.chemistrySpare)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });

    expect((await phoneLesson(chemistryLesson)).status).toBe(200);
  });

  test('a teacher card unlocks every course it covers', async () => {
    await page.goto(`/activate/courses/${physics.id}`);
    await enterCourseCode(fx.codes.teacherTwo);

    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'whole-course');
    await expect(page.getByTestId('success-page')).toContainText(fx.teacherTwo.name);

    const enrolled = await db().enrollment.findMany({
      where: { userId: fx.student.id, courseId: { in: [physics.id, maths.id] }, state: 'ACTIVE' },
      select: { courseId: true, coversAllSections: true },
    });
    expect(enrolled.map((e: { courseId: string }) => e.courseId).sort()).toEqual([physics.id, maths.id].sort());
    expect(enrolled.every((e: { coversAllSections: boolean }) => e.coversAllSections)).toBe(true);
  });

  test('a free course is joined without a code', async () => {
    await page.goto(`/activate/courses/${free.id}`);
    await expect(page.getByTestId('code-input')).toHaveCount(0);
    await page.getByTestId('join-free').click();
    await expect(page.getByTestId('success-body')).toContainText(`You joined “${free.title}”`);
    expect(
      await db().enrollment.count({ where: { userId: fx.student.id, courseId: free.id, state: 'ACTIVE' } }),
    ).toBe(1);
  });

  test('a student from another faculty cannot activate here, even with a valid card', async ({ browser }) => {
    const other = await browser.newContext();
    try {
      const signIn = await other.request.post('/api/activate/auth/login', {
        headers: WEB,
        data: { phone: fx.outsider.phone, password: fx.password },
      });
      expect(signIn.status()).toBe(200);
      const res = await other.request.post(proxy(`courses/${chemistry.id}/redeem`), { headers: WEB, data: { code: fx.codes.chemistrySpare } });
      expect([403, 404]).toContain(res.status());
      expect(await card(fx.codes.chemistrySpare)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });

      const list = await other.request.get(proxy('courses'), { headers: WEB });
      const body = (await list.json()) as { data: { title: string }[] | { items: { title: string }[] } };
      const titles = (Array.isArray(body.data) ? body.data : body.data.items).map((c) => c.title);
      expect(titles).toEqual([programsOnly.title]);
    } finally {
      await other.close();
    }
  });
});

test.describe('the backend’s rate limit', () => {
  test.beforeAll(resetRateLimits);
  test.afterAll(resetRateLimits);

  test('is reported as "too many attempts", and a good card is not consumed by it', async () => {
    // Ten checks are allowed in five minutes; these are the ten.
    for (let i = 0; i < 10; i += 1) {
      const res = await page.request.post(proxy('codes/validate'), {
        headers: WEB,
        data: { code: `NOPE-0000-00${String(i).padStart(2, '0')}`, courseId: physics.id },
      });
      expect(res.status(), `attempt ${i + 1}`).toBe(400);
    }

    await page.goto(`/activate/courses/${free.id}`);
    const eleventh = await page.request.post(proxy('codes/validate'), { headers: WEB, data: { code: fx.codes.throwaway, courseId: chemistry.id } });
    expect(eleventh.status()).toBe(429);
    expect((await eleventh.json()).code).toBe('RATE_LIMITED');
    expect(await card(fx.codes.throwaway)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// Wallet and library
// ---------------------------------------------------------------------------

test.describe('wallet and library', () => {
  test.beforeAll(resetRateLimits);

  test('the library lists what the backend offers this student', async () => {
    await page.goto('/activate/library');
    const tiles = page.getByTestId('material-tile');
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toContainText(fx.library.material.title);
    await expect(tiles.first()).toHaveAttribute('href', `/activate/library/${fx.library.material.id}`);
    await expect(page.getByText(fx.library.programsMaterial.title)).toHaveCount(0);

    const outside = await page.request.get(proxy(`library/materials/${fx.library.programsMaterial.id}`), { headers: WEB });
    expect([403, 404]).toContain(outside.status());
  });

  test('with no credit, a document cannot be bought — only topped up for', async () => {
    await page.goto(`/activate/library/${fx.library.material.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(fx.library.material.title);
    await expect(page.getByTestId(`buy-part-${fx.library.sample.id}`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Read', exact: true })).toHaveCount(0);

    await page.getByTestId(`buy-part-${fx.library.cheap.id}`).first().click();
    await expect(page.getByTestId('purchase-sheet')).toContainText('Still needed');
    await expect(page.getByTestId('purchase-confirm')).toHaveCount(0);

    const broke = await page.request.post(proxy('library/purchase'), { headers: WEB, data: { kind: 'PART', targetId: fx.library.cheap.id } });
    expect(broke.status()).toBe(402);
    // A client-sent price is refused by the backend's validation, not honoured.
    const priced = await page.request.post(proxy('library/purchase'), { headers: WEB, data: { kind: 'PART', targetId: fx.library.cheap.id, price: 0 } });
    expect(priced.status()).toBe(422);
    expect(await db().libraryEntitlement.count({ where: { userId: fx.student.id } })).toBe(0);

    await page.getByTestId('purchase-topup').click();
    await expect(page).toHaveURL(/\/activate\/wallet$/);
  });

  test('refused recharge codes change nothing', async () => {
    await page.goto('/activate/wallet');
    await expect(page.getByTestId('wallet-balance')).toContainText('0');

    const refusals: [string, string][] = [
      ['ZZZZ-ZZZZ-ZZZZ', 'This recharge code is not valid'],
      [fx.codes.chemistrySpare, 'This is a course access code, not a recharge card'],
    ];
    for (const [code, message] of refusals) {
      await page.getByTestId('recharge-input').fill(code);
      await page.getByTestId('recharge-submit').click();
      await expect(page.getByTestId('recharge-error'), code).toContainText(message);
    }
    await expect(page.getByTestId('recharge-error').getByRole('link', { name: 'Go to Courses' })).toHaveAttribute('href', '/activate/courses');

    expect(await card(fx.codes.chemistrySpare)).toEqual({ status: 'ACTIVE', redemptionCount: 0 });
    expect(await db().walletTransaction.count({ where: { wallet: { userId: fx.student.id } } })).toBe(0);
  });

  test('a recharge card adds exactly its value, once', async () => {
    await page.goto('/activate/wallet');
    await page.getByTestId('recharge-input').fill(rechargeCard.toLowerCase());
    await page.getByTestId('recharge-submit').click();

    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'recharge');
    await expect(page.getByTestId('success-body')).toContainText('100');
    expect(await card(rechargeCard)).toEqual({ status: 'EXHAUSTED', redemptionCount: 1 });

    // The same card again.
    await page.goto('/activate/wallet');
    await expect(page.getByTestId('wallet-balance')).toContainText('100');
    await page.getByTestId('recharge-input').fill(rechargeCard);
    await page.getByTestId('recharge-submit').click();
    await expect(page.getByTestId('recharge-error')).toContainText('already been used');

    const wallet = await db().wallet.findUniqueOrThrow({ where: { userId: fx.student.id }, select: { balance: true } });
    expect(Number(wallet.balance)).toBe(100);
    expect(await db().walletTransaction.count({ where: { wallet: { userId: fx.student.id } } })).toBe(1);
  });

  test('buying a document debits the price once and records the entitlement', async () => {
    await page.goto(`/activate/library/${fx.library.material.id}`);
    await page.getByTestId(`buy-part-${fx.library.cheap.id}`).first().click();
    await expect(page.getByTestId('purchase-sheet')).toContainText(fx.library.cheap.title);
    await page.getByTestId('purchase-confirm').click();

    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'library');
    await expect(page.getByTestId('success-body')).toContainText(`You now own “${fx.library.cheap.title}”`);

    const read = async () => ({
      balance: Number((await db().wallet.findUniqueOrThrow({ where: { userId: fx.student.id }, select: { balance: true } })).balance),
      entitlements: await db().libraryEntitlement.findMany({
        where: { userId: fx.student.id, revokedAt: null },
        select: { libraryPartId: true },
      }),
      purchases: await db().libraryPurchase.count({ where: { userId: fx.student.id } }),
      ledger: await db().walletTransaction.count({ where: { wallet: { userId: fx.student.id } } }),
    });
    const after = await read();
    expect(after).toEqual({ balance: 60, entitlements: [{ libraryPartId: fx.library.cheap.id }], purchases: 1, ledger: 2 });

    // Asked again, the backend answers "already yours" and charges nothing.
    const again = await page.request.post(proxy('library/purchase'), { headers: WEB, data: { kind: 'PART', targetId: fx.library.cheap.id } });
    expect(again.status()).toBeLessThan(300);
    expect((await again.json()).data).toMatchObject({ alreadyPurchased: true });
    expect(await read()).toEqual(after);

    // Not enough for the dear one.
    const dear = await page.request.post(proxy('library/purchase'), { headers: WEB, data: { kind: 'PART', targetId: fx.library.dear.id } });
    expect(dear.status()).toBe(402);
    expect(await read()).toEqual(after);

    // The wallet page shows the backend's figures.
    await page.goto('/activate/wallet');
    await expect(page.getByTestId('wallet-balance')).toContainText('60');

    // The phone sees the document as owned.
    const mine = await backend<{ items?: unknown[] } | unknown[]>('GET', '/library/me', { token: phone.accessToken, headers: PHONE_HEADERS });
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.data)).toContain(fx.library.cheap.id);
  });

  test('the owned document is listed for the app — the portal cannot open it', async () => {
    await page.goto('/activate/my-activations');
    const courses = page.getByTestId('activation-course');
    await expect(courses).toHaveCount(5);
    await expect(courses.filter({ hasText: mechanics.title })).toHaveAttribute('data-ownership', 'parts');
    await expect(courses.filter({ hasText: mechanics.title })).toContainText('2 of 2 parts');
    await expect(courses.filter({ hasText: chemistry.title })).toHaveAttribute('data-ownership', 'full');

    await page.getByRole('tab', { name: /Library documents/ }).click();
    const doc = page.getByTestId('activation-document');
    await expect(doc).toHaveCount(1);
    await expect(doc).toContainText(fx.library.cheap.title);
    await expect(doc.locator('a[href*="reader"], button')).toHaveCount(0);

    const open = await page.request.post(proxy(`library/parts/${fx.library.cheap.id}/open`), { headers: WEB, data: {} });
    expect(open.status()).toBe(403);
    expect((await open.json()).code).toBe('PATH_NOT_ALLOWED');
  });
});

// ---------------------------------------------------------------------------
// Isolation, refresh and sign-out
// ---------------------------------------------------------------------------

test.describe('isolation and session', () => {
  test('the portal’s proxy forwards nothing that could return content or touch devices', async () => {
    const refused: [string, string][] = [
      ['GET', `lessons/${statics.lessonId}`],
      ['GET', `courses/${mechanics.id}/sections`],
      ['POST', 'playback/tickets'],
      ['POST', `lessons/${statics.lessonId}/attachments/x/ticket`],
      ['GET', 'devices'],
      ['POST', 'devices/change-requests'],
      ['GET', 'auth/sessions'],
      ['POST', 'auth/logout-all'],
      ['POST', 'auth/change-password'],
      ['GET', 'admin/codes'],
    ];
    for (const [method, path] of refused) {
      const res =
        method === 'GET'
          ? await page.request.get(proxy(path), { headers: WEB })
          : await page.request.post(proxy(path), { headers: WEB, data: {} });
      expect(res.status(), `${method} ${path}`).toBe(403);
      expect((await res.json()).code, `${method} ${path}`).toBe('PATH_NOT_ALLOWED');
    }

    // The learning website's own session routes do not see the portal's session.
    const learning = await page.request.get('/api/proxy/courses', { headers: WEB });
    expect(learning.status()).toBe(401);
  });

  test('an expired access token is renewed without a device, and the phone is untouched', async () => {
    const all = await context.cookies();
    const refreshBefore = all.find((c) => c.name === 'edu_act_rt')?.value;
    await context.clearCookies({ name: 'edu_act_at' });

    const res = await page.request.get(proxy('wallet'), { headers: WEB });
    expect(res.status()).toBe(200);
    const after = await context.cookies();
    expect(after.find((c) => c.name === 'edu_act_at')?.value).toBeTruthy();
    expect(after.find((c) => c.name === 'edu_act_rt')?.value).not.toBe(refreshBefore);

    expect(await devicesOf(fx.student.id)).toHaveLength(1);
    expect(await db().deviceChangeRequest.count({ where: { userId: fx.student.id } })).toBe(0);

    // The phone renews its own session with its own token.
    const renewed = await backend<PhoneSession>('POST', '/auth/refresh', {
      body: { refreshToken: phone.refreshToken },
      headers: PHONE_HEADERS,
    });
    expect(renewed.status).toBe(200);
    phone = { accessToken: renewed.data.accessToken, refreshToken: renewed.data.refreshToken };
  });

  test('signing out of the portal ends the portal’s session only', async () => {
    await page.goto('/activate/account');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/activate\/login/);

    expect((await context.cookies()).filter((c) => c.name.startsWith('edu_act_'))).toEqual([]);
    await page.goto('/activate/wallet');
    await expect(page).toHaveURL(/\/activate\/login/);

    const sessions = await db().session.findMany({
      where: { userId: fx.student.id },
      select: { deviceId: true, status: true, revokedAt: true },
    });
    const portalSessions = sessions.filter((s: { deviceId: string | null }) => s.deviceId === null);
    const phoneSessions = sessions.filter((s: { deviceId: string | null }) => s.deviceId !== null);
    expect(portalSessions).toHaveLength(1);
    expect(portalSessions[0].status === 'ACTIVE' && portalSessions[0].revokedAt === null).toBe(false);
    expect(phoneSessions).toHaveLength(1);
    expect(phoneSessions[0]).toMatchObject({ status: 'ACTIVE', revokedAt: null });

    // The phone: still signed in, still the one device, still holding
    // everything that was activated in the browser.
    expect((await backend('GET', '/auth/me', { token: phone.accessToken, headers: PHONE_HEADERS })).status).toBe(200);
    expect(await devicesOf(fx.student.id)).toEqual([
      { deviceKey: PHONE_HEADERS['X-Device-Id'], status: 'ACTIVE', platform: 'android' },
    ]);
    for (const lessonId of [statics.lessonId, fluids.lessonId, revision.lessonId, chemistryLesson, physicsLesson, mathsLesson]) {
      expect((await phoneLesson(lessonId)).status, lessonId).toBe(200);
    }
  });
});
