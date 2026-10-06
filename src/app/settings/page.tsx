'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/core';
import { AppShell, PageHeader } from '@/components/ui/feedback';
import {
  BellIcon,
  BookIcon,
  ChevronRightIcon,
  DeviceIcon,
  GlobeIcon,
  InfoIcon,
  LifeBuoyIcon,
  PlayIcon,
  ShieldIcon,
  TrashIcon,
  WalletIcon,
} from '@/components/ui/icons';
import { useTranslation } from '@/lib/session-context';

export default function SettingsPage() {
  const { t } = useTranslation();
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

  const cards = [
    {
      href: '/settings/language',
      title: t('settings.appearance'),
      description: `${t('settings.language')} · ${t('settings.theme')}`,
      icon: GlobeIcon,
    },
    {
      href: '/settings/playback',
      title: t('settings.playback'),
      description: `${t('settings.defaultQuality')} · ${t('settings.defaultSpeed')}`,
      icon: PlayIcon,
    },
    {
      href: '/settings/notifications',
      title: t('settings.notifications'),
      description: t('settings.pushNotifications'),
      icon: BellIcon,
    },
    {
      href: '/settings/security',
      title: t('settings.security'),
      description: t('security.protectedContentTitle'),
      icon: ShieldIcon,
    },
    {
      href: '/settings/devices',
      title: t('settings.authorizedDevice'),
      description: t('settings.requestDeviceChange'),
      icon: DeviceIcon,
    },
    {
      href: '/settings/about',
      title: t('settings.aboutApp'),
      description: t('settings.version', { version }),
      icon: InfoIcon,
    },
    {
      href: '/settings/delete-account',
      title: t('settings.deleteAccount'),
      description: t('deleteAccount.submit'),
      icon: TrashIcon,
      danger: true,
    },
  ];

  const quickLinks = [
    {
      href: '/library',
      title: t('library.title'),
      description: t('library.browseSubtitle'),
      icon: BookIcon,
    },
    {
      href: '/wallet',
      title: t('wallet.title'),
      description: t('wallet.topUp'),
      icon: WalletIcon,
    },
    {
      href: '/support',
      title: t('support.title'),
      description: t('support.newTicket'),
      icon: LifeBuoyIcon,
    },
  ];

  return (
    <AppShell>
      <PageHeader title={t('settings.title')} subtitle={t('web.settingsSubtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group block rounded-xl transition-colors">
              <Card
                className={`h-full transition-colors group-hover:bg-surface-alt/60 ${
                  card.danger ? 'border-danger/30 group-hover:border-danger/60' : 'group-hover:border-border-strong'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                      card.danger ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary-ink'
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`flex items-center gap-1.5 text-[15px] font-bold ${card.danger ? 'text-danger' : ''}`}
                    >
                      <span className="truncate">{card.title}</span>
                      <ChevronRightIcon
                        size={15}
                        className={`ms-auto shrink-0 ${card.danger ? 'text-danger' : 'text-subtle'}`}
                      />
                    </div>
                    <p className="mt-0.5 clamp-1 text-[13px] text-muted">{card.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-bold tracking-tight">{t('web.quickLinks')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className="group block rounded-xl transition-colors">
              <Card className="h-full transition-colors group-hover:border-border-strong group-hover:bg-surface-alt/60">
                <div className="flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-alt text-muted">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[15px] font-bold">
                      <span className="truncate">{link.title}</span>
                      <ChevronRightIcon size={15} className="ms-auto shrink-0 text-subtle" />
                    </div>
                    <p className="mt-0.5 clamp-1 text-[13px] text-muted">{link.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
