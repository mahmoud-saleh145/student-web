// Runs the activation portal against the stand-in backend, for local work and
// for the portal's browser tests:
//
//   node e2e/support/activation-dev.mjs
//
// then open http://127.0.0.1:4711/activate. Fixture students are listed in
// `activation-backend.mjs`. Nothing here can reach a real backend: the app is
// pointed at the stand-in on 127.0.0.1 and nowhere else.
//
// `next dev` rather than a production build, because the app refuses a
// localhost API_BASE_URL in production (`lib/config.ts`) — a guard worth
// keeping intact rather than working around.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_PORT = process.env.ACTIVATION_APP_PORT ?? '4711';
const BACKEND_PORT = process.env.ACTIVATION_BACKEND_PORT ?? '4712';

const env = {
  ...process.env,
  NODE_ENV: 'development',
  API_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}/api/v1`,
  // Set explicitly: an inherited value above the app's 120 s ceiling would
  // stop it at start-up.
  API_TIMEOUT_MS: '20000',
  SECURE_COOKIES: 'false',
  ACTIVATION_BACKEND_PORT: BACKEND_PORT,
  NEXT_TELEMETRY_DISABLED: '1',
};

const children = [
  spawn(process.execPath, [join(root, 'e2e', 'support', 'activation-backend.mjs')], { env, cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', root, '--port', APP_PORT, '--hostname', '127.0.0.1'], {
    env,
    // Tailwind scans for class names from the working directory, so the app
    // must be started from its own root wherever this script is launched.
    cwd: root,
    stdio: 'inherit',
  }),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => (code ? process.exit(code) : undefined));
