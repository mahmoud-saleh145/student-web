'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { ApiError } from '@/lib/api-client';
import { endsSession } from '@/lib/error-messages';
import { useLanguageStore } from '@/store/stores';

import { activationApi, activationAuthFetch } from './lib/client';
import { ACTIVATION_LOGIN, isActivationPublicPage } from './lib/routes';

/**
 * The portal's session, query cache and sign-out — its own, not the learning
 * website's.
 *
 * The root layout still mounts the learning website's providers around every
 * page (one `<html>`, one font and theme bootstrap for the deployment), but
 * nothing below `/activate` reads them for identity or data:
 *
 *   - identity comes from the portal's cookies, through `auth/me` on the
 *     portal's proxy;
 *   - data lives in this QueryClient, so a portal answer is never found in the
 *     learning website's cache or the other way round;
 *   - a session that the server has ended returns the student to
 *     `/activate/login`, never to `/login`.
 */

export interface ActivationUser {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
}

interface ActivationSessionValue {
  user: ActivationUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ActivationSessionContext = React.createContext<ActivationSessionValue>({
  user: null,
  status: 'loading',
  refresh: async () => {},
  signOut: async () => {},
});

export function useActivationSession(): ActivationSessionValue {
  return React.useContext(ActivationSessionContext);
}

let ending = false;

/**
 * Ends a portal session the server has already ended, and returns to the
 * portal's own sign-in with the reason. A full navigation, so nothing cached
 * for the ended session survives into the next one.
 */
export function endActivationSessionIfNeeded(error: unknown): void {
  if (!(error instanceof ApiError) || !endsSession(error)) return;
  if (ending || typeof window === 'undefined') return;
  if (isActivationPublicPage(window.location.pathname)) return;
  ending = true;

  const reason = error.code === 'UNAUTHORIZED' ? 'SESSION_EXPIRED' : error.code;
  const next = `${window.location.pathname}${window.location.search}`;
  const target = `${ACTIVATION_LOGIN}?reason=${encodeURIComponent(reason)}&next=${encodeURIComponent(next)}`;

  void activationAuthFetch('logout')
    .catch(() => undefined)
    .finally(() => window.location.replace(target));
}

function createActivationQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: endActivationSessionIfNeeded }),
    mutationCache: new MutationCache({ onError: endActivationSessionIfNeeded }),
    defaultOptions: {
      queries: {
        // Ownership is the whole point of this portal, so answers go stale
        // quickly and are re-read when the student comes back to the tab.
        staleTime: 15_000,
        retry: (count, err) => {
          const status = (err as { status?: number })?.status ?? 0;
          if (status >= 400 && status < 500) return false;
          return count < 1;
        },
        refetchOnWindowFocus: true,
      },
      // Never retried: a redemption or a purchase must not be sent twice.
      mutations: { retry: false },
    },
  });
}

/** Content comes back in the language it was asked for; a change refetches it. */
function ActivationLanguageSync() {
  const language = useLanguageStore((s) => s.language);
  const queryClient = useQueryClient();
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void queryClient.invalidateQueries();
  }, [language, queryClient]);
  return null;
}

function toUser(value: ActivationUser): ActivationUser {
  return {
    id: value.id,
    fullName: value.fullName,
    phone: value.phone,
    role: value.role,
    status: value.status,
    avatarUrl: value.avatarUrl ?? null,
  };
}

function ActivationSessionProvider({
  initialUser,
  children,
}: {
  initialUser: ActivationUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<ActivationUser | null>(initialUser);
  const [status, setStatus] = React.useState<ActivationSessionValue['status']>(
    initialUser ? 'authenticated' : 'loading'
  );

  const refresh = React.useCallback(async () => {
    try {
      const fresh = await activationApi.get<ActivationUser>('auth/me');
      setUser(toUser(fresh));
      setStatus('authenticated');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setStatus('unauthenticated');
        endActivationSessionIfNeeded(e);
        return;
      }
      endActivationSessionIfNeeded(e);
      // A transport failure says nothing about the session: keep what we have.
      setStatus((prev) => (prev === 'loading' ? (initialUser ? 'authenticated' : 'unauthenticated') : prev));
    }
  }, [initialUser]);

  React.useEffect(() => {
    void refresh();
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = React.useCallback(async () => {
    try {
      await activationAuthFetch('logout');
    } catch {
      // best-effort
    }
    setUser(null);
    setStatus('unauthenticated');
    window.location.href = ACTIVATION_LOGIN;
  }, []);

  const value = React.useMemo(() => ({ user, status, refresh, signOut }), [user, status, refresh, signOut]);

  return <ActivationSessionContext.Provider value={value}>{children}</ActivationSessionContext.Provider>;
}

export function ActivationProviders({
  initialUser,
  children,
}: {
  initialUser: ActivationUser | null;
  children: React.ReactNode;
}) {
  const [queryClient] = React.useState(createActivationQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ActivationLanguageSync />
      <ActivationSessionProvider initialUser={initialUser}>{children}</ActivationSessionProvider>
    </QueryClientProvider>
  );
}
