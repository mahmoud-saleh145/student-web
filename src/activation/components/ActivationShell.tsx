'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { Avatar } from '@/components/ui/core';
import { BookIcon, GridIcon, HomeIcon, LayersIcon, MoonIcon, SunIcon, WalletIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useLanguageStore, useThemeStore } from '@/store/stores';

import { activationRoutes } from '../lib/routes';
import { useActivationSession } from '../session';
import { useActivationT } from '../use-t';

/**
 * The portal's frame: its own header, its own navigation, its own footer.
 *
 * Built from the platform's brand mark, colours, type and controls so it is
 * recognisably Student Center — but every link in it stays inside `/activate`.
 * There is no search of lessons, no notifications, no "continue learning", and
 * no route to the player or the reader: the navigation is the portal's five
 * destinations and nothing else.
 *
 * Mobile first: the destinations sit in a bottom bar within thumb reach, the
 * way the app's tabs do, and move into the header from `lg` up.
 */

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Shown in the bottom bar only (the logo is "home" in the header). */
  mobileOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: activationRoutes.home, labelKey: 'act.nav.home', icon: HomeIcon, mobileOnly: true },
  { href: activationRoutes.courses, labelKey: 'tabs.courses', icon: GridIcon },
  { href: activationRoutes.library, labelKey: 'library.title', icon: BookIcon },
  { href: activationRoutes.myActivations, labelKey: 'act.nav.activations', icon: LayersIcon },
  { href: activationRoutes.wallet, labelKey: 'wallet.title', icon: WalletIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === activationRoutes.home) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ActivationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useActivationT();
  const { user } = useActivationSession();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const themePreference = useThemeStore((s) => s.preference);
  const setThemePreference = useThemeStore((s) => s.setPreference);

  const toggleTheme = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    setThemePreference(dark ? 'light' : 'dark');
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 sm:px-6">
          <Link href={activationRoutes.home} className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1">
            <BrandLogo height={30} priority />
            <span className="hidden truncate rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-ink sm:inline">
              {t('act.portalName')}
            </span>
          </Link>

          <nav className="ms-3 hidden items-center gap-0.5 lg:flex" aria-label={t('act.portalName')}>
            {NAV.filter((item) => !item.mobileOnly).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                  isActive(pathname, item.href)
                    ? 'bg-primary-soft text-primary-ink'
                    : 'text-muted hover:bg-surface-alt hover:text-foreground',
                )}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            aria-label={t('nav.language')}
            title={t('nav.language')}
            className="h-9 cursor-pointer rounded-lg px-2 text-[13px] font-bold text-muted transition hover:bg-surface-alt hover:text-foreground"
          >
            {language === 'ar' ? 'EN' : 'ع'}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('settings.theme')}
            title={t('settings.theme')}
            data-theme-preference={themePreference}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-surface-alt hover:text-foreground"
          >
            <SunIcon size={18} className="hidden [[data-theme=dark]_&]:block" />
            <MoonIcon size={18} className="block [[data-theme=dark]_&]:hidden" />
          </button>

          {user ? (
            <Link
              href={activationRoutes.account}
              aria-label={t('act.nav.account')}
              title={user.fullName}
              className={cn(
                'flex items-center rounded-full p-0.5 transition hover:bg-surface-alt',
                isActive(pathname, activationRoutes.account) && 'ring-2 ring-primary',
              )}
            >
              <Avatar name={user.fullName} uri={user.avatarUrl} size={32} />
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:pb-10">{children}</main>

      <footer className="hidden border-t border-border bg-surface lg:block">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-6 py-6">
          <p className="text-xs font-medium text-muted">{t('act.footer.note')}</p>
          <p className="text-xs text-subtle">{t('web.footerRights')}</p>
        </div>
      </footer>

      <nav
        aria-label={t('act.portalName')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-[600px] grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1 px-1 py-2 text-[10.5px] font-semibold transition-colors',
                  active ? 'text-primary-ink' : 'text-muted',
                )}
              >
                <span className={cn('grid h-7 w-12 place-items-center rounded-full', active && 'bg-primary-soft')}>
                  <Icon size={19} />
                </span>
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
