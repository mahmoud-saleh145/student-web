// Runs the activation portal against a REAL backend that is already running
// on this machine (see `backend-env.sh` and `seed.cjs`):
//
//   . e2e/activation-real/backend-env.sh
//   node e2e/activation-real/dev.mjs
//
// It refuses any backend address that is not on this machine. Pointing the
// portal's tests at a hosted backend would mean signing in with, and spending
// the cards of, whatever is in that backend's database.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_PORT = process.env.ACTIVATION_REAL_APP_PORT ?? '4731';
const BACKEND_URL = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');

let host = '';
try {
  host = new URL(BACKEND_URL).hostname;
} catch {
  // Reported below.
}
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`BACKEND_URL must be a backend on this machine; got "${BACKEND_URL}".`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', root, '--port', APP_PORT, '--hostname', '127.0.0.1'],
  {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_BASE_URL: BACKEND_URL,
      API_TIMEOUT_MS: '20000',
      SECURE_COOKIES: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
      // The backend's own PORT must not become the app's.
      PORT: APP_PORT,
    },
    // Tailwind scans for class names from the working directory.
    cwd: root,
    stdio: 'inherit',
  },
);

const stop = () => {
  child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
