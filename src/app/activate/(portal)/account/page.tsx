'use client';

import * as React from 'react';

import { useActivationProfile } from '@/activation/api';
import { OpenAppCard } from '@/activation/components/OpenAppCard';
import { useActivationSession } from '@/activation/session';
import { useActivationT } from '@/activation/use-t';
import { Avatar, Button, Card, CardTitle, KeyValue, Segmented, Skeleton } from '@/components/ui/core';
import { PageHeader } from '@/components/ui/feedback';
import { LogOutIcon, ShieldIcon } from '@/components/ui/icons';
import { localizedName } from '@/lib/format';
import { useLanguageStore, useThemeStore, type ThemePreference } from '@/store/stores';
import type { Language } from '@/i18n/dictionaries';

/**
 * The student's account, as the portal needs it: who is signed in, the
 * academic profile that decides what they see, the two display preferences,
 * and sign out.
 *
 * Read-only on purpose. The profile is edited in the app; university, faculty
 * and department are set by the administration. There is no device list here
 * — the portal is not a device and manages none.
 */
export default function ActivationAccountPage() {
  const { t, language } = useActivationT();
  const { user, signOut } = useActivationSession();
  const profile = useActivationProfile();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const theme = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setPreference);
  const [leaving, setLeaving] = React.useState(false);

  const p = profile.data;
  const yearLabel = p?.academicYear?.structure?.kind === 'LEVEL' ? t('auth.level') : t('auth.academicYear');

  return (
    <>
      <PageHeader title={t('act.account.title')} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex items-center gap-3.5">
              <Avatar name={user?.fullName ?? ''} uri={user?.avatarUrl} size={52} />
              <div className="min-w-0">
                <div className="truncate text-[17px] font-bold">{user?.fullName}</div>
                <div className="mt-0.5 text-[13px] text-muted" dir="ltr">
                  {user?.phone}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>{t('profile.academicInfo')}</CardTitle>
            {profile.isLoading ? (
              <div className="space-y-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={22} />
                ))}
              </div>
            ) : (
              <>
                <KeyValue label={t('auth.university')}>{localizedName(p?.university, language)}</KeyValue>
                <KeyValue label={t('auth.faculty')}>{localizedName(p?.faculty, language)}</KeyValue>
                <KeyValue label={t('auth.department')}>{localizedName(p?.department, language)}</KeyValue>
                <KeyValue label={yearLabel}>{localizedName(p?.academicYear, language)}</KeyValue>
              </>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-subtle">{t('profile.contactToChange')}</p>
          </Card>

          <Card>
            <CardTitle>{t('act.account.preferences')}</CardTitle>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] font-semibold">{t('settings.language')}</span>
                <Segmented<Language>
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'ar', label: 'العربية' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] font-semibold">{t('settings.theme')}</span>
                <Segmented<ThemePreference>
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: t('settings.themeLight') },
                    { value: 'dark', label: t('settings.themeDark') },
                    { value: 'system', label: t('settings.themeSystem') },
                  ]}
                />
              </div>
            </div>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <OpenAppCard compact />

          <Card>
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
              <ShieldIcon size={14} className="mt-0.5 shrink-0" />
              <span>{t('act.account.notDevice')}</span>
            </p>
            <Button
              variant="danger"
              fullWidth
              className="mt-4"
              loading={leaving}
              onClick={() => {
                setLeaving(true);
                void signOut();
              }}
            >
              <LogOutIcon size={17} />
              {t('auth.logout')}
            </Button>
            <p className="mt-2.5 text-center text-[12px] text-subtle">{t('act.account.signOutNote')}</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
