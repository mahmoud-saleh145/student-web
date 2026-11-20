'use client';

import Link from 'next/link';
import * as React from 'react';

import { useActivationMyCourses, useActivationMyLibrary, useCourseExtents, type CourseExtent } from '@/activation/api';
import { OpenAppCard } from '@/activation/components/OpenAppCard';
import { courseOwnership } from '@/activation/lib/ownership';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationT } from '@/activation/use-t';
import { LibraryErrorState } from '@/components/library/LibraryErrorState';
import { Badge, Button, Segmented, Skeleton } from '@/components/ui/core';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { FileIcon, GridIcon } from '@/components/ui/icons';
import { ACCESS_BADGE } from '@/lib/course-access';
import { formatDate, formatNumber, localizedName } from '@/lib/format';
import { myLibraryStatus } from '@/lib/library';
import { cn } from '@/lib/utils';
import type { CourseSummary, MyLibraryItem } from '@/types/domain';

type Tab = 'courses' | 'documents';

/**
 * Everything activated on the account, with its true extent.
 *
 * COURSES come from `GET /courses/mine`. That list says a course is ACTIVE but
 * not how much of it — a student who bought one part is ACTIVE too — so each
 * course's extent is read from the server as well (`join-options`, or `parts`
 * for a course no longer on offer) and shown as exactly that:
 *
 *   "Full course"        only when the server says the whole course is owned
 *   "2 of 3 parts"       with the parts named, for part-by-part ownership
 *   "Partial access"     for access to less than the course and no whole part
 *   just the state badge when the server gave no answer about extent
 *
 * DOCUMENTS come from `GET /library/me`, which is independent of the
 * storefront switch and of academic scope: what a student owns is always
 * listed.
 *
 * Nothing here opens a lesson or a document. Each course links to its portal
 * page (to see it, or to unlock more of it); documents are listed, not opened.
 */
