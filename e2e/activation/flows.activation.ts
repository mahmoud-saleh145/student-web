import { devices, expect, test, type BrowserContextOptions, type Page } from '@playwright/test';

import {
  GENERAL,
  PASSWORD,
  PROGRAMS,
  WEB,
  backendGrant,
  backendReset,
  backendSet,
  backendState,
  calls,
  enterCourseCode,
  expectNoContentSurface,
  expectNoHorizontalOverflow,
  signIn,
  useEnglish,
} from './support';

/**
 * What a student does in the portal: browse, activate, top up, buy — and what
 * the portal tells them afterwards.
 *
 * Each test sets the stand-in backend's state, drives the real pages, and
 * checks both what the student sees and what the backend was actually asked to
 * do. Ownership is always read back from the backend's own state, never
 * inferred from the page.
 */

test.beforeEach(async ({ context, request }) => {
  await backendReset(request);
  await useEnglish(context);
});

/**
 * A device descriptor as context options: its viewport, touch and user agent,
 * without its browser engine. These tests run every descriptor on the same
 * browser, so they show what the page does at that size and with that user
 * agent — they are not a test of the phone.
 */
function asContextOptions(device: (typeof devices)[string]): BrowserContextOptions {
  const options: Record<string, unknown> = { ...device };
  delete options.defaultBrowserType;
  return options as BrowserContextOptions;
}

const titles = (page: Page) => page.getByTestId('course-card').locator('h3').allTextContents();

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

test.describe('course catalogue — the backend’s visibility, unchanged', () => {
  test('a General student sees faculty-wide and General courses, not the Programs one', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses');
    await expect(page.getByTestId('course-card')).toHaveCount(3);
    expect((await titles(page)).sort()).toEqual(['General Chemistry', 'Mechanics 101', 'Study Skills']);
    await expect(page.getByText('Computer Networks')).toHaveCount(0);
    await expect(page.getByText('Unpublished Course')).toHaveCount(0);
  });

  test('a Programs student sees faculty-wide and Programs courses, not the General one', async ({ page }) => {
    await signIn(page, PROGRAMS.phone);
    await page.goto('/activate/courses');
    await expect(page.getByTestId('course-card')).toHaveCount(3);
    expect((await titles(page)).sort()).toEqual(['Computer Networks', 'Mechanics 101', 'Study Skills']);
    await expect(page.getByText('General Chemistry')).toHaveCount(0);
  });

  test('search, year and free filters narrow the list and send only fields the backend accepts', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses');
    await expect(page.getByTestId('course-card')).toHaveCount(3);

    await page.getByRole('searchbox').first().fill('chem');
    await expect(page.getByTestId('course-card')).toHaveCount(1);
    expect(await titles(page)).toEqual(['General Chemistry']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('course-card')).toHaveCount(3);

    // The year list is the student's own faculty ladder.
    await page.getByRole('combobox').first().selectOption({ label: 'Second Year' });
    await expect(page.getByTestId('course-card')).toHaveCount(1);
    expect(await titles(page)).toEqual(['Study Skills']);
    await page.getByRole('button', { name: 'Clear filters' }).click();

    await page.getByRole('switch', { name: 'Free only' }).click();
    await expect(page.getByTestId('course-card')).toHaveCount(1);
    expect(await titles(page)).toEqual(['Study Skills']);

    const state = await backendState(request);
    const queries = state.requests.filter((r) => r.path === '/courses' || r.path === '/catalog/academic-years').map((r) => r.query);
    // The backend rejects unknown query fields outright; none was sent.
    expect(queries.join('&')).not.toMatch(/departmentId|universityId|studyType|track/);
    expect(queries.some((q) => q.includes('facultyId=fac-eng'))).toBe(true);
  });

  test('prices and access state on the cards come from the backend', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-chem', coversAll: true });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses');

    const mech = page.getByTestId('course-card').filter({ hasText: 'Mechanics 101' });
    await expect(mech).toContainText('EGP');
    await expect(mech).toContainText('300');
    await expect(mech).toContainText('Dr. Ahmed Hassan');
    await expect(mech).toHaveAttribute('href', '/activate/courses/c-mech');

    const chem = page.getByTestId('course-card').filter({ hasText: 'General Chemistry' });
    await expect(chem).toContainText('Enrolled');
    // A price on a course the student already holds reads as a charge still owed.
    await expect(chem).not.toContainText('200');

    await expect(page.getByTestId('course-card').filter({ hasText: 'Study Skills' })).toContainText('Free');
  });
});

