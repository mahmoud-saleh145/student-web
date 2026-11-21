import { defineConfig } from '@playwright/test';

const APP_PORT = Number(process.env.PLAYBACK_APP_PORT ?? 4721);

/**
 * Real-browser checks for the web playback session (lib/playback-session.ts).
 *
 *   npm run build            (with or without NEXT_PUBLIC_PLAYBACK_SESSION_MODE)
 *   npx playwright test -c playwright.playback.config.ts
 *
 * Runs the production build in the locally installed Google Chrome, because
 * Playwright's bundled Chromium ships without a Widevine CDM. Every API call is
 * answered inside the page (no backend, no account). Video and licences come
 * from Google's PUBLIC Shaka demo assets and Widevine test proxy - never from
 * Gumlet, R2 or a real lecture.
 *
 * The flag is build-time: `PLAYBACK_EXPECT_MODE=legacy|session` tells the spec
 * which build it is looking at. Spec files end in `.playback.ts`, so the main
 * suite does not pick them up.
 */
export default defineConfig({
  testDir: './e2e/playback',
  testMatch: /.*\.playback\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 150_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    channel: 'chrome',
    // Chrome on Windows installs the Widevine CDM as a component; Playwright's
    // default `--disable-component-update` would leave the browser with no
    // Widevine at all (KS_NONE). The spec waits until Widevine is available.
    launchOptions: { ignoreDefaultArgs: ['--disable-component-update'] },
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chrome' }],
  webServer: [
    {
      command: `npx next start --port ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
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
