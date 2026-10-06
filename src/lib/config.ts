import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

export const configSchema = z.object({
  apiBaseUrl: z.string().url('API_BASE_URL must be a valid absolute URL'),
  apiTimeoutMs: z.coerce.number().int().positive().max(120_000).default(20_000),
  secureCookies: boolish,
  appOrigin: z.string().url().optional(),
  platformTimezone: z.string().default('Africa/Cairo'),
  appVersion: z.string().default('1.0.0'),
});

export type ServerConfig = z.infer<typeof configSchema>;

export function parseConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProd = env.NODE_ENV === 'production';
  const rawApiBaseUrl = env.API_BASE_URL?.trim();

  if (isProd) {
    if (!rawApiBaseUrl) {
      throw new Error(
        'Invalid environment configuration: API_BASE_URL is required in production and must not default to localhost.'
      );
    }
    try {
      const parsed = new URL(rawApiBaseUrl);
      if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(parsed.hostname.toLowerCase())) {
        throw new Error(
          `Invalid environment configuration: API_BASE_URL points to localhost (${rawApiBaseUrl}) in production.`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('API_BASE_URL')) {
        throw err;
      }
      throw new Error(`Invalid environment configuration: API_BASE_URL must be a valid URL (${rawApiBaseUrl}).`);
    }
  }

  const raw = {
    apiBaseUrl: rawApiBaseUrl || (isProd ? undefined : 'http://localhost:3000/api/v1'),
    apiTimeoutMs: env.API_TIMEOUT_MS ?? '20000',
    secureCookies: env.SECURE_COOKIES ?? (isProd ? 'true' : 'false'),
    appOrigin: env.APP_ORIGIN || undefined,
    platformTimezone: env.PLATFORM_TIMEZONE ?? 'Africa/Cairo',
    appVersion: env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0',
  };

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration.\n${issues}`);
  }

  return parsed.data;
}

export const serverConfig = parseConfig();

export { cookieNames } from './cookie-names.ts';
