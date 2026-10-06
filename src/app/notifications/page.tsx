'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Segmented, Skeleton } from '@/components/ui/core';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { CheckIcon, ChevronRightIcon } from '@/components/ui/icons';
import { Column, DataTable, Toolbar } from '@/components/ui/table';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/features/api';
import { toWebRoute } from '@/lib/routes';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useSession, useTranslation } from '@/lib/session-context';
import type { AppNotification, NotificationKind } from '@/types/domain';

type Filter = 'all' | 'unread';

const KIND_TONE: Record<NotificationKind, 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  NEW_COURSE: 'primary',
  NEW_SECTION: 'primary',
  NEW_LESSON: 'primary',
  NEW_VIDEO: 'info',
  ANNOUNCEMENT: 'info',
  PAYMENT: 'success',
  ENROLLMENT: 'success',
  COURSE_UPDATE: 'warning',
  ADMIN: 'neutral',
  SECURITY: 'danger',
};

export default function NotificationsPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { status } = useSession();
  const [filter, setFilter] = React.useState<Filter>('all');
  const unreadOnly = filter === 'unread';
  const query = useNotifications(unreadOnly);
  const unread = useUnreadCount(status === 'authenticated');
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();
  const items = query.data?.items ?? [];

  const unreadCount = unread.data?.count ?? items.filter((n) => !n.read).length;
  const allCount = unreadOnly ? unreadCount : (query.data?.total ?? items.length);

  const kindLabel = React.useCallback(
    (kind: NotificationKind) => {
      switch (kind) {
        case 'NEW_COURSE':
          return t('tabs.courses');
        case 'NEW_SECTION':
          return t('courses.content');
        case 'NEW_LESSON':
        case 'NEW_VIDEO':
          return t('lesson.lesson');
        case 'ANNOUNCEMENT':
          return t('home.announcements');
        case 'PAYMENT':
          return t('wallet.title');
        case 'ENROLLMENT':
          return t('tabs.myCourses');
        case 'COURSE_UPDATE':
          return t('courses.title');
        case 'SECURITY':
          return t('settings.security');
        default:
          return t('settings.title');
      }
    },
    [t]
  );

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.route) router.push(toWebRoute(n.route, '/notifications'));
  };

  const markOne = React.useCallback(
    (n: AppNotification) => {
      if (!n.read) markRead.mutate(n.id);
    },
    [markRead]
  );

  const columns = React.useMemo<Column<AppNotification>[]>(
    () => [
      {
        key: 'notification',
        header: t('notifications.title'),
        className: 'min-w-[280px]',
        render: (n) => (
          <div className="min-w-0">
            <div className={`clamp-1 text-sm ${n.read ? 'font-semibold' : 'font-bold'}`}>{n.title}</div>
            <div className="clamp-1 text-sm text-muted">{n.body}</div>
          </div>
        ),
      },
      {
        key: 'type',
        header: t('web.col.type'),
        className: 'whitespace-nowrap',
        render: (n) => <Badge label={kindLabel(n.kind)} tone={KIND_TONE[n.kind] ?? 'neutral'} />,
      },
      {
        key: 'date',
        header: t('web.col.date'),
        className: 'whitespace-nowrap text-[13px] text-muted',
        render: (n) => (
          <time dateTime={n.createdAt}>{formatDateTime(n.createdAt, language)}</time>
        ),
      },
      {
        key: 'status',
        header: t('web.col.status'),
        className: 'whitespace-nowrap',
        render: (n) =>
          n.read ? (
            <span className="text-[13px] text-subtle">{t('common.done')}</span>
          ) : (
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-danger">
              <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
              {t('notifications.unread')}
            </span>
          ),
      },
      {
        key: 'actions',
        header: t('web.col.actions'),
        headerClassName: 'text-end',
        className: 'whitespace-nowrap text-end',
        render: (n) =>
          n.read ? (
            <span className="text-[13px] text-subtle">&mdash;</span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={markRead.isPending && markRead.variables === n.id}
              onClick={(e) => {
                e.stopPropagation();
                markOne(n);
              }}
            >
              <CheckIcon size={15} />
              {t('common.done')}
            </Button>
          ),
      },
    ],
    [t, language, kindLabel, markRead, markOne]
  );

  return (
    <AppShell unread={unreadCount}>
      <PageHeader title={t('notifications.title')} subtitle={t('notifications.empty.body')} />

      <Toolbar>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('notifications.all'), count: allCount },
            { value: 'unread', label: t('notifications.unread'), count: unreadCount },
          ]}
        />
        <div className="ms-auto flex items-center gap-2">
          {unreadCount > 0 ? (
            <Button size="sm" variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>
              <CheckIcon size={15} />
              {t('notifications.markAllRead')}
            </Button>
          ) : null}
        </div>
      </Toolbar>

      {query.isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('notifications.empty.title')}
          body={t('notifications.empty.body')}
          actionLabel={unreadOnly ? t('notifications.all') : undefined}
          onAction={unreadOnly ? () => setFilter('all') : undefined}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(n) => n.id}
            empty={t('notifications.empty.title')}
            onRowClick={open}
            mobile={(n) => (
              <div>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="clamp-2 text-sm font-bold">{n.title}</div>
                    <p className="clamp-2 mt-1 text-sm text-muted">{n.body}</p>
                  </div>
                  <ChevronRightIcon size={16} className="mt-0.5 shrink-0 text-subtle" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge label={kindLabel(n.kind)} tone={KIND_TONE[n.kind] ?? 'neutral'} />
                  {n.read ? (
                    <span className="text-[13px] text-subtle">{t('common.done')}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                      <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
                      {t('notifications.unread')}
                    </span>
                  )}
                  <time className="ms-auto text-[13px] text-subtle" dateTime={n.createdAt}>
                    {formatRelative(n.createdAt, language)}
                  </time>
                </div>
                {n.read ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    fullWidth
                    className="mt-3"
                    loading={markRead.isPending && markRead.variables === n.id}
                    onClick={() => markOne(n)}
                  >
                    <CheckIcon size={15} />
                    {t('common.done')}
                  </Button>
                )}
              </div>
            )}
          />
          {query.hasNextPage ? (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => void query.fetchNextPage()}>
                {t('common.seeAll')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}