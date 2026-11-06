import { expect, test, type Page } from '@playwright/test';

import {
  MEDIA,
  STUDENT_GENERAL,
  STUDENT_PROGRAMS,
  fail,
  fullPart,
  fullView,
  mediaHits,
  mineItem,
  newBackend,
  ownerView,
  pkg,
  quoteFor,
  resetMedia,
  serveBackend,
  signInAs,
  summary,
  ticket,
  type LibraryBackend,
  type TestUser,
} from './support/library-api';

/**
 * Student Web Library against the Phase 1 backend contract.
 *
 * The page is a real production build; the backend is played by
 * `serveBackend`, which answers with Phase 1 shapes. The point of every test is
 * that the page shows what the server decided and nothing more — so each one
 * sets the server's answer, drives the real UI, and asserts on what a student
 * would see (and on what they must NOT see).
 */

// Two materials of the same faculty, as the backend would scope them:
//   MECH  — FACULTY scope: offered to General AND Programs students alike
//   PREP  — DEPARTMENTS scope: the Preparatory department (General) only
//   CCE   — DEPARTMENTS scope: a Programs department, hidden from General
const MECH = 'mat-mechanica';
const PREP = 'mat-prep-only';
const CCE = 'mat-cce-only';

async function open(page: Page, backend: LibraryBackend, user: TestUser, path: string) {
  await signInAs(page.context(), user, test.info().project.use.baseURL as string);
  await serveBackend(page, backend);
  await page.goto(path);
}

test.beforeEach(async ({ page }) => {
  await resetMedia(page);
});

// ---------------------------------------------------------------------------
// Academic visibility and the storefront
// ---------------------------------------------------------------------------

test.describe('browse — only what the backend returns', () => {
  test('a General student sees the faculty-wide material and their department material, nothing else', async ({
    page,
  }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      browse: [summary(MECH, 'Mechanica'), summary(PREP, 'Preparatory Physics')],
      materials: { [CCE]: { error: fail(404, 'NOT_FOUND') } },
    });
    await open(page, backend, STUDENT_GENERAL, '/library');

    await expect(page.getByText('Mechanica', { exact: true })).toBeVisible();
    await expect(page.getByText('Preparatory Physics', { exact: true })).toBeVisible();
    await expect(page.getByText('CCE Signals')).toHaveCount(0);

    // No filter of its own: the request carries no academic scope at all.
    const browseCall = backend.calls.find((c) => c.path.startsWith('library/materials'));
    expect(browseCall?.path).not.toMatch(/universityId|facultyId|departmentId/);
  });

  test('a Programs student of the same faculty also sees the faculty-wide material', async ({ page }) => {
    const backend = newBackend(STUDENT_PROGRAMS, {
      browse: [summary(MECH, 'Mechanica'), summary(CCE, 'CCE Signals')],
    });
    await open(page, backend, STUDENT_PROGRAMS, '/library');

    await expect(page.getByText('Mechanica', { exact: true })).toBeVisible();
    await expect(page.getByText('CCE Signals', { exact: true })).toBeVisible();
    await expect(page.getByText('Preparatory Physics')).toHaveCount(0);
  });

  test('an ineligible material opened by URL reveals nothing', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: {} });
    await open(page, backend, STUDENT_GENERAL, `/library/${CCE}`);

    await expect(page.getByText("This isn't available to you in the Library.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy' })).toHaveCount(0);
    await expect(page.getByText('EGP')).toHaveCount(0);
    // A refusal is the answer: no Retry that would only repeat it.
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('the year/level chips only narrow the request and never touch My documents', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      browse: [
        summary(MECH, 'Mechanica'),
        summary(PREP, 'First Year Notes', { academicYear: { id: 'yr-1', name: 'First year', nameAr: 'الفرقة الأولى', kind: 'YEAR' } }),
      ],
      mine: [mineItem('p-owned', 'Owned chapter', 'mat-other', 'Other material')],
    });
    await open(page, backend, STUDENT_GENERAL, '/library');

    const filter = page.getByTestId('library-year-filter');
    await filter.getByText('First year', { exact: true }).click();
    await expect(page.getByText('First Year Notes', { exact: true })).toBeVisible();
    await expect(page.getByText('Mechanica', { exact: true })).toHaveCount(0);
    expect(backend.calls.some((c) => c.path.includes('academicYearId=yr-1'))).toBe(true);

    await page.getByText('My documents', { exact: true }).click();
    await expect(page.getByText('Owned chapter')).toBeVisible();
    expect(backend.calls.filter((c) => c.path.startsWith('library/me')).every((c) => !c.path.includes('academicYearId'))).toBe(
      true,
    );
  });
});

