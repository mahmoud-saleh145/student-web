'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { SettingsNav } from '@/components/settings/SettingsNav';
import { Button, Card, CardTitle } from '@/components/ui/core';
import { AppShell, InlineError, PageHeader } from '@/components/ui/feedback';
import { AlertIcon } from '@/components/ui/icons';
import { useCreateTicket } from '@/features/api';
import { useSession, useTranslation } from '@/lib/session-context';

export default function DeleteAccountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useSession();
  const create = useCreateTicket();
  const [confirming, setConfirming] = React.useState(false);

  const submit = async () => {
    try {
      const ticket = await create.mutateAsync({
        subject: 'Account deletion request',
        body: `I am asking for my account and its associated data to be deleted.\nName: ${user?.fullName ?? ''}\nPhone: ${user?.phone ?? ''}\n(Sent from the web app.)`,
        category: 'GENERAL',
      });
      router.replace(`/support/${ticket.id}`);
    } catch {
      // rendered below
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={t('deleteAccount.title')}
        subtitle={t('deleteAccount.whatHappensTitle')}
        breadcrumbs={[{ href: '/settings', label: t('settings.title') }, { label: t('deleteAccount.title') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav current="/settings/delete-account" />
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>{t('deleteAccount.whatHappensTitle')}</CardTitle>
            <p className="text-sm leading-relaxed text-muted">{t('deleteAccount.whatHappensBody')}</p>
          </Card>

          <Card className="border-danger/40">
            <div className="flex items-start gap-3">
              <AlertIcon size={18} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-danger">{t('deleteAccount.submit')}</div>
                <p className="mt-0.5 text-[13px] text-muted">{t('settings.contactSupport')}</p>
              </div>
            </div>

            {create.isError ? (
              <div className="mt-4">
                <InlineError error={create.error} />
              </div>
            ) : null}

            <div className="mt-4 border-t border-border pt-4">
              {!confirming ? (
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  {t('deleteAccount.submit')}
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="danger" loading={create.isPending} onClick={() => void submit()}>
                    {t('common.confirm')}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
