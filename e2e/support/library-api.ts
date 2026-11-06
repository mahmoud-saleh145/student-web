import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * The backend, as the browser sees it through `/api/proxy/*`.
 *
 * Every shape here is transcribed from the Phase 1 backend
 * (`edu-backend` `src/modules/library/*`), not invented:
 *
 *   GET  library/materials           paginated { items, meta } of eligible materials;
 *                                    empty while the storefront is off
 *   GET  library/materials/:id       view FULL (parts with `access`, packages) or
 *                                    view OWNER (owned parts only, packages []),
 *                                    or 404 NOT_FOUND for anything hidden
 *   GET  library/me                  paginated owned parts with `status`
 *   POST library/quote|purchase      { kind, targetId } — same refusals for both
 *   POST library/parts/:id/open      ticket { url, watermark, ... } or a refusal
 *
 * Each test holds a `LibraryBackend` and mutates it to move the "server"
 * between states (storefront off, entitlement revoked, ...).
 */

export const MEDIA = `http://127.0.0.1:${process.env.MEDIA_PORT ?? 4613}`;

export interface TestUser {
  id: string;
  fullName: string;
  phone: string;
}

export const STUDENT_GENERAL: TestUser = { id: 'stu-general-01', fullName: 'Salma General', phone: '01000000101' };
export const STUDENT_PROGRAMS: TestUser = { id: 'stu-programs-02', fullName: 'Omar Programs', phone: '01000000102' };

type Json = Record<string, unknown>;

export interface LibraryBackend {
  user: TestUser;
  /** What `GET library/materials` returns for this user, already filtered by the "server". */
  browse: Json[];
  /** `GET library/materials/:id` answers, by id. A missing id is a 404. */
  materials: Record<string, Json | { error: ApiFailure; delayMs?: number } | (Json & { delayMs?: number })>;
  mine: Json[];
  wallet: Json;
  /** `POST library/quote`: a quote body or a refusal. */
  quote: (body: { kind: string; targetId: string }) => Json | ApiFailure;
  purchase: (body: { kind: string; targetId: string }) => Json | ApiFailure;
  /** `POST library/parts/:id/open`. */
  open: (partId: string, call: number) => Json | ApiFailure;
  calls: { method: string; path: string; body?: unknown }[];
}

export interface ApiFailure {
  status: number;
  code: string;
  message?: string;
}

export const fail = (status: number, code: string): ApiFailure => ({ status, code });
const isFailure = (value: unknown): value is ApiFailure =>
  typeof value === 'object' && value !== null && 'status' in value && 'code' in value && !('success' in value);

const meta = (items: unknown[]) => ({
  page: 1,
  pageSize: 20,
  total: items.length,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
});

// ---------------------------------------------------------------------------
// Fixtures — Phase 1 shapes
// ---------------------------------------------------------------------------

export const YEAR_PREP = { id: 'yr-prep', name: 'Preparatory year', nameAr: 'الفرقة الإعدادية', kind: 'YEAR' };

export function summary(id: string, title: string, over: Json = {}): Json {
  return {
    id,
    title,
    titleAr: null,
    description: `${title} description`,
    coverUrl: null,
    subject: { id: 'subj-mech', name: 'Mechanics' },
    academicYear: YEAR_PREP,
    partCount: 3,
    packageCount: 1,
    ownedPartCount: 0,
    priceFrom: 50,
    priceTotal: 170,
    ...over,
  };
}

export function fullPart(id: string, title: string, access: string, price = 50, over: Json = {}): Json {
  const isPreview = access === 'PREVIEW';
  return {
    id,
    title,
    titleAr: null,
    description: null,
    sortOrder: 1,
    price,
    currency: 'EGP',
    pageCount: 12,
    mimeType: 'application/pdf',
    thumbnailUrl: null,
    access,
    // Decision B: what the student holds, independent of `access`. A revoked
    // part offered as a free preview overrides this to REVOKED.
    ownership: access === 'OWNED' ? 'OWNED' : access === 'REVOKED' ? 'REVOKED' : 'NONE',
    ownedSince: access === 'OWNED' ? '2026-10-01T08:00:00.000Z' : null,
    isPreview,
    owned: access === 'OWNED' || access === 'PREVIEW',
    purchasable: access === 'PURCHASABLE',
    ...over,
  };
}

