'use client';

import Link from 'next/link';
import * as React from 'react';

import { Card } from '@/components/ui/core';
import {
  BellIcon,
  ChevronRightIcon,
  DeviceIcon,
  GlobeIcon,
  InfoIcon,
  PlayIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { useTranslation } from '@/lib/session-context';
import { cn } from '@/lib/utils';

interface SettingsNavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: SettingsNavItem[] = [
  { href: '/settings', labelKey: 'settings.title', icon: SettingsIcon },
  { href: '/settings/language', labelKey: 'settings.language', icon: GlobeIcon },
  { href: '/settings/playback', labelKey: 'settings.playback', icon: PlayIcon },
  { href: '/settings/notifications', labelKey: 'settings.notifications', icon: BellIcon },
  { href: '/settings/security', labelKey: 'settings.security', icon: ShieldIcon },
  { href: '/settings/devices', labelKey: 'settings.authorizedDevice', icon: DeviceIcon },
  { href: '/settings/about', labelKey: 'settings.aboutApp', icon: InfoIcon },
  { href: '/settings/delete-account', labelKey: 'settings.deleteAccount', icon: TrashIcon },
];

export function SettingsNav({ current }: { current: string }) {
  const { t } = useTranslation();

  return (
    <Card>
      <nav aria-label={t('settings.title')} className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = current === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                active ? 'bg-primary-soft text-primary-ink' : 'text-muted hover:bg-surface-alt hover:text-foreground',
              )}
            >
              <Icon size={17} />
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
              <ChevronRightIcon size={14} className={active ? 'text-primary-ink' : 'text-subtle'} />
            </Link>
          );
        })}
      </nav>
    </Card>
  );
}
