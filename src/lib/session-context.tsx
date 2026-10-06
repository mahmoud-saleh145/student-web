'use client';

import * as React from 'react';

import { translate, type Language } from '@/i18n/dictionaries';
import { ApiError, api } from '@/lib/api-client';
import { endSessionIfNeeded } from '@/lib/session-end';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';
import { useLanguageStore } from '@/store/stores';

interface SessionUser {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
}

interface SessionContextValue {
  user: SessionUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue>({
  user: null,
  status: 'loading',
  refresh: async () => {},
  signOut: async () => {},
});

export function useSession() {
  return React.useContext(SessionContext);
}

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<SessionUser | null>(initialUser);
  const [status, setStatus] = React.useState<SessionContextValue['status']>(
    initialUser ? 'authenticated' : 'loading'
  );

  /**
   * Re-reads the signed-in user from the backend (`/auth/me`), as the mobile
   * app does on launch and after a profile change. Reading it through the
   * proxy also rewrites the profile cookie, so the next server render agrees.
   */
  const refresh = React.useCallback(async () => {
    try {
      const fresh = await api.get<SessionUser>('auth/me');
      setUser({
        id: fresh.id,
        fullName: fresh.fullName,
        phone: fresh.phone,
        role: fresh.role,
        status: fresh.status,
        avatarUrl: fresh.avatarUrl ?? null,
      });
      setStatus('authenticated');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setStatus('unauthenticated');
        endSessionIfNeeded(e);
        return;
      }
      endSessionIfNeeded(e);
      // A transport failure says nothing about the session: keep what we have.
      setStatus((prev) => (prev === 'loading' ? (initialUser ? 'authenticated' : 'unauthenticated') : prev));
    }
  }, [initialUser]);

  React.useEffect(() => {
    void refresh();
    // Once per page load — the mobile app's bootstrap `me()`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = React.useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { [WEB_REQUEST_HEADER]: '1' },
        credentials: 'same-origin',
      });
    } catch {
      // best-effort
    }
    setUser(null);
    setStatus('unauthenticated');
    window.location.href = '/login';
  }, []);

  const value = React.useMemo(
    () => ({ user, status, refresh, signOut }),
    [user, status, refresh, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useTranslation() {
  const language = useLanguageStore((s) => s.language);
  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language]
  );
  return { t, language: language as Language };
}