export function fullView(id: string, title: string, parts: Json[], packages: Json[] = []): Json {
  return {
    id,
    title,
    titleAr: null,
    description: `${title} description`,
    coverUrl: null,
    subject: { id: 'subj-mech', name: 'Mechanics' },
    academicYear: YEAR_PREP,
    view: 'FULL',
    ownsAllParts: parts.length > 0 && parts.every((p) => p.access === 'OWNED'),
    parts,
    packages,
  };
}

export function pkg(id: string, title: string, access: string, partIds: string[], price = 120, over: Json = {}): Json {
  return {
    id,
    title,
    titleAr: null,
    description: null,
    price,
    currency: 'EGP',
    partCount: partIds.length,
    partIds,
    partsAlreadyOwned: 0,
    access,
    fullyOwned: access === 'OWNED',
    ...over,
  };
}

/** Exactly what `LibraryService.ownerView` returns: no price, no packages, no counts. */
export function ownerView(id: string, title: string, owned: { id: string; title: string }[]): Json {
  return {
    id,
    title,
    titleAr: null,
    description: `${title} description`,
    coverUrl: null,
    subject: { id: 'subj-mech', name: 'Mechanics' },
    academicYear: YEAR_PREP,
    view: 'OWNER',
    parts: owned.map((part, index) => ({
      id: part.id,
      title: part.title,
      titleAr: null,
      description: null,
      sortOrder: index + 1,
      pageCount: 12,
      mimeType: 'application/pdf',
      thumbnailUrl: null,
      access: 'OWNED',
      ownership: 'OWNED',
      ownedSince: '2026-10-01T08:00:00.000Z',
      isPreview: false,
      owned: true,
      purchasable: false,
    })),
    packages: [],
  };
}

export function mineItem(partId: string, title: string, materialId: string, materialTitle: string, status = 'READABLE'): Json {
  return {
    entitlementId: `ent-${partId}`,
    partId,
    title,
    titleAr: null,
    materialId,
    materialTitle,
    pageCount: 12,
    mimeType: 'application/pdf',
    source: 'PURCHASE',
    grantedAt: '2026-10-01T08:00:00.000Z',
    status,
    available: status === 'READABLE',
  };
}

export function ticket(partId: string, user: TestUser, url = `${MEDIA}/media/doc.pdf?exp=9999999999&sig=test`): Json {
  return {
    libraryPartId: partId,
    title: `Document ${partId}`,
    url,
    mimeType: 'application/pdf',
    pageCount: 1,
    expiresAt: '2026-11-05T12:00:00.000Z',
    watermark: {
      primary: user.fullName,
      secondary: `ID: ${user.id.slice(-8).toUpperCase()}`,
      sessionTag: 'TESTTAG000000000',
      opacity: 0.25,
      moveIntervalSeconds: 30,
    },
  };
}

export function quoteFor(body: { kind: string; targetId: string }, over: Json = {}): Json {
  return {
    kind: body.kind,
    targetId: body.targetId,
    title: `Item ${body.targetId}`,
    materialTitle: 'Mechanica',
    price: 50,
    currency: 'EGP',
    balance: 200,
    sufficientCredit: true,
    shortfall: 0,
    partCount: 1,
    partsAlreadyOwned: 0,
    fullyOwned: false,
    purchasable: true,
    totalPartCount: 1,
    withdrawnPartCount: 0,
    ...over,
  };
}

