'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { accessBadgeMeta } from '@/components/courses/CourseCard';
import { Badge, Button, ProgressBar, Segmented } from '@/components/ui/core';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { GridIcon } from '@/components/ui/icons';
import { DataTable, Toolbar, type Column } from '@/components/ui/table';
import { useMyCourses } from '@/features/api';
import { formatPercent } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import type { CourseSummary } from '@/types/domain';

type Tab = 'active' | 'completed' | 'other';

function CourseCell({ course }: { course: CourseSummary }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-alt">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <GridIcon size={16} className="text-subtle" />
        )}
      </span>
      <span className="min-w-0">
        <span className="clamp-1 block text-[13px] font-semibold">{course.title}</span>
        <span className="clamp-1 block text-[11px] text-subtle">{course.shortDescription}</span>
      </span>
    </div>
  );
}

function ProgressCell({ course }: { course: CourseSummary }) {
  const { language } = useTranslation();
  const percent = course.progress?.percent ?? 0;
  return (
    <div className="flex items-center gap-2.5">
      <ProgressBar percent={percent} tone={percent >= 100 ? 'success' : 'primary'} className="w-28" />
      <span className="w-10 shrink-0 text-end text-[13px] font-semibold tabular-nums">
        {formatPercent(percent, language)}
      </span>
    </div>
  );
}

export default function MyCoursesPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('active');
  const query = useMyCourses();

  const all = React.useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const active = React.useMemo(
    () => all.filter((c) => c.access.state === 'ACTIVE' && (c.progress?.percent ?? 0) < 100),
    [all]
  );
  const completed = React.useMemo(() => all.filter((c) => (c.progress?.percent ?? 0) >= 100), [all]);
  const other = React.useMemo(
    () => all.filter((c) => c.access.state === 'EXPIRED' || c.access.state === 'ARCHIVED' || c.access.state === 'REVOKED'),
    [all]
  );

  const rows = tab === 'active' ? active : tab === 'completed' ? completed : other;

  const open = React.useCallback(
    (course: CourseSummary) => router.push(`/courses/${course.id}`),
    [router]
  );

  const columns = React.useMemo<Column<CourseSummary>[]>(
    () => [
      {
        key: 'course',
        header: t('web.col.course'),
        className: 'min-w-[220px]',
        render: (c) => <CourseCell course={c} />,
      },
      {
        key: 'teacher',
        header: t('web.col.teacher'),
        className: 'min-w-[140px]',
        render: (c) => <span className="clamp-1 text-[13px] text-muted">{c.teacher.fullName}</span>,
      },
      {
        key: 'progress',
        header: t('web.col.progress'),
        className: 'min-w-[180px]',
        render: (c) => <ProgressCell course={c} />,
      },
      {
        key: 'status',
        header: t('web.col.status'),
        render: (c) => {
          const meta = accessBadgeMeta(c.access.state, t);
          return meta ? <Badge label={meta.label} tone={meta.tone} /> : null;
        },
      },
      {
        key: 'actions',
        header: t('web.col.actions'),
        className: 'text-end',
        headerClassName: 'text-end',
        render: (c) => {
          const inProgress = c.access.state === 'ACTIVE' && (c.progress?.percent ?? 0) < 100;
          return (
            <Button
              size="sm"
              variant={inProgress ? 'primary' : 'secondary'}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open(c);
              }}
            >
              {inProgress ? t('common.continue') : t('courses.overview')}
            </Button>
          );
        },
      },
    ],
    [open, t]
  );

  return (
    <AppShell>
      <PageHeader
        title={t('courses.myCourses')}
        breadcrumbs={[
          { href: '/home', label: t('tabs.home') },
          { label: t('courses.myCourses') },
        ]}
      />

      <Toolbar>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: t('progress.inProgress'), count: active.length },
            { value: 'completed', label: t('progress.completed'), count: completed.length },
            { value: 'other', label: t('web.all'), count: other.length },
          ]}
        />
      </Toolbar>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-alt" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('courses.empty.mineTitle')}
          body={t('courses.empty.mineBody')}
          actionLabel={t('home.browseCourses')}
          onAction={() => router.push('/courses')}
        />
      ) : (
        <DataTable<CourseSummary>
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={open}
          empty={t('web.noResults')}
          mobile={(c) => {
            const meta = accessBadgeMeta(c.access.state, t);
            return (
              <div>
                <p className="clamp-1 text-sm font-semibold">{c.title}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted">{c.teacher.fullName}</p>
                <div className="mt-3 flex items-center gap-2.5">
                  <ProgressBar percent={c.progress?.percent ?? 0} className="flex-1" />
                  <span className="text-[13px] font-semibold tabular-nums">
                    {formatPercent(c.progress?.percent ?? 0, language)}
                  </span>
                  {meta ? <Badge label={meta.label} tone={meta.tone} /> : null}
                </div>
              </div>
            );
          }}
        />
      )}
    </AppShell>
  );
}