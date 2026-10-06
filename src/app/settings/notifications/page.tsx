'use client';

import { SettingsNav } from '@/components/settings/SettingsNav';
import { Card, CardTitle } from '@/components/ui/core';
import { AppShell, ErrorState, PageHeader } from '@/components/ui/feedback';
import { Toggle } from '@/components/ui/forms';
import { useNotificationPreferences, useUpdatePreferences } from '@/features/api';
import { useTranslation } from '@/lib/session-context';
import type { NotificationPreferences } from '@/types/domain';

export default function NotificationSettingsPage() {
  const { t } = useTranslation();
  const prefs = useNotificationPreferences();
  const update = useUpdatePreferences();

  const rows: { key: keyof NotificationPreferences; label: string }[] = [
    { key: 'newLesson', label: t('settings.notifyNewLesson') },
    { key: 'newCourse', label: t('settings.notifyNewCourse') },
    { key: 'announcements', label: t('settings.notifyAnnouncements') },
    { key: 'payments', label: t('settings.notifyPayments') },
  ];

  return (
    <AppShell>
      <PageHeader
        title={t('settings.notifications')}
        subtitle={t('settings.pushNotifications')}
        breadcrumbs={[{ href: '/settings', label: t('settings.title') }, { label: t('settings.notifications') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav current="/settings/notifications" />
        </div>

        <div className="space-y-4">
          {prefs.isLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-surface-alt" />
          ) : prefs.isError || !prefs.data ? (
            <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />
          ) : (
            <Card>
              <CardTitle>{t('settings.notifications')}</CardTitle>
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="flex flex-col items-start gap-3 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="text-sm font-semibold">{row.label}</div>
                  <Toggle
                    checked={prefs.data[row.key]}
                    label={row.label}
                    onChange={(v) => update.mutate({ ...prefs.data, [row.key]: v })}
                  />
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
