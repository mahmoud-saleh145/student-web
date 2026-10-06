'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { Avatar } from '@/components/ui/core';
import {
  AlertIcon,
  ArrowRightIcon,
  BellIcon,
  BookIcon,
  ChevronRightIcon,
  CloseIcon,
  GridIcon,
  HomeIcon,
  LayersIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
  WalletIcon,
} from '@/components/ui/icons';
import { dictionaries } from '@/i18n/dictionaries';
import { ApiError } from '@/lib/api-client';
import { errorMessageKey } from '@/lib/error-messages';
import { useSession, useTranslation } from '@/lib/session-context';
import { useLanguageStore, useThemeStore, type ThemePreference } from '@/store/stores';
import { cn } from '@/lib/utils';

export function InlineError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const message = toUserMessage(error, t);
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
      <AlertIcon size={18} className="mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

const hasDictKey = (key: string): boolean => key in dictionaries.en;

/**
 * A translated sentence for any failure. Never the backend's raw `message`:
 * that is English developer text, and mobile never shows it either.
 */
export function toUserMessage(error: unknown, t: (k: string) => string): string {
  if (error instanceof ApiError) return t(errorMessageKey(error.code, error.status, hasDictKey));
  return t('errors.genericBody');
}

export function ErrorState({
  error,
  onRetry,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-8 text-center',
        compact ? 'py-8' : 'py-16'
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertIcon size={24} />
      </span>
      <h3 className="mt-4 text-[15px] font-bold">{t('errors.title')}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{toUserMessage(error, t)}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-5 h-9 cursor-pointer rounded-lg border border-border-strong bg-surface px-4 text-[13px] font-semibold transition hover:bg-surface-alt"
        >
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  compact,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 px-8 text-center',
        compact ? 'py-8' : 'py-16'
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-alt text-subtle">
        <BookIcon size={22} />
      </span>
      <h3 className="mt-3.5 text-[15px] font-bold">{title}</h3>
      {body ? <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p> : null}
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className="mt-5 h-9 cursor-pointer rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-fg transition hover:brightness-110"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/home', labelKey: 'tabs.home', icon: HomeIcon },
  { href: '/courses', labelKey: 'tabs.courses', icon: GridIcon },
  { href: '/my-courses', labelKey: 'tabs.myCourses', icon: LayersIcon },
  { href: '/library', labelKey: 'library.title', icon: BookIcon },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/wallet', labelKey: 'wallet.title', icon: WalletIcon },
  { href: '/notifications', labelKey: 'tabs.notifications', icon: BellIcon },
  { href: '/support', labelKey: 'support.title', icon: LifeBuoyIcon },
  { href: '/settings', labelKey: 'settings.title', icon: SettingsIcon },
];

const ACCOUNT_NAV: NavItem[] = [
  { href: '/profile', labelKey: 'tabs.profile', icon: UserIcon },
  { href: '/profile/edit', labelKey: 'profile.editProfile', icon: PencilIcon },
  { href: '/my-courses', labelKey: 'tabs.myCourses', icon: LayersIcon },
  { href: '/wallet', labelKey: 'wallet.title', icon: WalletIcon },
  { href: '/settings', labelKey: 'settings.title', icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useDismiss(open: boolean, close: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
}

function ThemeSwitch() {
  const { t } = useTranslation();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const options: { value: ThemePreference; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <SunIcon size={16} />, label: t('settings.themeLight') },
    { value: 'dark', icon: <MoonIcon size={16} />, label: t('settings.themeDark') },
    { value: 'system', icon: <MonitorIcon size={16} />, label: t('settings.themeSystem') },
  ];
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('settings.theme')}</p>
      <div className="grid grid-cols-3 gap-1 px-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => setPreference(o.value)}
            title={o.label}
            aria-label={o.label}
            aria-pressed={preference === o.value}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] font-semibold transition',
              preference === o.value
                ? 'border-primary bg-primary-soft text-primary-ink'
                : 'border-transparent text-muted hover:bg-surface-alt'
            )}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavLinkRow({ item, onNavigate, badge }: { item: NavItem; onNavigate?: () => void; badge?: number }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
        active ? 'bg-primary-soft text-primary-ink' : 'text-muted hover:bg-surface-alt hover:text-foreground'
      )}
    >
      <Icon size={17} />
      <span className="flex-1 truncate">{t(item.labelKey)}</span>
      {badge && badge > 0 ? (
        <span className="rounded-full bg-danger px-1.5 py-px text-[10px] font-bold text-white">{badge}</span>
      ) : null}
    </Link>
  );
}