test.describe('storefront off', () => {
  test('browsing is empty and says so, and an owner is pointed to their documents', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      browse: [],
      mine: [mineItem('p-1', 'Mechanica — Part 1', MECH, 'Mechanica')],
    });
    await open(page, backend, STUDENT_GENERAL, '/library');

    await expect(page.getByText('No Library materials are available to you right now')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Open my documents' }).click();
    await expect(page.getByText('Mechanica — Part 1')).toBeVisible();
  });

  test('an existing owner still reads an owned part from My documents', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      browse: [],
      mine: [mineItem('p-1', 'Mechanica — Part 1', MECH, 'Mechanica')],
    });
    await open(page, backend, STUDENT_GENERAL, '/library');
    await page.getByText('My documents', { exact: true }).click();
    await page.getByText('Mechanica — Part 1').click();

    await expect(page).toHaveURL(/\/library\/reader\/p-1$/);
    await expect(page.locator('[data-protected] canvas')).toHaveCount(1);
    expect(backend.calls.some((c) => c.method === 'POST' && c.path === 'library/parts/p-1/open')).toBe(true);
  });

  test('a withdrawn owned document is shown as withdrawn, not as a preview, and does not open', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      mine: [mineItem('p-9', 'Old chapter', MECH, 'Mechanica', 'WITHDRAWN')],
    });
    await open(page, backend, STUDENT_GENERAL, '/library');
    await page.getByText('My documents', { exact: true }).click();

    await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible();
    await expect(page.getByText('Free preview')).toHaveCount(0);
    await page.getByText('Old chapter').click();
    await expect(page).toHaveURL(/\/library$/);
  });
});

// ---------------------------------------------------------------------------
// Owner view
// ---------------------------------------------------------------------------

