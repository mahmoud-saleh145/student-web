import { defineConfig, devices } from '@playwright/test';

const APP_PORT = Number(process.env.APP_PORT ?? 4612);
const MEDIA_PORT = Number(process.env.MEDIA_PORT ?? 4613);

/**
 * Browser tests for the Student Web.
 *
 * The app runs as a real production build. Every API call the browser makes
 * goes through `/api/proxy/*`, and the tests answer those with the exact
 * response shapes of the backend they target (see `e2e/support/library-api.ts`)
 * — no real backend, no real accounts, no purchases anywhere. A small local
 * server stands in for the media gate so the PDF reader loads a real document
 * from a signed-looking URL (`e2e/support/media-server.mjs`).
 *
 * `npm run test:e2e` needs nothing running beforehand.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/support/media-server.mjs',
      port: MEDIA_PORT,
      reuseExistingServer: false,
      env: { MEDIA_PORT: String(MEDIA_PORT) },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npm run build && npx next start --port ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        // Never reached: the browser's API calls are answered by the tests'
        // route handlers before they leave the page. `.invalid` cannot
        // resolve, so a server-side call would fail loudly rather than reach
        // anything — and it passes the build's no-localhost-in-production
        // guard without weakening it.
        API_BASE_URL: 'https://backend.invalid/api/v1',
        API_TIMEOUT_MS: '20000',
        SECURE_COOKIES: 'false',
        NODE_ENV: 'production',
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
