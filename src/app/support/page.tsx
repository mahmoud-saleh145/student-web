'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Chip, Skeleton } from '@/components/ui/core';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { ChevronRightIcon, EyeIcon, PlusIcon } from '@/components/ui/icons';
import { Column, DataTable, Toolbar } from '@/components/ui/table';
import { useSupportTickets } from '@/features/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import type { SupportTicketStatus, SupportTicketSummary } from '@/types/domain';

type StatusFilter = 'all' | 'open' | 'closed';

const STATUS_TONE: Record<SupportTicketStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  OPEN: 'info',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

const OPEN_STATUSES: SupportTicketStatus[] = ['OPEN', 'PENDING'];
const CLOSED_STATUSES: SupportTicketStatus[] = ['RESOLVED', 'CLOSED'];

export default function SupportPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const query = useSupportTickets();
  const [filter, setFilter] = React.useState<StatusFilter>('all');
  const items = React.useMemo(() => query.data?.items ?? [], [query.data]);

  // The mobile labels: Open / Pending / Resolved / Closed, not a two-way guess.
  const statusLabel = React.useCallback((status: SupportTicketStatus) => t(`support.status.${status}`), [t]);

  const counts = React.useMemo(
    () => ({
      all: items.length,
      open: items.filter((tk) => OPEN_STATUSES.includes(tk.status)).length,
      closed: items.filter((tk) => CLOSED_STATUSES.includes(tk.status)).length,
    }),
    [items]
  );

  const rows = React.useMemo(
    () =>
      items.filter((tk) => {
        if (filter === 'all') return true;
        if (filter === 'open') return OPEN_STATUSES.includes(tk.status);
        return CLOSED_STATUSES.includes(tk.status);
      }),
    [items, filter]
  );

  const openTicket = React.useCallback(
    (ticket: SupportTicketSummary) => router.push(`/support/${ticket.id}`),
    [router]
  );

  const columns = React.useMemo<Column<SupportTicketSummary>[]>(
    () => [
      {
        key: 'subject',
        header: t('web.col.subject'),
        className: 'min-w-[280px]',
        render: (ticket) => (
          <div className="min-w-0">
            <div className="clamp-1 text-sm font-semibold">{ticket.subject}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge label={t(`support.categories.${ticket.category}`)} tone="neutral" />
              <span className="text-[13px] text-subtle" dir="ltr">
                {ticket.reference}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: 'status',
        header: t('web.col.status'),
        className: 'whitespace-nowrap',
        render: (ticket) => <Badge label={statusLabel(ticket.status)} tone={STATUS_TONE[ticket.status]} />,
      },
      {
        key: 'lastReply',
        header: t('web.col.lastReply'),
        className: 'whitespace-nowrap text-[13px] text-muted',
        render: (ticket) => (
          <time dateTime={ticket.lastMessageAt} title={formatDateTime(ticket.lastMessageAt, language)}>
            {formatRelative(ticket.lastMessageAt, language)}
          </time>
        ),
      },
      {
        key: 'actions',
        header: t('web.col.actions'),
        headerClassName: 'text-end',
        className: 'whitespace-nowrap text-end',
        render: (ticket) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              openTicket(ticket);
            }}
          >
            <EyeIcon size={15} />
            {t('common.continue')}
          </Button>
        ),
      },
    ],
    [t, language, statusLabel, openTicket]
  );

  return (
    <AppShell>
      <PageHeader
        title={t('support.title')}
        subtitle={t('support.ticketsBody')}
        action={
          <Button size="sm" onClick={() => router.push('/support/new')}>
            <PlusIcon size={16} />
            {t('support.newTicket')}
          </Button>
        }
      />

      <Toolbar>
        <Chip
          label={t('web.all')}
          count={counts.all}
          selected={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <Chip
          label={t('progress.inProgress')}
          count={counts.open}
          selected={filter === 'open'}
          onClick={() => setFilter('open')}
        />
        <Chip
          label={t('progress.completed')}
          count={counts.closed}
          selected={filter === 'closed'}
          onClick={() => setFilter('closed')}
        />
      </Toolbar>

      {query.isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={72} />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('support.empty.title')}
          body={t('support.empty.body')}
          actionLabel={t('support.newTicket')}
          onAction={() => router.push('/support/new')}
        />
      ) : rows.length === 0 ? (
        <EmptyState compact title={t('web.noResults')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(ticket) => ticket.id}
          empty={t('web.noResults')}
          onRowClick={openTicket}
          mobile={(ticket) => (
            <div>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="clamp-2 text-sm font-bold">{ticket.subject}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge label={t(`support.categories.${ticket.category}`)} tone="neutral" />
                    <span className="text-[13px] text-subtle" dir="ltr">
                      {ticket.reference}
                    </span>
                  </div>
                </div>
                <ChevronRightIcon size={16} className="mt-0.5 shrink-0 text-subtle" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge label={statusLabel(ticket.status)} tone={STATUS_TONE[ticket.status]} />
                <time className="ms-auto text-[13px] text-subtle" dateTime={ticket.lastMessageAt}>
                  {formatRelative(ticket.lastMessageAt, language)}
                </time>
              </div>
              <Button
                size="sm"
                variant="secondary"
                fullWidth
                className="mt-3"
                onClick={() => openTicket(ticket)}
              >
                <EyeIcon size={15} />
                {t('common.continue')}
              </Button>
            </div>
          )}
        />
      )}
    </AppShell>
  );
}