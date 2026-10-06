'use client';

import { SettingsNav } from '@/components/settings/SettingsNav';
import { Card, CardTitle, Chip } from '@/components/ui/core';
import { AppShell, PageHeader } from '@/components/ui/feedback';
import { Select } from '@/components/ui/forms';
import type { Language as Lang } from '@/i18n/dictionaries';
import { useTranslation } from '@/lib/session-context';
import { useLanguageStore, useThemeStore, toast, type ThemePreference } from '@/store/stores';

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

export default function LanguagePage() {
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <AppShell>
      <PageHeader
        title={t('settings.language')}
        breadcrumbs={[{ href: '/settings', label: t('settings.title') }, { label: t('settings.language') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav current="/settings/language" />
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>{t('settings.appearance')}</CardTitle>

            <div className="flex flex-col items-start gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold">{t('settings.language')}</div>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <Chip
                    key={l.value}
                    label={l.label}
                    selected={language === l.value}
                    onClick={() => setLanguage(l.value)}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold">{t('settings.theme')}</div>
              <Select
                className="w-full shrink-0 sm:w-48"
                value={preference}
                onChange={(e) => {
                  setPreference(e.target.value as ThemePreference);
                  toast.success(t('common.done'));
                }}
                options={[
                  { value: 'system', label: t('settings.themeSystem') },
                  { value: 'light', label: t('settings.themeLight') },
                  { value: 'dark', label: t('settings.themeDark') },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
