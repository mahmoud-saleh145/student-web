import { defineConfig, devices } from '@playwright/test';

const APP_PORT = Number(process.env.ACTIVATION_APP_PORT ?? 4811);
const BACKEND_PORT = Number(process.env.ACTIVATION_BACKEND_PORT ?? 4812);

/**
 * Browser tests for the activation portal (`/activate`).
 *
 *   npx playwright test -c playwright.activation.config.ts
 *
 * Unlike `playwright.config.ts`, which answers the browser's API calls inside
 * the page, these run the portal's real route handlers — sign-in, the
 * allow-listed proxy, token refresh, CSRF checks — against a stand-in backend
 * (`e2e/support/activation-backend.mjs`) that keeps state and records what it
 * was asked. That is the only way to assert the things that matter most here:
 * that sign-in sends no device identity, and that no protected-content route
 * is ever reached.
 *
 * No real backend, account, card or balance is involved, and nothing needs to
 * be running beforehand. The spec files end in `.activation.ts` so the main
 * suite's `*.spec.ts` matcher does not pick them up.
 */
export default defineConfig({
  testDir: './e2e/activation',
  testMatch: /.*\.activation\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/support/activation-dev.mjs',
      port: APP_PORT,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ACTIVATION_APP_PORT: String(APP_PORT),
        ACTIVATION_BACKEND_PORT: String(BACKEND_PORT),
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
