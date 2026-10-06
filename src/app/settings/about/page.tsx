'use client';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { Card } from '@/components/ui/core';
import { AppShell, PageHeader } from '@/components/ui/feedback';
import { FileIcon } from '@/components/ui/icons';
import { useTranslation } from '@/lib/session-context';

export default function AboutPage() {
  const { t } = useTranslation();
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

  return (
    <AppShell>
      <PageHeader
        title={t('settings.aboutApp')}
        subtitle={t('settings.version', { version })}
        breadcrumbs={[{ href: '/settings', label: t('settings.title') }, { label: t('settings.aboutApp') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav current="/settings/about" />
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-col items-center text-center">
              {/* The mark on its own plate, exactly as the brand artwork draws it. */}
              <div className="grid w-full max-w-xs place-items-center rounded-2xl bg-primary px-8 py-10">
                <BrandLogo height={72} priority />
              </div>
              <h2 className="sr-only">{t('common.appName')}</h2>
              <p className="mt-4 text-[13px] text-muted" dir="ltr">
                {t('settings.version', { version })} · web
              </p>
            </div>
          </Card>

          <Card>
            <p className="text-[13px] leading-relaxed text-muted">{t('auth.termsNotice')}</p>
            <div className="mt-4 border-t border-border">
              {['Terms of use', 'Privacy policy', 'Content policy'].map((label) => (
                <div
                  key={label}
                  className="flex items-center gap-3 border-b border-border py-3 text-sm font-semibold last:border-0"
                >
                  <FileIcon size={17} className="text-subtle" />
                  {label}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
