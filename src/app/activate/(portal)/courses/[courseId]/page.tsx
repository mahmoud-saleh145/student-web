'use client';

import { useParams } from 'next/navigation';
import * as React from 'react';

import { useActivationCourse, useActivationCourseParts, useActivationJoinOptions } from '@/activation/api';
import { CourseActivationCard } from '@/activation/components/CourseActivationCard';
import { OpenAppCard } from '@/activation/components/OpenAppCard';
import { buildSnapshot, courseOwnership } from '@/activation/lib/ownership';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationT } from '@/activation/use-t';
import { Avatar, Badge, Card, CardTitle, KeyValue, Segmented } from '@/components/ui/core';
import { ErrorState, PageHeader } from '@/components/ui/feedback';
import { CheckIcon, ClockIcon, FileIcon, LayersIcon, LockIcon } from '@/components/ui/icons';
import { buildCurriculumGroups, type CurriculumGroup } from '@/features/curriculum';
import { ACCESS_BADGE } from '@/lib/course-access';
import { formatDate, formatDuration, formatMoney, formatNumber, localizedName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CoursePart, LessonKind } from '@/types/domain';

type Tab = 'overview' | 'content' | 'materials';

const KIND_KEY: Record<LessonKind, string> = {
  VIDEO: 'act.course.video',
  DOCUMENT: 'act.course.document',
  QUIZ: 'act.course.quiz',
  LIVE: 'act.course.live',
};

/**
 * A course, as information and as something to activate.
 *
 * The same page a student knows from the learning website — cover, instructor,
 * description, outcomes, the curriculum grouped Part → section → lesson, the
 * files, the price — with one structural difference: NOTHING HERE OPENS
 * CONTENT.
 *
 *   - Lessons are rows of text. They are not links or buttons, there is no
 *     player, and this page never asks for a lesson, a video or a playback
 *     ticket (the portal's proxy would refuse it if it did).
 *   - Files are names. There is no viewer and no download.
 *   - A free-preview lesson is labelled as one, and that is all: previews are
 *     watched in the app.
 *
 * What the page adds is the activation panel beside it (`CourseActivationCard`)
 * and an honest statement of what the student already owns.
 */