export default function ActivationMyActivationsPage() {
  const { t } = useActivationT();
  const [tab, setTab] = React.useState<Tab>('courses');
  const courses = useActivationMyCourses();
  const documents = useActivationMyLibrary();

  const courseItems = React.useMemo(() => courses.data?.items ?? [], [courses.data]);
  const activeIds = React.useMemo(
    () => courseItems.filter((c) => c.access.state === 'ACTIVE').map((c) => c.id),
    [courseItems],
  );
  const extents = useCourseExtents(activeIds);
  const documentItems = documents.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t('act.nav.activations')}
        subtitle={t('act.mine.subtitle')}
        breadcrumbs={[{ href: activationRoutes.home, label: t('act.nav.home') }, { label: t('act.nav.activations') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'courses', label: t('act.mine.courses'), count: courses.data ? courseItems.length : undefined },
              { value: 'documents', label: t('act.mine.documents'), count: documents.data ? documentItems.length : undefined },
            ]}
          />

          <div className="mt-4">
            {tab === 'courses' ? (
              courses.isPending ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} height={96} />
                  ))}
                </div>
              ) : courses.isError ? (
                <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
              ) : courseItems.length === 0 ? (
                <div data-testid="mine-empty-courses">
                  <EmptyState title={t('act.mine.emptyCoursesTitle')} body={t('act.mine.emptyCoursesBody')} />
                  <div className="mt-4 flex justify-center">
                    <Link
                      href={activationRoutes.courses}
                      className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-fg transition hover:brightness-110"
                    >
                      {t('act.mine.browseCourses')}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {courseItems.map((course) => (
                      <CourseRow key={course.id} course={course} extent={extents[course.id]} />
                    ))}
                  </ul>
                  {courses.hasNextPage ? (
                    <div className="mt-5 flex justify-center">
                      <Button variant="secondary" onClick={() => void courses.fetchNextPage()} loading={courses.isFetchingNextPage}>
                        {t('common.seeAll')}
                      </Button>
                    </div>
                  ) : null}
                </>
              )
            ) : documents.isPending ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={72} />
                ))}
              </div>
            ) : documents.isError ? (
              <LibraryErrorState error={documents.error} context="browse" onRetry={() => void documents.refetch()} />
            ) : documentItems.length === 0 ? (
              <div data-testid="mine-empty-documents">
                <EmptyState title={t('act.mine.emptyDocsTitle')} body={t('act.mine.emptyDocsBody')} />
                <div className="mt-4 flex justify-center">
                  <Link
                    href={activationRoutes.library}
                    className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-fg transition hover:brightness-110"
                  >
                    {t('act.wallet.browseLibrary')}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {documentItems.map((item) => (
                    <DocumentRow key={item.entitlementId} item={item} />
                  ))}
                </ul>
                {documents.hasNextPage ? (
                  <div className="mt-5 flex justify-center">
                    <Button variant="secondary" onClick={() => void documents.fetchNextPage()} loading={documents.isFetchingNextPage}>
                      {t('common.seeAll')}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <OpenAppCard compact />
        </aside>
      </div>
    </>
  );

}

function CourseRow({ course, extent }: { course: CourseSummary; extent: CourseExtent | undefined }) {
  const { t, language } = useActivationT();
  const stateBadge = ACCESS_BADGE[course.access.state];
  const active = course.access.state === 'ACTIVE';
  const ownership =
    active && extent && !extent.loading
      ? courseOwnership({ accessState: course.access.state, fullCourseOwned: extent.fullCourseOwned, parts: extent.parts })
      : null;

  return (
    <li
      className="rounded-xl border border-border bg-surface p-4"
      data-testid="activation-course"
      data-ownership={ownership?.kind ?? (active ? 'loading' : 'none')}
    >
      <div className="flex items-start gap-3.5">
        <span className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-alt">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <GridIcon size={18} className="text-subtle" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={activationRoutes.course(course.id)} className="clamp-2 text-sm font-bold leading-snug hover:underline">
            {course.title}
          </Link>
          <p className="mt-0.5 truncate text-[13px] text-muted">{course.teacher.fullName}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {active && extent?.loading ? <Skeleton className="h-5 w-24" /> : null}
            {ownership?.kind === 'full' ? <Badge label={t('act.mine.full')} tone="success" /> : null}
            {ownership?.kind === 'parts' ? (
              <Badge label={t('act.mine.partsOf', { owned: formatNumber(ownership.owned.length, language), total: formatNumber(ownership.total, language) })} tone="warning" />
            ) : null}
            {ownership?.kind === 'sections' ? <Badge label={t('act.mine.partial')} tone="warning" /> : null}
            {/* The state badge alone when the extent is unknown or access is not live. */}
            {(!ownership || ownership.kind === 'unknown' || ownership.kind === 'none') && stateBadge && !(active && extent?.loading) ? (
              <Badge label={t(stateBadge.key)} tone={stateBadge.tone} />
            ) : null}
            {course.access.expiresAt ? (
              <span className="text-[12px] text-subtle">{t('access.expiresOn', { date: formatDate(course.access.expiresAt, language) })}</span>
            ) : null}
          </div>

          {ownership?.kind === 'parts' ? (
            <p className="mt-2 text-[13px] text-muted" data-testid="owned-parts">
              {ownership.owned.map((p) => localizedName({ name: p.title, nameAr: p.titleAr }, language)).join(language === 'ar' ? '، ' : ', ')}
            </p>
          ) : null}
        </div>
      </div>

      {ownership && (ownership.kind === 'parts' || ownership.kind === 'sections') ? (
        <div className="mt-3 flex justify-end border-t border-border pt-3">
          <Link
            href={activationRoutes.course(course.id)}
            className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold transition hover:bg-surface-alt"
          >
            {t('act.mine.unlockMore')}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function DocumentRow({ item }: { item: MyLibraryItem }) {
  const { t, language } = useActivationT();
  const readable = myLibraryStatus(item) === 'READABLE';
  return (
    <li
      className={cn('flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4', !readable && 'opacity-60')}
      data-testid="activation-document"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
        <FileIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="clamp-2 text-sm font-semibold leading-snug">{localizedName({ name: item.title, nameAr: item.titleAr }, language)}</div>
        <Link href={activationRoutes.material(item.materialId)} className="mt-0.5 block truncate text-[13px] text-muted hover:underline">
          {item.materialTitle}
        </Link>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge label={readable ? t('act.library.availableInApp') : t('library.withdrawn')} tone={readable ? 'success' : 'warning'} />
        {item.pageCount ? (
          <span className="text-[12px] text-subtle">{t('act.library.pages', { count: formatNumber(item.pageCount, language) })}</span>
        ) : null}
      </div>
    </li>
  );
}
