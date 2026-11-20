'use client';

import Link from 'next/link';
import * as React from 'react';

import { useActivationWallet } from '@/activation/api';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationSession } from '@/activation/session';
import { useActivationT } from '@/activation/use-t';
import { Card, Skeleton } from '@/components/ui/core';
import { BookIcon, ChevronRightIcon, GridIcon, LayersIcon, UserIcon, WalletIcon } from '@/components/ui/icons';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Destination {
  href: string;
  titleKey: string;
  bodyKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  primary?: boolean;
}

const DESTINATIONS: Destination[] = [
  { href: activationRoutes.courses, titleKey: 'tabs.courses', bodyKey: 'act.home.courses.body', icon: GridIcon, primary: true },
  { href: activationRoutes.library, titleKey: 'library.title', bodyKey: 'act.home.library.body', icon: BookIcon },
  { href: activationRoutes.myActivations, titleKey: 'act.nav.activations', bodyKey: 'act.home.activations.body', icon: LayersIcon },
  { href: activationRoutes.wallet, titleKey: 'wallet.title', bodyKey: 'act.home.wallet.body', icon: WalletIcon },
  { href: activationRoutes.account, titleKey: 'act.nav.account', bodyKey: 'act.home.account.body', icon: UserIcon },
];

const STEPS = ['step1', 'step2', 'step3'] as const;

/**
 * The portal's front door: where to go, and what the portal is for.
 *
 * It is not the learning website's home. There is no feed, no "continue
 * watching" and no recommendations — only the five things a student comes
 * here to do, and the three-step explanation of how an activation reaches the
 * app.
 */
export default function ActivationHomePage() {
  const { t, language } = useActivationT();
  const { user } = useActivationSession();
  const wallet = useActivationWallet();
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{t('act.home.greeting', { name: firstName })}</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{t('act.home.subtitle')}</p>
      </header>

      <nav aria-label={t('act.portalName')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map((item) => {
          const Icon = item.icon;
          const isWallet = item.href === activationRoutes.wallet;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3.5 rounded-xl border bg-surface p-4 transition hover:border-border-strong hover:shadow-md',
                item.primary ? 'border-primary-border' : 'border-border',
              )}
            >
              <span
                className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-lg',
                  item.primary ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary-ink',
                )}
              >
                <Icon size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{t(item.titleKey)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                  {isWallet && wallet.data ? (
                    <>
                      {t('act.home.balance')}:{' '}
                      <span className="font-bold text-foreground" data-testid="home-balance">
                        {formatMoney({ amount: wallet.data.balance, currency: wallet.data.currency }, language)}
                      </span>
                    </>
                  ) : isWallet && wallet.isLoading ? (
                    <Skeleton className="mt-1 h-4 w-28" />
                  ) : (
                    t(item.bodyKey)
                  )}
                </span>
              </span>
              <ChevronRightIcon
                size={17}
                className="shrink-0 text-subtle transition group-hover:text-foreground"
              />
            </Link>
          );
        })}
      </nav>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-[17px] font-bold tracking-tight">
          {t('act.home.howTitle')}
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step}>
              <Card className="h-full">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-fg">
                  {new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US').format(index + 1)}
                </span>
                <h3 className="mt-3 text-sm font-bold">{t(`act.home.${step}.title`)}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{t(`act.home.${step}.body`)}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
