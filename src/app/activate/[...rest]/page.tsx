'use client';

import Link from 'next/link';

import { activationRoutes } from '@/activation/lib/routes';
import { useActivationT } from '@/activation/use-t';

/**
 * An address under `/activate` that is not a portal page.
 *
 * Handled here rather than by the site-wide not-found page, whose "Go home"
 * leads to the learning website. A wrong portal address leads back to the
 * portal.
 */
export default function ActivationNotFound() {
  const { t } = useActivationT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-8 text-center">
      <h1 className="text-xl font-bold">{t('act.notFound.title')}</h1>
      <Link
        href={activationRoutes.home}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg transition hover:brightness-110"
      >
        {t('act.notFound.home')}
      </Link>
    </div>
  );
}