test.describe('owner view', () => {
  const OWNER = ownerView(MECH, 'Mechanica', [{ id: 'p-1', title: 'Part 1 — Statics' }]);

  test('lists only the owned parts, each with Read, and nothing priced or counted', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: { [MECH]: OWNER } });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);

    await expect(page.getByTestId('library-owner-note')).toBeVisible();
    const parts = page.getByTestId('library-parts');
    await expect(parts.getByText('Part 1 — Statics').first()).toBeVisible();
    await expect(parts.getByRole('button', { name: 'Read' }).first()).toBeVisible();

    await expect(page.getByRole('button', { name: /^Buy/ })).toHaveCount(0);
    await expect(page.getByTestId('library-packages')).toHaveCount(0);
    await expect(page.getByText('EGP')).toHaveCount(0);
    await expect(page.getByText('Overview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Wallet' })).toHaveCount(0);

    await parts.getByRole('button', { name: 'Read' }).first().click();
    await expect(page).toHaveURL(/\/library\/reader\/p-1$/);
    await expect(page.locator('[data-protected] canvas')).toHaveCount(1);
  });

  test('a FULL view seen earlier is never painted when the material is now owner-only', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      browse: [summary(MECH, 'Mechanica')],
      materials: {
        [MECH]: fullView(
          MECH,
          'Mechanica',
          [fullPart('p-1', 'Part 1 — Statics', 'OWNED'), fullPart('p-2', 'Part 2 — Dynamics', 'PURCHASABLE', 60)],
          [pkg('pk-1', 'Whole course bundle', 'PURCHASABLE', ['p-1', 'p-2'])],
        ),
      },
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await expect(page.getByText('Part 2 — Dynamics').first()).toBeVisible();
    await expect(page.getByText('Whole course bundle')).toBeVisible();

    // The storefront goes off. The next answer is the owner view, and it is slow.
    backend.materials[MECH] = { ...OWNER, delayMs: 1500 };
    await page.getByRole('link', { name: 'Library' }).first().click();
    await expect(page).toHaveURL(/\/library$/);
    await page.goto(`/library/${MECH}`);

    // While it loads, the old prices, bundle and unowned part are not shown.
    await expect(page.getByText('Part 2 — Dynamics')).toHaveCount(0);
    await expect(page.getByText('Whole course bundle')).toHaveCount(0);
    await expect(page.getByText('EGP')).toHaveCount(0);

    await expect(page.getByTestId('library-owner-note')).toBeVisible();
    await expect(page.getByText('Part 2 — Dynamics')).toHaveCount(0);
    await expect(page.getByText('Whole course bundle')).toHaveCount(0);
    await expect(page.getByText('EGP')).toHaveCount(0);
  });

  test('a material that becomes hidden on refetch shows the refusal, not the old data', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      materials: { [MECH]: fullView(MECH, 'Mechanica', [fullPart('p-2', 'Part 2 — Dynamics', 'PURCHASABLE', 60)]) },
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await expect(page.getByText('Part 2 — Dynamics').first()).toBeVisible();

    backend.materials = {};
    // A window refocus refetches in place.
    // React Query refetches on window focus, which it hears as `visibilitychange` on window.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText("This isn't available to you in the Library.")).toBeVisible();
    await expect(page.getByText('Part 2 — Dynamics')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Full view and purchases
// ---------------------------------------------------------------------------

test.describe('full view', () => {
  const FULL = fullView(
    MECH,
    'Mechanica',
    [
      fullPart('p-own', 'Owned part', 'OWNED'),
      fullPart('p-pre', 'Sample chapter', 'PREVIEW', 0),
      fullPart('p-buy', 'Buyable part', 'PURCHASABLE', 60),
      fullPart('p-rev', 'Revoked part', 'REVOKED', 70),
      fullPart('p-una', 'Unavailable part', 'UNAVAILABLE', 80),
    ],
    [
      pkg('pk-buy', 'Open bundle', 'PURCHASABLE', ['p-own', 'p-buy'], 100, { partsAlreadyOwned: 1 }),
      pkg('pk-una', 'Blocked bundle', 'UNAVAILABLE', ['p-buy', 'p-rev'], 110),
      pkg('pk-own', 'Owned bundle', 'OWNED', ['p-own'], 40),
    ],
  );

  const row = (page: Page, title: string) => page.getByRole('row').filter({ hasText: title });

  test('each part shows its access state and only the action that state allows', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: { [MECH]: FULL } });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);

    await expect(row(page, 'Owned part')).toContainText('Owned');
    await expect(row(page, 'Owned part').getByRole('button', { name: 'Read' })).toBeVisible();
    await expect(row(page, 'Owned part')).not.toContainText('EGP');

    await expect(row(page, 'Sample chapter')).toContainText('Free preview');
    await expect(row(page, 'Sample chapter').getByRole('button', { name: 'Read' })).toBeVisible();

    await expect(row(page, 'Buyable part')).toContainText('EGP');
    await expect(row(page, 'Buyable part').getByRole('button', { name: 'Buy' })).toBeVisible();

    await expect(row(page, 'Revoked part')).toContainText('Ownership revoked');
    await expect(row(page, 'Revoked part').getByRole('button')).toHaveCount(0);
    await expect(row(page, 'Revoked part')).not.toContainText('EGP');
    await expect(page.getByTestId('library-revoked-note')).toBeVisible();

    await expect(row(page, 'Unavailable part')).toContainText('Not available');
    await expect(row(page, 'Unavailable part').getByRole('button')).toHaveCount(0);
    await expect(row(page, 'Unavailable part')).not.toContainText('EGP');
  });

  test('packages: only an available one can be bought', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: { [MECH]: FULL } });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    const packages = page.getByTestId('library-packages');

    // One card per package: the grid's direct children.
    const card = (title: string) => packages.locator('.grid > *').filter({ hasText: title });
    await expect(card('Open bundle').getByRole('button', { name: 'Buy bundle' })).toBeVisible();
    await expect(card('Open bundle')).toContainText('You already own 1 of the 2 parts');
    await expect(card('Blocked bundle').getByRole('button')).toHaveCount(0);
    await expect(card('Blocked bundle')).toContainText("This bundle can't be bought right now.");
    await expect(card('Owned bundle').getByRole('button')).toHaveCount(0);
  });

  test('a preview opens through the preview path, and its refusal says so', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      materials: { [MECH]: FULL },
      open: () => fail(404, 'NOT_FOUND'),
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await row(page, 'Sample chapter').getByRole('button', { name: 'Read' }).click();

    await expect(page).toHaveURL(/\/library\/reader\/p-pre\?preview=1$/);
    await expect(page.getByText("This free preview isn't available right now.")).toBeVisible();
  });

  // Decision B: revocation and preview eligibility are separate. The backend
  // says what the student can do (`access`) and, separately, what happened to
  // their copy (`ownership`); the page shows both and decides neither.
  const REVOKED_PREVIEW = fullView(MECH, 'Mechanica', [
    fullPart('p-rp', 'Revoked sample', 'PREVIEW', 0, { ownership: 'REVOKED', owned: true }),
    fullPart('p-rev', 'Revoked part', 'REVOKED', 70),
  ]);

  test('Decision B: a revoked part still offered as a free preview shows both labels and opens only as a preview', async ({
    page,
  }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: { [MECH]: REVOKED_PREVIEW } });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);

    await expect(row(page, 'Revoked sample')).toContainText('Free preview');
    await expect(row(page, 'Revoked sample')).toContainText('Ownership revoked');
    await expect(row(page, 'Revoked sample')).not.toContainText('EGP');
    await expect(row(page, 'Revoked sample').getByRole('button', { name: 'Buy' })).toHaveCount(0);
    await expect(row(page, 'Revoked part').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('library-revoked-note')).toBeVisible();

    await row(page, 'Revoked sample').getByRole('button', { name: 'Read' }).click();
    await expect(page).toHaveURL(/\/library\/reader\/p-rp\?preview=1$/);
    await expect(page.locator('[data-protected] canvas')).toHaveCount(1);
    // The server decides: one ticket request, for that part, and nothing else.
    expect(backend.calls.filter((c) => c.path.endsWith('/open')).map((c) => c.path)).toEqual(['library/parts/p-rp/open']);
    expect(backend.calls.some((c) => c.path === 'library/purchase' || c.path === 'library/quote')).toBe(false);
  });

  test('Decision B: a preview refused to a revoked student says the preview is unavailable', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      materials: { [MECH]: REVOKED_PREVIEW },
      open: () => fail(403, 'LIBRARY_ENTITLEMENT_REVOKED'),
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await row(page, 'Revoked sample').getByRole('button', { name: 'Read' }).click();

    await expect(page.getByText("This free preview isn't available right now.")).toBeVisible();
    await expect(page.getByText('Your access to this document was revoked.')).toHaveCount(0);
    await expect(page.locator('[data-protected]')).toHaveCount(0);
    expect(await mediaHits(page)).toEqual([]);
  });

  test('buying: the quote, then the wallet debit, then the page refreshes from the server', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: { [MECH]: FULL } });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);

    await row(page, 'Buyable part').getByRole('button', { name: 'Buy' }).click();
    const pay = page.getByRole('button', { name: /^Pay/ });
    await expect(pay).toBeVisible();

    // The server now says it is owned.
    backend.materials[MECH] = fullView(MECH, 'Mechanica', [
      fullPart('p-own', 'Owned part', 'OWNED'),
      fullPart('p-buy', 'Buyable part', 'OWNED'),
    ]);
    await pay.click();
    await expect(row(page, 'Buyable part').getByRole('button', { name: 'Read' })).toBeVisible();

    const purchase = backend.calls.find((c) => c.path === 'library/purchase');
    expect(purchase?.body).toEqual({ kind: 'PART', targetId: 'p-buy' });
  });

  test('a revoked quote is refused clearly, with nothing to pay', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      materials: { [MECH]: FULL },
      quote: () => fail(403, 'LIBRARY_ENTITLEMENT_REVOKED'),
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await page.getByTestId('library-packages').getByRole('button', { name: 'Buy bundle' }).click();

    await expect(page.getByText('Your access to this document was revoked.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);
    expect(backend.calls.some((c) => c.path === 'library/purchase')).toBe(false);
  });

  test('a purchase refused by the server is shown, and nothing is granted', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      materials: { [MECH]: FULL },
      purchase: () => fail(403, 'LIBRARY_NOT_AVAILABLE'),
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await row(page, 'Buyable part').getByRole('button', { name: 'Buy' }).click();
    await page.getByRole('button', { name: /^Pay/ }).click();

    await expect(page.getByText("This isn't available to you in the Library.")).toBeVisible();
    await expect(row(page, 'Buyable part').getByRole('button', { name: 'Buy' })).toBeVisible();
  });

  test('short of credit: the only way forward is the wallet, never a payment page', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      materials: { [MECH]: FULL },
      quote: (body) => quoteFor(body, { balance: 10, sufficientCredit: false, shortfall: 50, price: 60 }),
    });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await row(page, 'Buyable part').getByRole('button', { name: 'Buy' }).click();

    await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add credit' }).click();
    await expect(page).toHaveURL(/\/wallet$/);
  });

  test('no online payment or checkout link anywhere in the Library', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { materials: { [MECH]: FULL } });
    await open(page, backend, STUDENT_GENERAL, `/library/${MECH}`);
    await row(page, 'Buyable part').getByRole('button', { name: 'Buy' }).click();
    await expect(page.getByRole('button', { name: /^Pay/ })).toBeVisible();

    const externalLinks = await page
      .locator('a[href]')
      .evaluateAll((links) =>
        links
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => !href.startsWith(window.location.origin) && !href.startsWith('mailto:') && !href.startsWith('tel:')),
      );
    expect(externalLinks.filter((href) => /pay|checkout|stripe|paymob|fawry|card/i.test(href))).toEqual([]);
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