test.describe('course page — information and activation, never content', () => {
  test('shows the course, its outline, its parts and prices', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');

    await expect(page.getByRole('heading', { name: 'Mechanics 101', level: 1 })).toBeVisible();
    await expect(page.getByText('Dr. Ahmed Hassan').first()).toBeVisible();
    await expect(page.getByText('The full mechanics course.')).toBeVisible();
    await expect(page.getByText('Solve equilibrium problems')).toBeVisible();
    await expect(page.getByTestId('course-price')).toContainText('300');
    await expect(page.getByTestId('full-course-price')).toContainText('300');

    const parts = page.getByTestId('part-row');
    await expect(parts).toHaveCount(2);
    await expect(parts.nth(0)).toContainText('Before Midterm');
    await expect(parts.nth(0)).toContainText('180');
    await expect(parts.nth(1)).toContainText('After Midterm');
    await expect(parts.nth(1)).toContainText('150');
    await expect(parts.nth(0)).toHaveAttribute('data-owned', 'false');

    await page.getByRole('tab', { name: 'Course outline' }).click();
    const outline = page.getByTestId('course-outline');
    await expect(outline).toContainText('Before Midterm');
    await expect(outline).toContainText('Statics');
    await expect(outline.getByTestId('outline-section')).toHaveCount(3);
  });

  test('the outline and the files are text: nothing plays, opens or links to the learning website', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', coversAll: true });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');

    await page.getByRole('tab', { name: 'Course outline' }).click();
    for (const section of await page.getByTestId('outline-section').all()) await section.locator('summary').click();
    const lessons = page.getByTestId('outline-lesson');
    await expect(lessons).toHaveCount(5);
    // Even for an owner, and even for the free-preview lesson: rows of text.
    await expect(lessons.first()).toContainText('Forces and moments');
    await expect(lessons.first()).toContainText('Free preview');
    await expect(page.getByTestId('course-outline').locator('a, button')).toHaveCount(0);
    await lessons.first().click();
    await expect(page).toHaveURL(/\/activate\/courses\/c-mech$/);

    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByTestId('course-files')).toContainText('Formula sheet.pdf');
    await expect(page.getByTestId('course-files').locator('a, button')).toHaveCount(0);

    await expectNoContentSurface(page);
    for (const label of ['Watch', 'Continue', 'Start course', 'Read', 'Play', 'Download']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }

    const state = await backendState(request);
    expect(state.protectedHits).toEqual([]);
    expect(state.requests.filter((r) => /lessons|playback|attachments|videos/.test(r.path))).toEqual([]);
  });

  test('a course that is not on offer shows no way to activate it', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-draft');
    await expect(page.getByText('This course isn\'t available right now.')).toBeVisible();
    await expect(page.getByTestId('code-input')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

test.describe('activating a course with a code', () => {
  test('a full-course code unlocks the full course, and says so', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'full-mech-0001');

    await expect(page).toHaveURL(/\/activate\/success$/);
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'whole-course');
    await expect(page.getByTestId('success-body')).toContainText('The full course “Mechanics 101” is now unlocked');
    await expect(page.getByTestId('open-app')).toBeVisible();

    // The backend holds the entitlement the phone will read.
    const state = await backendState(request);
    expect(state.enrollments[`${GENERAL.id}:c-mech`]).toMatchObject({ state: 'ACTIVE', coversAll: true });
    expect(state.codes['FULL-MECH-0001']).toMatchObject({ status: 'EXHAUSTED', redemptionCount: 1, redeemedBy: [GENERAL.id] });

    // And the course page now reflects it: owned, with nothing left to activate.
    await page.getByRole('link', { name: 'Back to the course' }).click();
    await expect(page.getByTestId('ownership-notice')).toHaveAttribute('data-ownership', 'full');
    await expect(page.getByTestId('ownership-notice')).toContainText('You own the full course');
    await expect(page.getByTestId('code-input')).toHaveCount(0);
    await expect(page.getByTestId('part-row').first()).toContainText('Included in full course');
  });

  test('a part code unlocks exactly that part — never reported as the full course', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'PART-MECH-P1A1');

    await expect(page).toHaveURL(/\/activate\/success$/);
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'parts');
    await expect(page.getByTestId('success-items').locator('li')).toHaveText(['Before Midterm']);
    await expect(page.getByTestId('success-body')).not.toContainText('full course');

    const state = await backendState(request);
    expect(state.partOwned).toEqual([`${GENERAL.id}:p1`]);
    expect(state.enrollments[`${GENERAL.id}:c-mech`]).toMatchObject({ state: 'ACTIVE', coversAll: false });

    await page.getByRole('link', { name: 'Back to the course' }).click();
    const notice = page.getByTestId('ownership-notice');
    await expect(notice).toHaveAttribute('data-ownership', 'parts');
    await expect(notice).toContainText('You own 1 of 2 parts');
    await expect(notice).not.toContainText('You own the full course');
    await expect(page.getByTestId('part-row').nth(0)).toHaveAttribute('data-owned', 'true');
    await expect(page.getByTestId('part-row').nth(1)).toHaveAttribute('data-owned', 'false');
    // Still able to add the other part.
    await expect(page.getByTestId('code-input')).toBeVisible();

    // The outline shows which sections opened and which did not.
    await page.getByRole('tab', { name: 'Course outline' }).click();
    const sections = page.getByTestId('outline-section');
    await expect(sections.nth(0)).toContainText('Unlocked');
    await expect(sections.nth(2)).toContainText('Locked');
  });

  test('a second card for a part already owned is refused by the backend and stays unspent — no prompt', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', partIds: ['p1'] });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await expect(page.getByTestId('ownership-notice')).toContainText('You own 1 of 2 parts');

    // Straight to the backend: no "check before you use this card" step.
    await enterCourseCode(page, 'PART-MECH-P1B2');
    const error = page.getByTestId('activation-error');
    await expect(error).toContainText('You already have everything this card unlocks');
    await expect(error).toContainText('Your card was not used');
    await expect(page.getByTestId('code-confirm')).toHaveCount(0);
    await expect(page.getByTestId('code-use-anyway')).toHaveCount(0);
    await expect(page).toHaveURL(/\/activate\/courses\/c-mech$/);

    const state = await backendState(request);
    expect(calls(state, 'POST', '/courses/c-mech/redeem')).toBe(1);
    expect(state.codes['PART-MECH-P1B2']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
    expect(state.partOwned).toEqual([`${GENERAL.id}:p1`]);
    // Still on the form, still able to enter the right card.
    await expect(page.getByTestId('code-input')).toBeVisible();
    await expect(page.getByTestId('ownership-notice')).toContainText('You own 1 of 2 parts');
  });

  test('a card for a section already open is refused by the backend and stays unspent', async ({ page, request }) => {
    // Section s3 is inside part p2, which the student owns.
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', partIds: ['p2'] });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');

    await enterCourseCode(page, 'SECT-MECH-S3A1');
    await expect(page.getByTestId('activation-error')).toContainText('You already have everything this card unlocks');
    await expect(page.getByTestId('code-confirm')).toHaveCount(0);

    const state = await backendState(request);
    expect(state.codes['SECT-MECH-S3A1']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
  });

  test('a part owner unlocks the other part in one step, and then holds 2 of 2 parts — still not "full"', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', partIds: ['p1'] });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');

    await enterCourseCode(page, 'PART-MECH-P2A1');
    // No prompt in between: the card goes to the backend, which accepts it.
    await expect(page).toHaveURL(/\/activate\/success$/);
    // Exactly the part that became owned, not the one held before.
    await expect(page.getByTestId('success-items').locator('li')).toHaveText(['After Midterm']);

    await page.getByRole('link', { name: 'Back to the course' }).click();
    await expect(page.getByTestId('ownership-notice')).toContainText('You own 2 of 2 parts');
    await expect(page.getByTestId('ownership-notice')).toHaveAttribute('data-ownership', 'parts');

    // Every part owned: there is nothing left for a card to add, so — by the
    // same rule as the learning website's join sheet — no code box is offered,
    // and a spare part card cannot be spent here by mistake.
    await expect(page.getByTestId('part-row').nth(1)).toHaveAttribute('data-owned', 'true');
    await expect(page.getByTestId('code-input')).toHaveCount(0);
    const state = await backendState(request);
    expect(state.codes['PART-MECH-P1B2']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
    expect(calls(state, 'POST', '/courses/c-mech/redeem')).toBe(1);
  });

  test('a part owner can upgrade to the full course with a full-course code', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', partIds: ['p1'] });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'FULL-MECH-0001');
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'whole-course');
    expect((await backendState(request)).enrollments[`${GENERAL.id}:c-mech`]).toMatchObject({ coversAll: true });
  });

  test('a section code unlocks that section', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'SECT-MECH-S3A1');
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'sections');
    await expect(page.getByTestId('success-items').locator('li')).toHaveText(['Dynamics']);

    await page.getByRole('link', { name: 'Back to the course' }).click();
    await expect(page.getByTestId('ownership-notice')).toHaveAttribute('data-ownership', 'sections');
    await expect(page.getByTestId('ownership-notice')).toContainText('You have access to part of this course');
  });

  test('a teacher code unlocks the course and says it may cover more', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'TEACH-AHMD-0001');
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'whole-course');
    await expect(page.getByTestId('success-page')).toContainText('other courses by Dr. Ahmed Hassan');

    const state = await backendState(request);
    expect(Object.keys(state.enrollments).sort()).toEqual([`${GENERAL.id}:c-free`, `${GENERAL.id}:c-mech`]);
    await page.getByRole('link', { name: 'View my activations' }).click();
    await expect(page.getByTestId('activation-course')).toHaveCount(2);
  });

  test('refused codes are explained, and nothing is spent or granted', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');

    const refusals: [string, string][] = [
      ['NOPE-0000-0000', 'This code is not valid for this course'],
      ['EXPD-MECH-0001', 'This code is not valid for this course'],
      ['REVK-MECH-0001', 'This code is not valid for this course'],
      // A real code, for another course.
      ['FULL-CHEM-0001', 'This code is not valid for this course'],
      ['USED-MECH-0001', 'This code has already been used'],
    ];
    for (const [code, message] of refusals) {
      await enterCourseCode(page, code);
      await expect(page.getByTestId('activation-error'), code).toContainText(message);
      await expect(page).toHaveURL(/\/activate\/courses\/c-mech$/);
    }

    // Malformed input never reaches the backend at all.
    const before = (await backendState(request)).requests.length;
    await enterCourseCode(page, 'ab');
    await expect(page.getByTestId('activation-error')).toContainText('letters, numbers and dashes');
    await enterCourseCode(page, 'ABCD_1234!');
    await expect(page.getByTestId('activation-error')).toContainText('letters, numbers and dashes');
    const state = await backendState(request);
    expect(state.requests.length).toBe(before);

    expect(state.enrollments).toEqual({});
    expect(state.partOwned).toEqual([]);
    expect(state.codes['FULL-CHEM-0001']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
    expect(calls(state, 'POST', '/courses/c-mech/redeem')).toBe(0);
    await expect(page.getByTestId('ownership-notice')).toHaveCount(0);
  });

  test('a recharge card entered on a course is sent to the wallet, unspent', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'RCHG-0100-AAAA');
    const error = page.getByTestId('activation-error');
    await expect(error).toContainText('This is a recharge card, not a course code');
    await expect(error.getByRole('link', { name: 'Go to Credit' })).toHaveAttribute('href', '/activate/wallet');
    expect((await backendState(request)).codes['RCHG-0100-AAAA']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
  });

  test('a code already redeemed cannot be redeemed again, by the same student or another', async ({ page, browser, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'PART-MECH-P1A1');
    await expect(page).toHaveURL(/\/activate\/success$/);

    // The same student, the same card, again.
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'PART-MECH-P1A1');
    await expect(page.getByTestId('activation-error')).toContainText('This code has already been used');

    // Another student, the same card.
    const other = await browser.newContext();
    await useEnglish(other);
    const otherPage = await other.newPage();
    await signIn(otherPage, PROGRAMS.phone);
    await otherPage.goto('/activate/courses/c-mech');
    await enterCourseCode(otherPage, 'PART-MECH-P1A1');
    await expect(otherPage.getByTestId('activation-error')).toContainText('This code has already been used');
    await other.close();

    const state = await backendState(request);
    expect(state.codes['PART-MECH-P1A1']).toMatchObject({ redemptionCount: 1, redeemedBy: [GENERAL.id] });
    expect(state.partOwned).toEqual([`${GENERAL.id}:p1`]);
  });

  test('two students racing for one card: exactly one wins', async ({ page, browser, request }) => {
    await backendSet(request, { redeemDelayMs: 300 });
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(page, GENERAL.phone);
    await signIn(otherPage, PROGRAMS.phone);

    const redeem = (p: Page) => p.request.post('/api/activate/proxy/courses/c-mech/redeem', { headers: WEB, data: { code: 'FULL-MECH-0001' } });
    const [a, b] = await Promise.all([redeem(page), redeem(otherPage)]);
    const outcomes = await Promise.all([a, b].map(async (res) => ({ status: res.status(), code: (await res.json()).code as string | undefined })));
    await other.close();

    expect(outcomes.map((o) => o.status).sort()).toEqual([200, 409]);
    expect(outcomes.find((o) => o.status === 409)?.code).toBe('CODE_ALREADY_USED');

    const state = await backendState(request);
    expect(state.codes['FULL-MECH-0001']!.redemptionCount).toBe(1);
    expect(Object.keys(state.enrollments)).toHaveLength(1);
  });

  test('pressing Activate twice sends one redemption', async ({ page, request }) => {
    await backendSet(request, { redeemDelayMs: 400 });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await page.getByTestId('code-input').fill('FULL-MECH-0001');
    // Two submissions before the first can answer: a double tap, and Enter.
    await page.getByTestId('code-submit').dblclick();
    await page.getByTestId('code-input').press('Enter').catch(() => undefined);

    await expect(page).toHaveURL(/\/activate\/success$/);
    const state = await backendState(request);
    expect(calls(state, 'POST', '/courses/c-mech/redeem')).toBe(1);
    expect(calls(state, 'POST', '/codes/validate')).toBe(1);
  });

  test('a course outside the student’s department cannot be activated, even with its own valid code', async ({ page, request }) => {
    // The catalogue never lists it; the address is typed by hand.
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-net');
    await enterCourseCode(page, 'FULL-NETW-0001');
    await expect(page.getByTestId('activation-error')).toContainText('not offered to your university, faculty, department');
    const state = await backendState(request);
    expect(state.enrollments).toEqual({});
    expect(state.codes['FULL-NETW-0001']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
  });

  test('too many attempts are reported as such', async ({ page, request }) => {
    await backendSet(request, { throttleCodes: true });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    for (const code of ['NOPE-0000-0001', 'NOPE-0000-0002']) {
      await enterCourseCode(page, code);
      await expect(page.getByTestId('activation-error')).toContainText('not valid for this course');
    }
    await enterCourseCode(page, 'NOPE-0000-0003');
    await expect(page.getByTestId('activation-error')).toContainText('Too many attempts');
  });

  test('a free course is joined without a code', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-free');
    await expect(page.getByTestId('code-input')).toHaveCount(0);
    await page.getByTestId('join-free').click();
    await expect(page.getByTestId('success-body')).toContainText('You joined “Study Skills”');
    expect((await backendState(request)).enrollments[`${GENERAL.id}:c-free`]).toMatchObject({ state: 'ACTIVE' });
  });

  test('the success address carries nothing, and the receipt holds no code', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'FULL-MECH-0001');
    await expect(page).toHaveURL(/\/activate\/success$/);

    const url = new URL(page.url());
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
    expect(stored).toContain('Mechanics 101');
    expect(stored).not.toContain('FULL-MECH-0001');
    await expect(page.locator('body')).not.toContainText('FULL-MECH-0001');

    // Opened cold, the page has nothing to claim.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'empty');
    await expect(page.getByText('No recent activation')).toBeVisible();
  });

  test('on a computer, Open Student Center says to open the app on the phone — and tries no link', async ({ page }) => {
    const launches: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('eduplatform')) launches.push(message.text());
    });

    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses/c-mech');
    await enterCourseCode(page, 'FULL-MECH-0001');
    await expect(page.getByTestId('open-app')).toBeVisible();
    await page.getByTestId('open-app').click();

    const help = page.getByTestId('open-app-help');
    await expect(help).toHaveAttribute('data-help', 'on-phone');
    await expect(help).toContainText('Open it on your phone');
    // The page did not go anywhere, and no app link was attempted.
    await expect(page).toHaveURL(/\/activate\/success$/);
    expect(launches).toEqual([]);
  });

  for (const [name, device] of [
    ['an Android phone', devices['Pixel 7']],
    ['an iPhone', devices['iPhone 14']],
  ] as const) {
    test(`on ${name}, a tap on Open Student Center invokes eduplatform:// and falls back when nothing answers`, async ({ browser }) => {
      // The device's viewport, touch and user agent — on this machine's
      // browser. It shows what the page does; it is not a phone.
      const context = await browser.newContext(asContextOptions(device));
      await context.addInitScript(() => {
        localStorage.setItem('edu-web-language', JSON.stringify({ state: { language: 'en' }, version: 0 }));
      });
      const page = await context.newPage();

      // What the browser itself was asked to open. No app answers the scheme
      // here, so the browser reports the attempt and stays on the page.
      const launches: string[] = [];
      page.on('console', (message) => {
        if (message.text().includes('eduplatform')) launches.push(message.text());
      });
      const requested: string[] = [];
      const cdp = await context.newCDPSession(page);
      await cdp.send('Page.enable');
      cdp.on('Page.frameRequestedNavigation', (event) => requested.push(event.url));

      await signIn(page, GENERAL.phone);
      await page.goto('/activate/courses/c-mech');
      await enterCourseCode(page, 'FULL-MECH-0001');
      await expect(page).toHaveURL(/\/activate\/success$/);
      await expectNoHorizontalOverflow(page);

      const button = page.getByTestId('open-app');
      await expect(button).toBeVisible();
      await expect(page.getByTestId('open-app-help')).toHaveCount(0);

      // A real touch on the button, not a scripted navigation.
      await button.tap();

      // The bare scheme, and nothing appended to it.
      await expect.poll(() => [...requested, ...launches].join(' | ')).toContain('eduplatform://');
      for (const url of requested.filter((u) => u.startsWith('eduplatform'))) expect(url).toBe('eduplatform://');
      for (const text of launches) expect(text).not.toMatch(/eduplatform:\/\/[^'" ]/);

      // Nothing answered: after a moment the manual steps appear, and the
      // portal is exactly where it was.
      const help = page.getByTestId('open-app-help');
      await expect(help).toHaveAttribute('data-help', 'not-opened');
      await expect(help).toContainText('Open Student Center from your phone');
      await expect(page).toHaveURL(/\/activate\/success$/);
      await expectNoHorizontalOverflow(page);

      // And it still works: on to another page of the portal.
      await page.getByRole('link', { name: 'View my activations' }).click();
      await expect(page).toHaveURL(/\/activate\/my-activations$/);
      await expect(page.getByTestId('activation-course')).toHaveCount(1);
      await context.close();
    });
  }
});

