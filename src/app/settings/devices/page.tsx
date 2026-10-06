'use client';

import * as React from 'react';

import { Badge, Button, Card, Skeleton } from '@/components/ui/core';
import { SupportLinks } from '@/components/support/SupportLinks';
import { AppShell, ErrorState, PageHeader, toUserMessage } from '@/components/ui/feedback';
import { DeviceIcon, PlusIcon, ShieldIcon } from '@/components/ui/icons';
import { Column, DataTable } from '@/components/ui/table';
import { useAuthorizedDevices, useRequestDeviceChange } from '@/features/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useSession, useTranslation } from '@/lib/session-context';
import { toast } from '@/store/stores';
import type { AuthorizedDevice } from '@/types/domain';

export default function DevicesPage() {
  const { t, language } = useTranslation();
  const devices = useAuthorizedDevices();
  const requestChange = useRequestDeviceChange();
  const { user } = useSession();

  const send = React.useCallback(
    async (reason: string) => {
      try {
        await requestChange.mutateAsync(`${reason} (${navigator.userAgent.slice(0, 80)})`);
        toast.success(t('settings.requestSent'));
      } catch (e) {
        toast.error(toUserMessage(e, t));
      }
    },
    [requestChange, t]
  );

  const submit = () => send(t('settings.requestDeviceChange'));

  const rows = devices.data ?? [];

  const columns = React.useMemo<Column<AuthorizedDevice>[]>(
    () => [
      {
        key: 'device',
        header: t('web.col.device'),
        className: 'min-w-[240px]',
        render: (d) => (
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-alt text-muted">
              <DeviceIcon size={18} />
            </span>
            <div className="min-w-0">
              <div className="clamp-1 text-sm font-semibold">{d.name}</div>
              <div className="clamp-1 text-[13px] text-muted">
                {d.model} · {d.platform}
              </div>
              <div className="text-[13px] text-subtle">
                {t('settings.authorizedDevice')}: {formatDateTime(d.authorizedAt, language)}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'lastActive',
        header: t('web.col.date'),
        className: 'whitespace-nowrap text-[13px] text-muted',
        render: (d) => (
          <time dateTime={d.lastSeenAt} title={formatDateTime(d.lastSeenAt, language)}>
            {formatRelative(d.lastSeenAt, language)}
          </time>
        ),
      },
      {
        key: 'status',
        header: t('web.col.status'),
        className: 'whitespace-nowrap',
        render: (d) =>
          d.current ? (
            <Badge label={t('settings.currentDevice')} tone="primary" />
          ) : (
            <Badge label={t('settings.authorizedDevice')} tone="neutral" />
          ),
      },
      {
        key: 'actions',
        header: t('web.col.actions'),
        headerClassName: 'text-end',
        className: 'whitespace-nowrap text-end',
        render: (d) => (
          <Button
            size="sm"
            variant="secondary"
            loading={requestChange.isPending}
            onClick={() => send(`${t('settings.requestDeviceChange')} — ${d.name}`)}
          >
            <PlusIcon size={15} />
            {t('settings.requestDeviceChange')}
          </Button>
        ),
      },
    ],
    [t, language, send, requestChange.isPending]
  );

  return (
    <AppShell>
      <PageHeader title={t('devices.title')} subtitle={t('settings.authorizedDevice')} back />

      <Card className="mb-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
          <ShieldIcon size={19} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-bold">{t('security.deviceBindingTitle')}</div>
          <p className="mt-0.5 text-[13px] text-muted">{t('security.deviceBindingBody')}</p>
        </div>
      </Card>

      {devices.isLoading ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      ) : devices.isError ? (
        <ErrorState error={devices.error} onRetry={() => void devices.refetch()} compact />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          empty={t('web.noResults')}
          mobile={(d) => (
            <div>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-alt text-muted">
                  <DeviceIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="clamp-1 text-sm font-bold">{d.name}</div>
                  <div className="clamp-1 text-[13px] text-muted">
                    {d.model} · {d.platform}
                  </div>
                  <time className="mt-1 block text-[13px] text-subtle" dateTime={d.lastSeenAt}>
                    {formatRelative(d.lastSeenAt, language)}
                  </time>
                </div>
                {d.current ? <Badge label={t('settings.currentDevice')} tone="primary" /> : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                fullWidth
                className="mt-3"
                loading={requestChange.isPending}
                onClick={() => send(`${t('settings.requestDeviceChange')} — ${d.name}`)}
              >
                <PlusIcon size={15} />
                {t('settings.requestDeviceChange')}
              </Button>
            </div>
          )}
        />
      )}

      <Card className="mt-6">
        <div className="text-[15px] font-bold">{t('settings.requestDeviceChange')}</div>
        <p className="mt-0.5 mb-4 text-[13px] text-muted">{t('security.deviceBindingBody')}</p>
        <Button variant="secondary" loading={requestChange.isPending} onClick={submit}>
          {t('settings.requestDeviceChange')}
        </Button>
        {/* The mobile screen follows a change request with WhatsApp to the admin. */}
        <SupportLinks
          className="mt-3"
          channels={['whatsapp']}
          context={{ reason: 'device', fullName: user?.fullName, phone: user?.phone }}
        />
      </Card>
    </AppShell>
  );
}