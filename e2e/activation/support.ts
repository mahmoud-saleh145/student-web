import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * Helpers for the activation portal's browser tests.
 *
 * `backend*` talk to the stand-in backend's control surface directly (reset,
 * read state, seed ownership). Everything else goes through the portal the
 * way a browser does.
 */

export const BACKEND = `http://127.0.0.1:${process.env.ACTIVATION_BACKEND_PORT ?? 4812}`;

/** Fixture accounts of the stand-in backend. Not real accounts. */
export const PASSWORD = 'Passw0rd-fixture';
export const GENERAL = { id: 'stu-general', phone: '01000000101', firstName: 'Salma' };
export const PROGRAMS = { id: 'stu-programs', phone: '01000000102', firstName: 'Omar' };
export const DISABLED = { id: 'stu-disabled', phone: '01000000103' };
export const STAFF = { id: 'teacher-1', phone: '01000000199' };

export const WEB = { 'x-web-request': '1' };

export interface BackendState {
  storefront: boolean;
  loginHeaders: Record<string, string | null>[];
  deviceHeaderRequests: unknown[];
  devices: unknown[];
  securityEvents: unknown[];
  protectedHits: { method: string; path: string }[];
  requests: { method: string; path: string; query: string }[];
  sessions: { userId: string; deviceId: string | null; revoked: boolean }[];
  codes: Record<string, { status: string; redemptionCount: number; redeemedBy: string[] }>;
  wallets: Record<string, { balance: number; totalRecharged: number; totalSpent: number; transactions: number }>;
  enrollments: Record<string, { state: string; coversAll: boolean; sectionIds: string[] }>;
  partOwned: string[];
  libraryOwned: string[];
}

export async function backendReset(request: APIRequestContext): Promise<void> {
  await request.post(`${BACKEND}/__test/reset`);
}

export async function backendState(request: APIRequestContext): Promise<BackendState> {
  return (await (await request.get(`${BACKEND}/__test/state`)).json()) as BackendState;
}

export async function backendSet(request: APIRequestContext, patch: Record<string, unknown>): Promise<void> {
  await request.post(`${BACKEND}/__test/set`, { data: patch });
}

export async function backendGrant(request: APIRequestContext, grant: Record<string, unknown>): Promise<void> {
  await request.post(`${BACKEND}/__test/grant`, { data: grant });
}

export async function backendExpireAccess(request: APIRequestContext, userId: string): Promise<void> {
  await request.post(`${BACKEND}/__test/expire-access`, { data: { userId } });
}

/** How many times the backend was asked for `method path` (prefix match on path). */
export function calls(state: BackendState, method: string, path: string): number {
  return state.requests.filter((r) => r.method === method && r.path === path).length;
}

/** English UI and a fixed theme, so assertions read the same on every machine. */
export async function useEnglish(context: BrowserContext, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await context.addInitScript(
    ([t]) => {
      try {
        if (!localStorage.getItem('edu-web-language')) {
          localStorage.setItem('edu-web-language', JSON.stringify({ state: { language: 'en' }, version: 0 }));
        }
        if (!localStorage.getItem('edu-web-theme')) {
          localStorage.setItem('edu-web-theme', JSON.stringify({ state: { preference: t }, version: 0 }));
        }
      } catch {
        // Storage unavailable: the page falls back to its defaults.
      }
    },
    [theme],
  );
}

/** Signs in through the portal's own form. */
export async function signInThroughForm(page: Page, phone: string, password: string = PASSWORD): Promise<void> {
  await page.goto('/activate/login');
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Signs in through the portal's auth route; the session cookies land in the page's context. */
export async function signIn(page: Page, phone: string): Promise<void> {
  const res = await page.request.post('/api/activate/auth/login', { headers: WEB, data: { phone, password: PASSWORD } });
  expect(res.status(), await res.text()).toBe(200);
}

/** Types a card code into the course page's code box and presses Activate. */
export async function enterCourseCode(page: Page, code: string): Promise<void> {
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('code-submit').click();
}

/** Nothing in the page can play or open protected content. */
export async function expectNoContentSurface(page: Page): Promise<void> {
  await expect(page.locator('video, audio, iframe, embed, object, canvas')).toHaveCount(0);
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  const learning = hrefs.filter((h) => /^\/(lessons|player|viewer|library\/reader|home|my-courses|courses|library|wallet|login|register)(\/|$|\?)/.test(h));
  expect(learning, 'links out of the portal into the learning website').toEqual([]);
}

/** The page fits its viewport: no sideways scroll. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);
}
