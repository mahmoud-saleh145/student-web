import type { Metadata } from 'next';

import { getActivationProfile } from '@/activation/server/session';
import { ActivationProviders } from '@/activation/session';

/**
 * The activation portal's own layout.
 *
 * Everything under `/activate` renders inside this: the portal's session, the
 * portal's query cache, and (one level down, in `(portal)/layout.tsx`) the
 * portal's navigation. The root layout above contributes only what is common
 * to the whole deployment — `<html>`, the fonts, the stylesheet, the
 * before-paint theme and direction script.
 *
 * The initial user comes from the portal's own profile cookie. The learning
 * website's cookies are not read here.
 */
export const metadata: Metadata = {
  title: 'Student Center — Activation',
  description: 'Activate Student Center courses and library materials.',
  // An account-only tool: nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

export default async function ActivationLayout({ children }: { children: React.ReactNode }) {
  const user = await getActivationProfile();
  return <ActivationProviders initialUser={user}>{children}</ActivationProviders>;
}
