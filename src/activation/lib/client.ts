'use client';

import { createApiClient } from '@/lib/api-client';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';

import { ACTIVATION_API_ROOT } from './routes';

/**
 * The portal's API client.
 *
 * Same request and error handling as the learning website's client, bound to
 * the portal's own proxy — which carries the portal session and forwards only
 * the allow-listed catalogue, activation, library and wallet routes
 * (`proxy-allowlist.ts`).
 */
export const activationApi = createApiClient(`${ACTIVATION_API_ROOT}/proxy`);

/** A state-changing call to one of the portal's own auth routes. */
export function activationAuthFetch(route: 'login' | 'logout', body?: unknown): Promise<Response> {
  return fetch(`${ACTIVATION_API_ROOT}/auth/${route}`, {
    method: 'POST',
    headers: {
      [WEB_REQUEST_HEADER]: '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