// ---------------------------------------------------------------------------
// My activations
// ---------------------------------------------------------------------------

test.describe('my activations — the true extent of what is owned', () => {
  test('distinguishes a full course from a part of one', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-chem', coversAll: true });
    await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', partIds: ['p1'] });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/my-activations');

    const chem = page.getByTestId('activation-course').filter({ hasText: 'General Chemistry' });
    await expect(chem).toHaveAttribute('data-ownership', 'full');
    await expect(chem).toContainText('Full course');

    const mech = page.getByTestId('activation-course').filter({ hasText: 'Mechanics 101' });
    await expect(mech).toHaveAttribute('data-ownership', 'parts');
    await expect(mech).toContainText('1 of 2 parts');
    await expect(mech.getByTestId('owned-parts')).toHaveText('Before Midterm');
    await expect(mech).not.toContainText('Full course');
    await expect(mech.getByRole('link', { name: 'Unlock more' })).toHaveAttribute('href', '/activate/courses/c-mech');

    await expectNoContentSurface(page);
  });

  test('is empty for a student with nothing activated', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/my-activations');
    await expect(page.getByTestId('mine-empty-courses')).toContainText('No activated courses yet');
    await page.getByRole('tab', { name: /Library documents/ }).click();
    await expect(page.getByTestId('mine-empty-documents')).toContainText('No library documents yet');
  });

  test('one student’s activations are not another’s', async ({ page, request }) => {
    await backendGrant(request, { userId: PROGRAMS.id, courseId: 'c-mech', coversAll: true });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/my-activations');
    await expect(page.getByTestId('mine-empty-courses')).toBeVisible();
    await page.goto('/activate/courses/c-mech');
    await expect(page.getByTestId('ownership-notice')).toHaveCount(0);
    await expect(page.getByTestId('code-input')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Library and wallet
// ---------------------------------------------------------------------------

test.describe('library — the backend’s catalogue, bought with credit', () => {
  test('lists what the backend offers this student, with its classification', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/library');
    const tiles = page.getByTestId('material-tile');
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toContainText('Mechanics Revision Notes');
    await expect(tiles.first()).toContainText('Mechanics');
    await expect(tiles.first()).toContainText('First Year');
    await expect(tiles.first()).toContainText('50');
    await expect(tiles.first()).toHaveAttribute('href', '/activate/library/m-mech');
    await expect(page.getByText('CCE Lab Manual')).toHaveCount(0);
    await expect(page.getByText('Course access codes do not work for the library.')).toBeVisible();
  });

  test('a Programs student also sees the Programs material, with a year filter', async ({ page }) => {
    await signIn(page, PROGRAMS.phone);
    await page.goto('/activate/library');
    await expect(page.getByTestId('material-tile')).toHaveCount(2);
    await page.getByTestId('library-year-filter').getByRole('button', { name: 'Second Year' }).click();
    await expect(page.getByTestId('material-tile')).toHaveCount(1);
    await expect(page.getByTestId('material-tile').first()).toContainText('CCE Lab Manual');
  });

  test('says nothing is available while the storefront is off', async ({ page, request }) => {
    await backendSet(request, { storefront: false });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/library');
    await expect(page.getByTestId('library-empty')).toContainText('No Library materials are available to you right now');
    await expect(page.getByTestId('material-tile')).toHaveCount(0);
  });

  test('a material page shows details and status, and never a way to read', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, libraryPartIds: ['mp-1'] });
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/library/m-mech');

    await expect(page.getByRole('heading', { name: 'Mechanics Revision Notes', level: 1 })).toBeVisible();
    await expect(page.getByText('Solved sheets and summaries.')).toBeVisible();
    await expect(page.getByTestId('library-owned-count')).toHaveText('1 / 3');

    const parts = page.getByTestId('library-parts');
    await expect(parts).toContainText('Sample chapter');
    await expect(parts).toContainText('Free preview — in the app');
    await expect(parts).toContainText('Read in the app');
    await expect(parts).toContainText('60');
    await expect(page.getByTestId('buy-part-mp-2').first()).toBeVisible();
    // Owned and preview parts have no button at all.
    await expect(page.getByTestId('buy-part-mp-1')).toHaveCount(0);
    await expect(page.getByTestId('buy-part-mp-free')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Read', exact: true })).toHaveCount(0);

    await expectNoContentSurface(page);
    const state = await backendState(request);
    expect(state.protectedHits).toEqual([]);
    expect(state.requests.filter((r) => /\/open$/.test(r.path))).toEqual([]);
  });

  test('a material outside the student’s scope does not exist for them', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/library/m-cce');
    await expect(page.getByText('This isn\'t available to you in the Library.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('CCE Lab Manual');
    const res = await page.request.post('/api/activate/proxy/library/purchase', { headers: WEB, data: { kind: 'PART', targetId: 'cp-1' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('wallet — recharge by card, spend in the library', () => {
  test('recharge, then buy: balance and ledger are the backend’s, to the pound', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);

    // Not enough credit: the only offer is to top up, with a recharge card.
    await page.goto('/activate/library/m-mech');
    await page.getByTestId('buy-part-mp-1').first().click();
    const sheet = page.getByTestId('purchase-sheet');
    await expect(sheet).toContainText('Still needed');
    await expect(page.getByTestId('purchase-confirm')).toHaveCount(0);
    await page.getByTestId('purchase-topup').click();
    await expect(page).toHaveURL(/\/activate\/wallet$/);

    await expect(page.getByTestId('wallet-balance')).toContainText('0');
    await expect(page.getByTestId('wallet-offline-note')).toContainText('There is no online payment');
    await page.getByTestId('recharge-input').fill('rchg-0100-aaaa');
    await page.getByTestId('recharge-submit').click();

    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'recharge');
    await expect(page.getByTestId('success-body')).toContainText('100');
    await expect(page.getByTestId('success-page')).toContainText('Balance now');
    let state = await backendState(request);
    expect(state.wallets[GENERAL.id]).toMatchObject({ balance: 100, totalRecharged: 100, totalSpent: 0, transactions: 1 });
    expect(state.codes['RCHG-0100-AAAA']).toMatchObject({ status: 'EXHAUSTED', redemptionCount: 1 });

    // Buy the 50 EGP part.
    await page.goto('/activate/library/m-mech');
    await page.getByTestId('buy-part-mp-1').first().click();
    await expect(page.getByTestId('purchase-sheet')).toContainText('Statics sheets');
    await page.getByTestId('purchase-confirm').click();

    await expect(page.getByTestId('success-page')).toHaveAttribute('data-outcome', 'library');
    await expect(page.getByTestId('success-body')).toContainText('You now own “Statics sheets”');
    state = await backendState(request);
    expect(state.wallets[GENERAL.id]).toMatchObject({ balance: 50, totalRecharged: 100, totalSpent: 50, transactions: 2 });
    expect(state.libraryOwned).toEqual([`${GENERAL.id}:mp-1`]);

    // The wallet page shows the same figures and both ledger lines.
    await page.goto('/activate/wallet');
    await expect(page.getByTestId('wallet-balance')).toContainText('50');
    await expect(page.getByText('Recharge card').first()).toBeVisible();
    await expect(page.getByText('Statics sheets').first()).toBeVisible();

    // And the document is listed as owned — to be read in the app.
    await page.goto('/activate/my-activations');
    await page.getByRole('tab', { name: /Library documents/ }).click();
    const doc = page.getByTestId('activation-document');
    await expect(doc).toHaveCount(1);
    await expect(doc).toContainText('Statics sheets');
    await expect(doc).toContainText('Available in the app');
    await expect(doc.locator('a[href*="reader"], button')).toHaveCount(0);

    expect((await backendState(request)).protectedHits).toEqual([]);
  });

  test('refused recharge codes change nothing', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/wallet');

    const refusals: [string, string][] = [
      ['NOPE-0000-0000', 'This recharge code is not valid'],
      ['RCHG-USED-0001', 'This code has already been used'],
      ['FULL-MECH-0001', 'This is a course access code, not a recharge card'],
    ];
    for (const [code, message] of refusals) {
      await page.getByTestId('recharge-input').fill(code);
      await page.getByTestId('recharge-submit').click();
      await expect(page.getByTestId('recharge-error'), code).toContainText(message);
    }
    await expect(page.getByTestId('recharge-error').getByRole('link', { name: 'Go to Courses' })).toHaveAttribute('href', '/activate/courses');

    const state = await backendState(request);
    expect(state.wallets[GENERAL.id]?.balance ?? 0).toBe(0);
    expect(state.wallets[GENERAL.id]?.transactions ?? 0).toBe(0);
    // The course card typed into the wallet was not spent.
    expect(state.codes['FULL-MECH-0001']).toMatchObject({ status: 'ACTIVE', redemptionCount: 0 });
  });

  test('credit cannot be created or spent beyond the balance through the portal', async ({ page, request }) => {
    await signIn(page, GENERAL.phone);
    const post = (path: string, data: unknown) => page.request.post(`/api/activate/proxy/${path}`, { headers: WEB, data });

    // No route adds credit except a recharge card.
    expect((await post('wallet', { amount: 500 })).status()).toBe(403);
    expect((await post('wallet/credit', { amount: 500 })).status()).toBe(403);
    expect((await post('wallet/transactions', { amount: 500 })).status()).toBe(403);
    // The price is the backend's: a client-sent amount is refused, not honoured.
    expect((await post('library/purchase', { kind: 'PART', targetId: 'mp-1', price: 0 })).status()).toBe(422);
    // And an honest purchase with no credit is refused.
    const broke = await post('library/purchase', { kind: 'PART', targetId: 'mp-1' });
    expect(broke.status()).toBe(402);
    expect((await broke.json()).code).toBe('INSUFFICIENT_CREDIT');

    const state = await backendState(request);
    expect(state.wallets[GENERAL.id]?.balance ?? 0).toBe(0);
    expect(state.libraryOwned).toEqual([]);
  });

  test('buying the same thing twice charges once', async ({ page, request }) => {
    await backendGrant(request, { userId: GENERAL.id, balance: 200 });
    await signIn(page, GENERAL.phone);
    const buy = () => page.request.post('/api/activate/proxy/library/purchase', { headers: WEB, data: { kind: 'PART', targetId: 'mp-1' } });
    const [first, second] = [await buy(), await buy()];
    expect((await first.json()).data).toMatchObject({ alreadyPurchased: false, pricePaid: 50, balanceAfter: 150 });
    expect((await second.json()).data).toMatchObject({ alreadyPurchased: true, balanceAfter: 150 });
    expect((await backendState(request)).wallets[GENERAL.id]).toMatchObject({ balance: 150, totalSpent: 50 });
  });
});

// ---------------------------------------------------------------------------
// Language, theme, small screens
// ---------------------------------------------------------------------------

test.describe('language, direction, theme and small screens', () => {
  test('switches between English/LTR and Arabic/RTL', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate/courses');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Courses', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Language' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: 'الكورسات', level: 1 })).toBeVisible();
    await expect(page.getByText('بوابة التفعيل').first()).toBeVisible();

    // The choice persists, and the sign-in page honours it before paint.
    await page.goto('/activate/account');
    await expect(page.getByRole('heading', { name: 'حسابي', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('switches between light and dark', async ({ page }) => {
    await signIn(page, GENERAL.phone);
    await page.goto('/activate');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole('button', { name: 'Theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).not.toBe(light);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  for (const [deviceName, viewport] of [
    ['small Android phone', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }],
    ['Pixel 7', asContextOptions(devices['Pixel 7'])],
    ['iPhone 14', asContextOptions(devices['iPhone 14'])],
  ] as const)
  for (const language of ['en', 'ar'] as const) {
    test(`fits a ${deviceName} screen without sideways scrolling (${language})`, async ({ browser, request }) => {
      await backendGrant(request, { userId: GENERAL.id, courseId: 'c-mech', partIds: ['p1'], balance: 100 });
      const context = await browser.newContext(viewport);
      await context.addInitScript(
        ([lang]) => localStorage.setItem('edu-web-language', JSON.stringify({ state: { language: lang }, version: 0 })),
        [language],
      );
      const page = await context.newPage();

      await page.goto('/activate/login');
      await expectNoHorizontalOverflow(page);
      await signIn(page, GENERAL.phone);

      for (const path of [
        '/activate',
        '/activate/courses',
        '/activate/courses/c-mech',
        '/activate/library',
        '/activate/library/m-mech',
        '/activate/wallet',
        '/activate/my-activations',
        '/activate/account',
        '/activate/success',
      ]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalOverflow(page);
      }

      // The destinations sit in a bottom bar on a phone.
      const bar = page.locator('nav.fixed');
      await expect(bar).toBeVisible();
      await expect(bar.locator('a')).toHaveCount(5);
      await bar.locator('a').nth(1).click();
      await expect(page).toHaveURL(/\/activate\/courses$/);
      await context.close();
    });
  }

  test('sign-in works in Arabic end to end', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // No stored preference: the platform default is Arabic.
    await page.goto('/activate/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('input[name="phone"]').fill(GENERAL.phone);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.getByRole('heading', { name: 'أهلًا يا Salma' })).toBeVisible();
    await context.close();
  });
});
