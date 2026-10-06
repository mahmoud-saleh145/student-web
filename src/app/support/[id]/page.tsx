'use client';

import { useParams } from 'next/navigation';
import * as React from 'react';

import { Avatar, Badge, Button, Card, CardTitle, KeyValue } from '@/components/ui/core';
import { AppShell, ErrorState, InlineError, PageHeader } from '@/components/ui/feedback';
import { SendIcon } from '@/components/ui/icons';
import { TextArea } from '@/components/ui/forms';
import { useReplyToTicket, useSupportTicket } from '@/features/api';
import { formatDateTime } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import { cn } from '@/lib/utils';
import type { SupportTicketStatus } from '@/types/domain';

const STATUS_TONE: Record<SupportTicketStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  OPEN: 'info',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function TicketPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, language } = useTranslation();
  const query = useSupportTicket(id);
  const reply = useReplyToTicket(id ?? '');
  const [body, setBody] = React.useState('');
  const canSend = body.trim().length >= 1 && !reply.isPending;

  const send = async () => {
    if (!canSend) return;
    await reply.mutateAsync(body.trim());
    setBody('');
  };

  if (query.isLoading) {
    return (
      <AppShell>
        <p className="py-16 text-center text-sm text-muted">{t('common.loading')}</p>
      </AppShell>
    );
  }
  if (query.isError || !query.data) {
    return (
      <AppShell>
        <PageHeader title={t('support.title')} back />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </AppShell>
    );
  }

  const ticket = query.data;
  const closed = ticket.status === 'CLOSED';
  const statusLabel = t(`support.status.${ticket.status}`);

  return (
    <AppShell>
      <PageHeader
        title={ticket.reference}
        subtitle={ticket.subject}
        back
        meta={
          <>
            <Badge label={statusLabel} tone={STATUS_TONE[ticket.status]} />
            <Badge label={t(`support.categories.${ticket.category}`)} tone="neutral" />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Card padded={false} className="p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              {ticket.messages.map((m) => {
                const mine = m.authorRole === 'STUDENT';
                const authorName = mine ? t('support.you') : (m.author?.fullName ?? t('support.staff'));
                return (
                  <div key={m.id} className={cn('flex gap-2.5', mine && 'justify-end')}>
                    <Avatar name={authorName} size={32} />
                    <div className="min-w-0 max-w-[85%]">
                      <div
                        className={cn(
                          'rounded-xl border px-3.5 py-2.5 text-start',
                          mine
                            ? 'border-primary/30 bg-primary-soft'
                            : 'border-border bg-surface-alt'
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className={cn('text-[13px] font-bold', mine ? 'text-primary-ink' : 'text-foreground')}>
                            {authorName}
                          </span>
                          <span className="text-[13px] text-subtle">{formatDateTime(m.createdAt, language)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {closed ? (
            <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-muted">
              {t('support.closedBody')}
            </p>
          ) : (
            <Card className="mt-4">
              <CardTitle>{t('support.reply')}</CardTitle>
              <TextArea
                label={t('support.message')}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={4000}
              />
              {reply.isError ? (
                <div className="mt-3">
                  <InlineError error={reply.error} />
                </div>
              ) : null}
              <Button className="mt-3" loading={reply.isPending} disabled={!canSend} onClick={send}>
                <SendIcon size={16} />
                {t('support.send')}
              </Button>
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardTitle>{t('support.ticketsTitle')}</CardTitle>
            <KeyValue label={t('support.subject')}>{ticket.subject}</KeyValue>
            <KeyValue label={t('support.category')}>{t(`support.categories.${ticket.category}`)}</KeyValue>
            <KeyValue label={t('web.col.status')}>
              <Badge label={statusLabel} tone={STATUS_TONE[ticket.status]} />
            </KeyValue>
            <KeyValue label={t('web.col.date')}>{formatDateTime(ticket.createdAt, language)}</KeyValue>
            <KeyValue label={t('web.col.lastReply')}>{formatDateTime(ticket.lastMessageAt, language)}</KeyValue>
            <KeyValue label={t('common.close')}>
              {closed ? formatDateTime(ticket.lastMessageAt, language) : t('common.no')}
            </KeyValue>
            {ticket.courseId ? (
              <KeyValue label={t('web.col.course')}>
                <span dir="ltr" className="truncate">
                  {ticket.courseId}
                </span>
              </KeyValue>
            ) : null}
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}