test.describe('reader', () => {
  test('draws the ticket URL — and only that URL — with the watermark burned in', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL);
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1');

    const canvas = page.locator('[data-protected] canvas');
    await expect(canvas).toHaveCount(1);
    await expect(page.locator('[data-protected] span').filter({ hasText: STUDENT_GENERAL.fullName })).toBeVisible();

    // The page is blank, so any dark pixel on the canvas is the watermark.
    const marked = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 235 || data[i + 1]! < 235 || data[i + 2]! < 235) dark++;
      return dark;
    });
    expect(marked).toBeGreaterThan(500);

    // No viewer chrome, no direct link to the file.
    await expect(page.locator('iframe, embed, object')).toHaveCount(0);
    await expect(page.locator('a[href*=".pdf"]')).toHaveCount(0);

    const hits = await mediaHits(page);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.includes('/media/doc.pdf?exp=9999999999&sig=test'))).toBe(true);
  });

  test('an expired or refused ticket asks the server for a new one — it never reuses or edits the URL', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      open: (partId, call) =>
        call === 1 ? ticket(partId, STUDENT_GENERAL, `${MEDIA}/media/refused.pdf?exp=1&sig=old`) : ticket(partId, STUDENT_GENERAL),
    });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1');

    await expect(page.getByText('This reading link has expired or was refused.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen the document' }).click();
    await expect(page.locator('[data-protected] canvas')).toHaveCount(1);

    expect(backend.calls.filter((c) => c.path === 'library/parts/p-1/open')).toHaveLength(2);
    const hits = await mediaHits(page);
    expect(hits.filter((h) => h.includes('refused.pdf'))).toHaveLength(1);
  });

  test('a preview the gate keeps refusing speaks about the preview, and does not offer to reopen forever', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      open: (partId) => ticket(partId, STUDENT_GENERAL, `${MEDIA}/media/refused.pdf?exp=1&sig=old`),
    });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1?preview=1');

    const reopen = page.getByRole('button', { name: 'Reopen the document' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(page.getByText("This free preview couldn't be opened.", { exact: false })).toBeVisible();
      await reopen.click();
    }

    await expect(page.getByText("This free preview isn't available right now.")).toBeVisible();
    await expect(reopen).toHaveCount(0);
    // Never a device message: a free preview needs no approved device.
    await expect(page.getByText('approved device', { exact: false })).toHaveCount(0);
    expect(backend.calls.filter((c) => c.path === 'library/parts/p-1/open')).toHaveLength(3);
  });

  test('an owned document the gate keeps refusing stops offering to reopen, and says what to check', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      open: (partId) => ticket(partId, STUDENT_GENERAL, `${MEDIA}/media/refused.pdf?exp=1&sig=old`),
    });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1');

    const reopen = page.getByRole('button', { name: 'Reopen the document' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(page.getByText('This reading link has expired or was refused.', { exact: false })).toBeVisible();
      await reopen.click();
    }

    await expect(page.getByText('This document still can', { exact: false })).toBeVisible();
    await expect(reopen).toHaveCount(0);
    expect(backend.calls.filter((c) => c.path === 'library/parts/p-1/open')).toHaveLength(3);
  });

  test('when the gate cannot verify a ticket, the student is told so, and trying again works', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      open: (partId, call) =>
        call === 1
          ? ticket(partId, STUDENT_GENERAL, `${MEDIA}/media/unverifiable.pdf?exp=1&sig=old`)
          : ticket(partId, STUDENT_GENERAL),
    });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1');

    await expect(page.getByText("We couldn't verify your access just now.", { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen the document' }).click();
    await expect(page.locator('[data-protected] canvas')).toHaveCount(1);
  });

  test('a revoked entitlement cannot open the document', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, { open: () => fail(403, 'LIBRARY_ENTITLEMENT_REVOKED') });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1');

    await expect(page.getByText('Your access to this document was revoked.')).toBeVisible();
    await expect(page.locator('[data-protected]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    expect(await mediaHits(page)).toEqual([]);
  });

  test('an unbought document, and a device problem, are explained without opening anything', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      open: (partId) => (partId === 'p-unpaid' ? fail(402, 'PAYMENT_REQUIRED') : fail(403, 'DEVICE_NOT_AUTHORIZED')),
    });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-unpaid');
    await expect(page.getByText("You haven't bought this document.")).toBeVisible();

    await page.goto('/library/reader/p-device');
    await expect(page.getByText(/device/i).first()).toBeVisible();
    expect(await mediaHits(page)).toEqual([]);
  });

  test('a network failure offers Try again, which asks for a ticket again', async ({ page }) => {
    const backend = newBackend(STUDENT_GENERAL, {
      open: (partId, call) => (call === 1 ? fail(503, 'SERVER_ERROR') : ticket(partId, STUDENT_GENERAL)),
    });
    await open(page, backend, STUDENT_GENERAL, '/library/reader/p-1');

    await expect(page.getByText("Couldn't reach the server.", { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[data-protected] canvas')).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Account isolation
// ---------------------------------------------------------------------------

test.describe('account isolation', () => {
  test('a second account in the same browser never sees the first account’s Library', async ({ page }) => {
    const first = newBackend(STUDENT_GENERAL, {
      browse: [summary(PREP, 'Preparatory Physics')],
      materials: { [PREP]: fullView(PREP, 'Preparatory Physics', [fullPart('p-x', 'Secret part', 'PURCHASABLE', 99)]) },
    });
    await open(page, first, STUDENT_GENERAL, `/library/${PREP}`);
    await expect(page.getByText('Secret part').first()).toBeVisible();

    // Signed out and back in as someone else: new cookies, a different server answer.
    await page.context().clearCookies();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const second = newBackend(STUDENT_PROGRAMS, { browse: [summary(CCE, 'CCE Signals')], materials: {} });
    await open(page, second, STUDENT_PROGRAMS, '/library');

    await expect(page.getByText('CCE Signals', { exact: true })).toBeVisible();
    await expect(page.getByText('Preparatory Physics')).toHaveCount(0);

    await page.goto(`/library/${PREP}`);
    await expect(page.getByText("This isn't available to you in the Library.")).toBeVisible();
    await expect(page.getByText('Secret part')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Proxy cache policy — the real Next.js proxy route, not a mock
// ---------------------------------------------------------------------------

test.describe('proxy cache policy', () => {
  test('Library answers from the proxy are never stored; course answers are unchanged', async ({ request }) => {
    // Signed out: the proxy refuses Library reads itself (401).
    const signedOut = await request.get('/api/proxy/library/materials/m1');
    expect(signedOut.status()).toBe(401);
    expect(signedOut.headers()['cache-control']).toBe('private, no-store');

    // Signed in, with the backend unreachable: the proxy's own error answer.
    const signedIn = await request.get('/api/proxy/library/me', {
      headers: { cookie: 'edu_at=test-access-token' },
    });
    expect(signedIn.status()).toBeGreaterThanOrEqual(500);
    expect(signedIn.headers()['cache-control']).toBe('private, no-store');

    const course = await request.get('/api/proxy/courses/c1');
    expect(course.status()).toBe(401);
    expect(course.headers()['cache-control'] ?? '').not.toContain('no-store');
  });
});