export default function ActivationCoursePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const { t, language } = useActivationT();
  const [tab, setTab] = React.useState<Tab>('overview');

  const query = useActivationCourse(courseId);
  const partsQuery = useActivationCourseParts(courseId);
  const joinQuery = useActivationJoinOptions(courseId, query.isSuccess);
  const course = query.data;

  if (query.isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-6 h-8 w-1/3 animate-pulse rounded-lg bg-surface-alt" />
          <div className="aspect-video w-full animate-pulse rounded-xl bg-surface-alt" />
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-surface-alt" />
      </div>
    );
  }

  if (query.isError || !course) {
    return (
      <>
        <PageHeader
          title={t('courses.title')}
          breadcrumbs={[{ href: activationRoutes.courses, label: t('tabs.courses') }, { label: '…' }]}
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const partsData = joinQuery.data?.hasParts ? joinQuery.data.parts : partsQuery.data?.hasParts ? partsQuery.data.parts : [];
  const groups = buildCurriculumGroups(course.sections, partsData, language);
  const hasParts = groups.length > 1 || groups.some((g) => g.title !== '');
  const accessBadge = ACCESS_BADGE[course.access.state];
  const ownership = courseOwnership(buildSnapshot({ course, parts: partsQuery.data, joinOptions: joinQuery.data }));
  const fullPrice = joinQuery.data?.fullCourse ?? null;

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={course.teacher.fullName}
        breadcrumbs={[{ href: activationRoutes.courses, label: t('tabs.courses') }, { label: course.title }]}
        meta={
          <>
            {course.university ? <Badge label={localizedName(course.university, language)} tone="info" /> : null}
            {course.academicYear ? <Badge label={localizedName(course.academicYear, language)} tone="primary" /> : null}
            {accessBadge ? <Badge label={t(accessBadge.key)} tone={accessBadge.tone} /> : null}
            <Badge label={formatDuration(course.totalDurationSeconds, language)} />
          </>
        }
      />

      {/* Mobile order: cover, activation, details. From `lg`: details on the
          left, activation pinned on the right across both rows. The first
          row is sized by the cover alone (`auto`), so a tall activation
          column cannot open a gap between the cover and the tabs. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-alt">
            {course.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-surface text-subtle">
                <LayersIcon size={26} />
              </span>
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          <CourseActivationCard
            course={course}
            parts={partsQuery.data}
            joinOptions={joinQuery.data}
            joinOptionsError={joinQuery.error}
            joinOptionsLoading={joinQuery.isPending && query.isSuccess}
          />

          {ownership.kind !== 'none' ? <OpenAppCard compact /> : null}

          <Card>
            <CardTitle>{t('act.course.pricesTitle')}</CardTitle>
            <KeyValue label={t('act.course.fullPrice')}>
              <span data-testid="full-course-price">
                {course.isFree || fullPrice?.isFree
                  ? t('common.free')
                  : fullPrice && fullPrice.price !== null
                    ? formatMoney({ amount: fullPrice.price, currency: fullPrice.currency }, language)
                    : course.price
                      ? formatMoney(course.price, language)
                      : t('act.course.priceUnset')}
              </span>
            </KeyValue>
            <KeyValue label={t('courses.content')}>
              {t('act.course.lessons', { count: formatNumber(course.lessonCount, language) })}
            </KeyValue>
            <KeyValue label={t('web.col.duration')}>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={14} className="text-subtle" />
                {formatDuration(course.totalDurationSeconds, language)}
              </span>
            </KeyValue>

            {partsData.length > 0 ? (
              <div className="mt-4 border-t border-border pt-4" data-testid="part-prices">
                <p className="mb-2 text-[13px] font-bold">{t('act.course.includedParts')}</p>
                <ul className="flex flex-col gap-2">
                  {partsData.map((part) => (
                    <PartPriceRow key={part.id} part={part} />
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: t('courses.overview') },
              { value: 'content', label: t('act.course.outline') },
              { value: 'materials', label: t('act.course.files') },
            ]}
          />

          <div className="mt-4">
            {tab === 'overview' ? (
              <div className="flex flex-col gap-4">
                <Card>
                  {course.shortDescription ? <p className="text-sm leading-relaxed text-muted">{course.shortDescription}</p> : null}
                  <h3 className={cn('font-bold', course.shortDescription ? 'mt-5' : undefined)}>{t('courses.aboutCourse')}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{course.description}</p>
                </Card>

                {course.outcomes.length > 0 ? (
                  <Card>
                    <h3 className="text-[15px] font-bold">{t('courses.whatYouLearn')}</h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {course.outcomes.map((o) => (
                        <li key={o} className="flex items-start gap-2.5 text-sm text-muted">
                          <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink">
                            <CheckIcon size={12} />
                          </span>
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}

                {course.requirements.length > 0 ? (
                  <Card>
                    <h3 className="text-[15px] font-bold">{t('courses.requirements')}</h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {course.requirements.map((r) => (
                        <li key={r} className="flex items-start gap-2.5 text-sm text-muted">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}

                <Card>
                  <h3 className="text-[15px] font-bold">{t('courses.instructor')}</h3>
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar name={course.teacher.fullName} uri={course.teacher.avatarUrl} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{course.teacher.fullName}</div>
                      {course.teacher.title ? <div className="truncate text-[13px] text-muted">{course.teacher.title}</div> : null}
                    </div>
                  </div>
                  {course.teacher.bio ? <p className="mt-3 text-[13px] leading-relaxed text-muted">{course.teacher.bio}</p> : null}
                </Card>

                <p className="text-[13px] text-subtle">{t('courses.lastUpdated', { date: formatDate(course.updatedAt, language) })}</p>
              </div>
            ) : null}

            {tab === 'content' ? (
              <div data-testid="course-outline">
                <p className="mb-3 text-[13px] text-muted">{t('act.course.outlineNote')}</p>
                {!hasParts && course.sections.length === 0 ? (
                  <Card>
                    <p className="py-6 text-center text-sm text-muted">{t('courses.empty.sectionsBody')}</p>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-6">
                    {groups.map((group, index) => (
                      <OutlinePart key={group.key} group={group} index={index} showHeader={hasParts} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {tab === 'materials' ? (
              <div data-testid="course-files">
                <p className="mb-3 text-[13px] text-muted">{t('act.course.materialsNote')}</p>
                <Card padded={false}>
                  {course.attachments.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t('lesson.noAttachments')}</p>
                  ) : (
                    <ul>
                      {course.attachments.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
                          <FileIcon size={17} className="shrink-0 text-subtle" />
                          <span className="min-w-0 flex-1 truncate">{a.title}</span>
                          <span className="shrink-0 text-[12px] text-subtle">{t('act.course.inAppOnly')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** One part with its price and whether the student holds it. */
function PartPriceRow({ part }: { part: CoursePart }) {
  const { t, language } = useActivationT();
  const owned = part.owned === true;
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5',
        owned ? 'border-success/40 bg-success/5' : 'border-border bg-surface',
      )}
      data-testid="part-row"
      data-owned={owned ? 'true' : 'false'}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{localizedName({ name: part.title, nameAr: part.titleAr }, language)}</span>
        <span className="block text-[12px] text-muted">{t('act.course.sections', { count: formatNumber(part.sectionCount, language) })}</span>
      </span>
      {owned ? (
        <Badge label={part.ownedVia === 'FULL_COURSE' ? t('act.own.partViaFull') : t('act.own.partOwned')} tone="success" />
      ) : (
        <span className="shrink-0 text-[13px] font-bold">
          {part.price === null ? '—' : formatMoney({ amount: part.price, currency: part.currency }, language)}
        </span>
      )}
    </li>
  );
}