function AccountMenu({ unread }: { unread?: number }) {
  const { t } = useTranslation();
  const { user, signOut } = useSession();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false));

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg p-0.5 transition hover:bg-surface-alt"
      >
        <Avatar name={user.fullName} uri={user.avatarUrl} size={32} />
        <ChevronRightIcon size={14} className={cn('text-subtle transition-transform', open && 'rotate-90')} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-bold">{user.fullName}</p>
            <p className="mt-0.5 truncate text-xs text-muted" dir="ltr">
              {user.phone}
            </p>
          </div>
          <div className="p-2">
            {ACCOUNT_NAV.map((item) => (
              <NavLinkRow
              key={item.href + item.labelKey}
              item={item}
              onNavigate={() => setOpen(false)}
              badge={item.href === '/notifications' ? unread : undefined}
            />
            ))}
          </div>
          <div className="border-t border-border p-2">
            <button
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-danger transition hover:bg-danger/10"
            >
              <LogOutIcon size={17} />
              {t('auth.logout')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileDrawer({ open, onClose, unread }: { open: boolean; onClose: () => void; unread?: number }) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const closedOffset = language === 'ar' ? 'translate-x-full' : '-translate-x-full';

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className={cn('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn('absolute inset-0 bg-black/45 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menu')}
        className={cn(
          'absolute inset-y-0 start-0 flex w-[86%] max-w-sm flex-col border-e border-border bg-surface transition-transform duration-200',
          open ? 'translate-x-0' : closedOffset
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="flex items-center gap-2">
            <BrandLogo height={30} />
          </span>
          <button onClick={onClose} aria-label={t('common.close')} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-alt">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('nav.browse')}</p>
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => (
              <NavLinkRow key={item.href} item={item} onNavigate={onClose} />
            ))}
            <NavLinkRow item={{ href: '/search', labelKey: 'tabs.search', icon: SearchIcon }} onNavigate={onClose} />
          </div>

          <p className="mb-1.5 mt-5 px-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('nav.account')}</p>
          <div className="space-y-0.5">
            {SECONDARY_NAV.map((item) => (
              <NavLinkRow
                key={item.href}
                item={item}
                onNavigate={onClose}
                badge={item.href === '/notifications' ? unread : undefined}
              />
            ))}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <ThemeSwitch />
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border p-3">
          <button
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border-strong text-[13px] font-semibold transition hover:bg-surface-alt"
          >
            {language === 'ar' ? 'English' : 'العربية'}
          </button>
          <button
            onClick={() => {
              onClose();
              void signOut();
            }}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-danger text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <LogOutIcon size={17} />
            {t('auth.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, unread }: { children: React.ReactNode; unread?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useSession();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const [drawer, setDrawer] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const count = unread ?? 0;

  React.useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2 px-4 sm:px-6">
          <button
            onClick={() => setDrawer(true)}
            aria-label={t('nav.menu')}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-surface-alt hover:text-foreground lg:hidden"
          >
            <MenuIcon size={20} />
          </button>

          <Link href="/home" className="flex items-center gap-2 rounded-lg px-1 py-1">
            <BrandLogo height={30} />
          </Link>

          <nav className="ms-3 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                    active ? 'bg-primary-soft text-primary-ink' : 'text-muted hover:bg-surface-alt hover:text-foreground'
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <form onSubmit={submitSearch} className="relative hidden w-56 xl:block">
            <SearchIcon size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              aria-label={t('common.search')}
              className="h-9 w-full rounded-lg border border-border bg-background ps-9 pe-3 text-[13px] outline-none transition placeholder:text-subtle focus:border-primary"
            />
          </form>

          <button
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            aria-label={t('nav.language')}
            title={t('nav.language')}
            className="h-9 cursor-pointer rounded-lg px-2 text-[13px] font-bold text-muted transition hover:bg-surface-alt hover:text-foreground"
          >
            {language === 'ar' ? 'EN' : 'ع'}
          </button>

          <Link
            href="/notifications"
            aria-label={t('tabs.notifications')}
            title={t('tabs.notifications')}
            className="relative hidden h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-alt hover:text-foreground sm:grid"
          >
            <BellIcon size={19} />
            {count > 0 ? (
              <span className="absolute end-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </Link>

          {user ? <AccountMenu unread={unread} /> : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mt-auto border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted">{t('web.footerRights')}</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/settings/about" className="text-xs font-medium text-muted transition hover:text-foreground">
              {t('settings.about.title')}
            </Link>
            <Link href="/support" className="text-xs font-medium text-muted transition hover:text-foreground">
              {t('support.title')}
            </Link>
            <Link href="/settings" className="text-xs font-medium text-muted transition hover:text-foreground">
              {t('settings.title')}
            </Link>
          </nav>
        </div>
      </footer>

      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} unread={unread} />
    </div>
  );
}

export interface Crumb {
  href?: string;
  label: string;
}

export function FocusShell({
  title,
  backHref = '/home',
  toolbar,
  children,
}: {
  title: string;
  backHref?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t, language } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link
            href={backHref}
            aria-label={t('common.back')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-alt hover:text-foreground"
          >
            <ArrowRightIcon size={18} className={language === 'en' ? 'rotate-180' : undefined} />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{title}</span>
          {toolbar}
          <Link href="/home" className="flex shrink-0 items-center gap-2">
            <BrandLogo variant="mark" height={30} />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[12px] text-muted">
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {i > 0 ? <ChevronRightIcon size={13} className="text-subtle" /> : null}
          {item.href && i < items.length - 1 ? (
            <Link href={item.href} className="rounded transition hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-foreground">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
  breadcrumbs,
  meta,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: React.ReactNode;
  breadcrumbs?: Crumb[];
  meta?: React.ReactNode;
}) {
  const router = useRouter();
  const { t, language } = useTranslation();
  return (
    <header className="mb-6 border-b border-border pb-5">
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        {back ? (
          <button
            onClick={() => router.back()}
            aria-label={t('common.back')}
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-muted transition hover:bg-surface-alt hover:text-foreground"
          >
            <ChevronRightIcon size={18} className={language === 'en' ? 'rotate-180' : undefined} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}