export function newBackend(user: TestUser, over: Partial<LibraryBackend> = {}): LibraryBackend {
  return {
    user,
    browse: [],
    materials: {},
    mine: [],
    wallet: { balance: 200, currency: 'EGP' },
    quote: (body) => quoteFor(body),
    purchase: (body) => ({
      purchaseId: 'pur-1',
      kind: body.kind,
      targetId: body.targetId,
      title: `Item ${body.targetId}`,
      pricePaid: 50,
      currency: 'EGP',
      balanceAfter: 150,
      partsGranted: 1,
      partsAlreadyOwned: 0,
      purchasedAt: '2026-11-05T10:00:00.000Z',
      alreadyPurchased: false,
    }),
    open: (partId) => ticket(partId, user),
    calls: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * A signed-in browser for `user`, without any real backend or real account.
 *
 * The app's default language is Arabic; tests read English unless they ask
 * for Arabic, through the same persisted store the language switch writes.
 */
export async function signInAs(
  context: BrowserContext,
  user: TestUser,
  baseURL: string,
  options: { language?: 'en' | 'ar'; theme?: 'light' | 'dark' } = {},
) {
  const language = options.language ?? 'en';
  const theme = options.theme ?? 'light';
  await context.addInitScript(
    ({ language, theme }) => {
      try {
        localStorage.setItem('edu-web-language', JSON.stringify({ state: { language }, version: 0 }));
        localStorage.setItem('edu-web-theme', JSON.stringify({ state: { preference: theme }, version: 0 }));
      } catch {
        /* storage blocked: the app falls back to its defaults */
      }
    },
    { language, theme },
  );
  const url = new URL(baseURL);
  const profile = encodeURIComponent(
    JSON.stringify({ id: user.id, fullName: user.fullName, phone: user.phone, role: 'STUDENT', status: 'ACTIVE', avatarUrl: null }),
  );
  await context.addCookies([
    { name: 'edu_at', value: `test-access-${user.id}`, domain: url.hostname, path: '/' },
    { name: 'edu_rt', value: `test-refresh-${user.id}`, domain: url.hostname, path: '/' },
    { name: 'edu_pf', value: profile, domain: url.hostname, path: '/' },
  ]);
}

const send = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', json: { success: true, data } });

const refuse = (route: Route, failure: ApiFailure) =>
  route.fulfill({
    status: failure.status,
    contentType: 'application/json',
    json: {
      success: false,
      error: { code: failure.code, message: failure.message ?? failure.code },
      statusCode: failure.status,
    },
  });

/** Routes every `/api/proxy/*` call to `backend`. Unknown paths get a neutral empty answer. */
export async function serveBackend(page: Page, backend: LibraryBackend) {
  let opens = 0;
  await page.route('**/api/proxy/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/proxy\//, '');
    const method = request.method();
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    backend.calls.push({ method, path: `${path}${url.search}`, body });

    if (path === 'auth/me') {
      return send(route, { ...backend.user, role: 'STUDENT', status: 'ACTIVE', avatarUrl: null });
    }
    if (path === 'wallet') return send(route, backend.wallet);

    if (path === 'library/materials' && method === 'GET') {
      const year = url.searchParams.get('academicYearId');
      const items = year
        ? backend.browse.filter((m) => (m.academicYear as { id?: string } | null)?.id === year)
        : backend.browse;
      return send(route, { items, meta: meta(items) });
    }
    const material = /^library\/materials\/([^/]+)$/.exec(path);
    if (material && method === 'GET') {
      const answer = backend.materials[material[1]!];
      if (!answer) return refuse(route, fail(404, 'NOT_FOUND'));
      const delay = (answer as { delayMs?: number }).delayMs;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if ('error' in answer) return refuse(route, answer.error as ApiFailure);
      const rest = { ...(answer as Json) };
      delete rest.delayMs;
      return send(route, rest);
    }
    if (path === 'library/me') return send(route, { items: backend.mine, meta: meta(backend.mine) });

    if (path === 'library/quote' && method === 'POST') {
      const out = backend.quote(body as { kind: string; targetId: string });
      return isFailure(out) ? refuse(route, out) : send(route, out);
    }
    if (path === 'library/purchase' && method === 'POST') {
      const out = backend.purchase(body as { kind: string; targetId: string });
      return isFailure(out) ? refuse(route, out) : send(route, out);
    }
    const open = /^library\/parts\/([^/]+)\/open$/.exec(path);
    if (open && method === 'POST') {
      opens += 1;
      const out = backend.open(open[1]!, opens);
      return isFailure(out) ? refuse(route, out) : send(route, out);
    }

    // Shell chrome (notifications, unread counts, ...): empty but well-formed.
    if (method === 'GET') return send(route, { items: [], meta: meta([]) });
    return send(route, {});
  });
}

export async function mediaHits(page: Page): Promise<string[]> {
  const res = await page.request.get(`${MEDIA}/__hits`);
  return (await res.json()) as string[];
}

export async function resetMedia(page: Page) {
  await page.request.get(`${MEDIA}/__reset`);
}