/**
 * One part of the outline. The learning website's part block, minus every
 * control: sections are plain disclosure rows and lessons are plain text.
 */
function OutlinePart({ group, index, showHeader }: { group: CurriculumGroup; index: number; showHeader: boolean }) {
  const { t, language } = useActivationT();

  return (
    <section className={cn(showHeader && 'overflow-hidden rounded-2xl border border-border bg-surface-alt/40')}>
      {showHeader ? (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-4 py-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-fg">
            {formatNumber(index + 1, language)}
          </span>
          <div className="min-w-0 flex-1">
            {group.unassigned ? (
              <h3 className="truncate text-sm font-bold">{t('parts.otherSections')}</h3>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('parts.partNumber', { index: index + 1 })}</p>
                <h3 className="truncate text-sm font-bold">{group.title}</h3>
              </>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {group.owned ? <Badge label={t('parts.owned')} tone="success" /> : null}
            {!group.owned && group.locked ? <Badge label={t('parts.locked')} tone="warning" /> : null}
            <span className="text-[13px] font-semibold text-muted">{t('parts.lessonCount', { count: group.lessonCount })}</span>
          </span>
        </header>
      ) : null}

      {group.sections.length === 0 ? (
        <p className="px-4 py-5 text-center text-[13px] text-muted">{t('parts.emptyPart')}</p>
      ) : (
        <div className={cn('flex flex-col gap-2.5', showHeader && 'p-3')}>
          {group.sections.map((section) => (
            <details key={section.id} className="overflow-hidden rounded-xl border border-border bg-surface" data-testid="outline-section">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-bold">
                {section.locked ? (
                  <LockIcon size={16} className="shrink-0 text-subtle" />
                ) : (
                  <CheckIcon size={16} className="shrink-0 text-success" />
                )}
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                <span className="shrink-0 text-[12px] font-semibold text-muted">
                  {section.locked ? t('act.own.sectionLocked') : t('act.own.sectionOpen')}
                </span>
                <span className="shrink-0 text-[13px] font-normal text-muted">{formatNumber(section.lessonCount, language)}</span>
              </summary>
              <ul className="border-t border-border">
                {section.lessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0"
                    data-testid="outline-lesson"
                  >
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                    {lesson.isPreview ? <Badge label={t('courses.preview')} tone="info" /> : null}
                    <span className="shrink-0 text-[12px] text-subtle">
                      {t(KIND_KEY[lesson.kind] ?? 'act.course.video')}
                      {lesson.durationSeconds > 0 ? ` · ${formatDuration(lesson.durationSeconds, language)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
