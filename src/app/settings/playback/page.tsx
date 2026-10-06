'use client';

import { SettingsNav } from '@/components/settings/SettingsNav';
import { Card, CardTitle } from '@/components/ui/core';
import { AppShell, PageHeader } from '@/components/ui/feedback';
import { Select, Toggle } from '@/components/ui/forms';
import { useTranslation } from '@/lib/session-context';
import { PLAYBACK_RATES, QUALITY_LEVELS, usePlayerStore, type PlaybackRate, type QualityLevel } from '@/store/stores';

export default function PlaybackSettingsPage() {
  const { t } = useTranslation();
  const s = usePlayerStore();

  const toggles: {
    key: string;
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }[] = [
    {
      key: 'autoplay',
      label: t('settings.autoplayNext'),
      value: s.autoplayNext,
      onChange: s.setAutoplayNext,
    },
    {
      key: 'captions',
      label: t('settings.captionsDefault'),
      value: s.captionsEnabled,
      onChange: s.setCaptionsEnabled,
    },
    {
      key: 'data',
      label: t('settings.dataSaver'),
      value: s.dataSaver,
      onChange: s.setDataSaver,
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title={t('settings.playback')}
        breadcrumbs={[{ href: '/settings', label: t('settings.title') }, { label: t('settings.playback') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav current="/settings/playback" />
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>{t('settings.playback')}</CardTitle>

            <div className="flex flex-col items-start gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold">{t('settings.defaultQuality')}</div>
              <Select
                className="w-full shrink-0 sm:w-48"
                value={s.preferredQuality}
                onChange={(e) => s.setPreferredQuality(e.target.value as QualityLevel)}
                options={QUALITY_LEVELS.map((q) => ({
                  value: q,
                  label: q === 'auto' ? t('player.auto') : q,
                }))}
              />
            </div>

            <div className="flex flex-col items-start gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold">{t('settings.defaultSpeed')}</div>
              <Select
                className="w-full shrink-0 sm:w-48"
                value={String(s.rate)}
                onChange={(e) => s.setRate(Number(e.target.value) as PlaybackRate)}
                options={PLAYBACK_RATES.map((r) => ({
                  value: String(r),
                  label: r === 1 ? t('player.normalSpeed') : `${r}×`,
                }))}
              />
            </div>

            {toggles.map((row) => (
              <div
                key={row.key}
                className="flex flex-col items-start gap-3 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="text-sm font-semibold">{row.label}</div>
                <Toggle checked={row.value} onChange={row.onChange} label={row.label} />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
