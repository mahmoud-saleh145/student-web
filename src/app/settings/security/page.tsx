'use client';

import { SettingsNav } from '@/components/settings/SettingsNav';
import { Card } from '@/components/ui/core';
import { AppShell, PageHeader } from '@/components/ui/feedback';
import { InfoIcon, ShieldIcon } from '@/components/ui/icons';
import { useTranslation } from '@/lib/session-context';

export default function SecurityPage() {
  const { t } = useTranslation();

  const items = [
    {
      title: t('security.protectedContentTitle'),
      body: t('security.protectedContentBody'),
    },
    {
      title: t('security.deviceBindingTitle'),
      body: t('security.deviceBindingBody'),
    },
    { title: t('security.watermarkTitle'), body: t('security.watermarkBody') },
  ];

  return (
    <AppShell>
      <PageHeader
        title={t('security.title')}
        breadcrumbs={[{ href: '/settings', label: t('settings.title') }, { label: t('security.title') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav current="/settings/security" />
        </div>

        <div className="space-y-4">
          <Card>
            {items.map((item) => (
              <div key={item.title} className="flex items-start gap-3 border-b border-border py-3 last:border-0">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
                  <ShieldIcon size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{item.body}</p>
                </div>
              </div>
            ))}
          </Card>

          <Card className="border-primary/30 bg-primary-soft">
            <div className="flex items-start gap-3">
              <InfoIcon size={18} className="mt-0.5 shrink-0 text-primary-ink" />
              <p className="text-[13px] leading-relaxed text-muted">
                Web sessions run in the browser sandbox: there is no screenshot blocking, secure surface, or device
                integrity attestation on the web. Protected playback (signed expiring URLs, per-session watermark,
                concurrency slots, play limits) is still enforced server-side.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
