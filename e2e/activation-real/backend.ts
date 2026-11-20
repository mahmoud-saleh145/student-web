import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Direct lines to the real backend under test: its HTTP API (as a phone, or as
 * an administrator), its database, and its Redis.
 *
 * The portal is always driven through the browser. These exist to check what
 * the backend actually holds afterwards — a card's status, a device row, a
 * session — instead of trusting what a page says.
 *
 * Every address must be on this machine; the database name must end in
 * `_test`. The same guards as `seed.cjs`.
 */

const LOCAL = new Set(['127.0.0.1', 'localhost']);

function local(name: string): string {
  const value = process.env[name] ?? '';
  let host = '';
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error(`${name} is not set. Source e2e/activation-real/backend-env.sh first.`);
  }
  if (!LOCAL.has(host)) throw new Error(`Refusing to run: ${name} points at "${host}", not this machine.`);
  return value;
}

export const BACKEND_URL = local('BACKEND_URL').replace(/\/$/, '');
const DATABASE_URL = local('DATABASE_URL');
const REDIS_URL = local('REDIS_URL');
if (!new URL(DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error('Refusing to run: the database name must end in "_test".');
}
const BACKEND_DIR = process.env.BACKEND_DIR;
if (!BACKEND_DIR) throw new Error('BACKEND_DIR is not set.');

// The same two refusals as `seed.cjs`: never the default Redis port (this
// file flushes that Redis), never a backend checkout with a `.env` beside it.
const redisPort = new URL(REDIS_URL).port;
if (redisPort === '' || redisPort === '6379') {
  throw new Error('Refusing to run: REDIS_URL uses the default Redis port. Use the dedicated throwaway instance.');
}
for (const name of ['.env', '.env.local']) {
  if (fs.existsSync(path.join(path.resolve(BACKEND_DIR), name))) {
    throw new Error(`Refusing to run: ${BACKEND_DIR} contains ${name}, so its backend may not be using the throwaway database.`);
  }
}

const backendRequire = createRequire(path.join(path.resolve(BACKEND_DIR), 'package.json'));

export interface Fixtures {
  password: string;
  admin: { id: string; phone: string };
  teacher: { id: string; phone: string; name: string };
  teacherTwo: { id: string; name: string };
  student: { id: string; phone: string; firstName: string };
  peer: { id: string; phone: string };
  outsider: { id: string; phone: string };
  disabled: { id: string; phone: string };
  courses: Record<
    'mechanics' | 'chemistry' | 'physics' | 'maths' | 'free' | 'programsOnly' | 'draft',
    { id: string; title: string; sections: { id: string; title: string; lessonId: string }[] }
  >;
  parts: { part1: { id: string; title: string }; part2: { id: string; title: string } };
  library: {
    material: { id: string; title: string };
    sample: { id: string; title: string };
    cheap: { id: string; title: string; price: number };
    dear: { id: string; title: string; price: number };
    programsMaterial: { id: string; title: string };
  };
  codes: {
    part1: string[];
    part2: string;
    sectionStatics: string;
    sectionRevision: string;
    chemistryFull: string;
    chemistryExpired: string;
    chemistryRevoked: string;
    chemistryUsed: string;
    chemistrySpare: string;
    teacherTwo: string;
    throwaway: string;
    recharge100: string[];
    recharge50: string;
  };
}

const FIXTURES_PATH =
  process.env.ACTIVATION_REAL_FIXTURES ?? path.join(__dirname, '.fixtures.json');

export const fx = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as Fixtures;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

let client: Db | null = null;

/** The backend's own Prisma client, on the backend's own schema. */
export function db(): Db {
  if (!client) {
    const { PrismaClient } = backendRequire('@prisma/client');
    client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) await client.$disconnect();
  client = null;
}

/**
 * Clears the backend's rate-limit counters.
 *
 * The story in `portal.real.ts` presents more cards in a few minutes than the
 * backend allows one student (ten attempts per five minutes, per route). The
 * limit is real and has its own test; between the other groups the counters
 * are reset so that test order does not decide which assertion a 429 lands on.
 */
export async function resetRateLimits(): Promise<void> {
  const Redis = backendRequire('ioredis');
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
  await redis.flushdb();
  await redis.quit();
}

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  code: string | null;
  data: T;
}

/** A plain call to the backend's API, the way a client other than the portal makes one. */
export async function backend<T = Record<string, unknown>>(
  method: 'GET' | 'POST',
  route: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${BACKEND_URL}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; code?: string; error?: { code?: string } };
  return {
    status: res.status,
    code: json.code ?? json.error?.code ?? null,
    data: (json.data ?? json) as T,
  };
}

/** The headers the mobile app sends: this is what makes a sign-in a device. */
export const PHONE_HEADERS = { 'X-Device-Id': 'fixture-phone-0001', 'X-Device-Platform': 'android' };

export interface PhoneSession {
  accessToken: string;
  refreshToken: string;
}

/** Signs the fixture student in as their phone would. */
export async function phoneSignIn(phone: string): Promise<PhoneSession> {
  const res = await backend<PhoneSession>('POST', '/auth/login', {
    body: { phone, password: fx.password },
    headers: PHONE_HEADERS,
  });
  if (res.status !== 200) throw new Error(`phone sign-in failed: ${res.status} ${res.code}`);
  return { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken };
}

/** What the backend holds about a card. */
export async function card(code: string): Promise<{ status: string; redemptionCount: number }> {
  return db().accessCode.findUniqueOrThrow({ where: { code }, select: { status: true, redemptionCount: true } });
}
