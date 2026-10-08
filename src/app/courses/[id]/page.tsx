'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { Avatar, Badge, Button, Card, CardTitle, KeyValue, ProgressBar, Segmented } from '@/components/ui/core';
import { AppShell, ErrorState, PageHeader, toUserMessage } from '@/components/ui/feedback';
import { Input, Sheet } from '@/components/ui/forms';
import { CheckIcon, ClockIcon, FileIcon, LayersIcon, LockIcon, PlayIcon, ShieldIcon, UserIcon } from '@/components/ui/icons';
import { SupportLinks } from '@/components/support/SupportLinks';
import { useCourse, useCourseParts, useEnroll, useJoinOptions, useRedeemCourseCode } from '@/features/api';
import { buildCurriculumGroups, type CurriculumGroup } from '@/features/curriculum';
import { ACCESS_BADGE, courseAccessFlags, joinLabel, joinSheetActions } from '@/lib/course-access';
import { formatCompact, formatDate, formatDuration, formatMoney, formatNumber, localizedName } from '@/lib/format';
import { useSession, useTranslation } from '@/lib/session-context';
import { cn } from '@/lib/utils';
import { toast } from '@/store/stores';
import type { AccessState, CourseDetail, CourseJoinOptions, LessonSummary } from '@/types/domain';

type Tab = 'overview' | 'content' | 'materials';

/**
 * Grouping now lives in `@/features/curriculum` — the lesson page needs the
 * identical grouping, and the two local copies had already drifted. It also
 * matches sections by id rather than by title, which is what makes a course
 * with two identically-titled sections render correctly.
 */

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, language } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('overview');
  const [joinOpen, setJoinOpen] = React.useState(false);
  const query = useCourse(id);
  const partsQuery = useCourseParts(id);
  const course = query.data;

  if (query.isLoading) {
    return (
      <AppShell>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div className="mb-6 h-8 w-1/3 animate-pulse rounded-lg bg-surface-alt" />
            <div className="aspect-video w-full animate-pulse rounded-xl bg-surface-alt" />
            <div className="mt-6 h-40 w-full animate-pulse rounded-xl bg-surface-alt" />
          </div>
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded-xl bg-surface-alt" />
            <div className="h-72 animate-pulse rounded-xl bg-surface-alt" />
          </div>
        </div>
      </AppShell>
    );
  }
  if (query.isError || !course) {
    return (
      <AppShell>
        <PageHeader title={t('courses.title')} back />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </AppShell>
    );
  }

  const flags = courseAccessFlags(course);
  const hasAccess = flags.hasAccess;
  const accessBadge = ACCESS_BADGE[course.access.state];

  const openLesson = (lesson: LessonSummary) => {
    if (lesson.locked && !lesson.isPreview) {
      toast.info(t('access.lockedBody'));
      setJoinOpen(flags.canJoin);
      return;
    }
    router.push(`/lessons/${lesson.id}`);
  };

  const continueLearning = () => {
    const target = course.progress?.lastLessonId ?? course.sections.find((s) => !s.locked)?.lessons[0]?.id;
    if (target) router.push(`/lessons/${target}`);
    else toast.info(t('courses.empty.sectionsBody'));
  };

  const groups = buildCurriculumGroups(
    course.sections,
    partsQuery.data?.hasParts ? partsQuery.data.parts : [],
    language
  );
  /** True when the course is actually divided into parts, not one synthetic group. */
  const hasParts = groups.length > 1 || groups.some((g) => g.title !== '');
  const currentLessonId = course.progress?.lastLessonId ?? null;

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <PageHeader
            title={course.title}
            subtitle={course.teacher.fullName}
            breadcrumbs={[
              { href: '/courses', label: t('tabs.courses') },
              { label: course.title },
            ]}
            meta={
              <>
                {course.university ? <Badge label={localizedName(course.university, language)} tone="info" /> : null}
                {course.academicYear ? <Badge label={localizedName(course.academicYear, language)} tone="primary" /> : null}
                {accessBadge ? <Badge label={t(accessBadge.key)} tone={accessBadge.tone} /> : null}
                <Badge label={formatDuration(course.totalDurationSeconds, language)} />
                {course.studentCount ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted">
                    <UserIcon size={15} />
                    {formatCompact(course.studentCount, language)}
                  </span>
                ) : null}
              </>
            }
          />

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

          <div className="mt-6">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'overview', label: t('courses.overview') },
                { value: 'content', label: t('courses.content') },
                { value: 'materials', label: t('courses.materials') },
              ]}
            />
          </div>

          <div className="mt-4">
            {tab === 'overview' ? (
              <div className="flex flex-col gap-4">
                <Card>
                  {course.shortDescription ? (
                    <p className="text-sm leading-relaxed text-muted">{course.shortDescription}</p>
                  ) : null}
                  <h3 className={cn('font-bold', course.shortDescription ? 'mt-5' : undefined)}>{t('courses.aboutCourse')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{course.description}</p>
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
                </Card>

                <p className="text-[13px] text-subtle">{t('courses.lastUpdated', { date: formatDate(course.updatedAt, language) })}</p>
              </div>
            ) : null}

            {tab === 'content' ? (
              course.sections.length === 0 ? (
                <Card>
                  <p className="py-6 text-center text-sm text-muted">{t('courses.empty.sectionsBody')}</p>
                </Card>
              ) : (
                /* Course -> Part -> section -> lesson. The gap between parts is
                   deliberately larger than the gap between sections inside one,
                   so the grouping is legible before any text is read. */
                <div className="flex flex-col gap-6">
                  {groups.map((group, index) => (
                    <PartBlock
                      key={group.key}
                      group={group}
                      index={index}
                      showHeader={hasParts}
                      currentLessonId={currentLessonId}
                      onOpenLesson={openLesson}
                    />
                  ))}
                </div>
              )
            ) : null}

            {tab === 'materials' ? (
              <Card padded={false}>
                {course.attachments.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted">{t('lesson.noAttachments')}</p>
                ) : (
                  course.attachments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        if (a.locked && !hasAccess) {
                          toast.info(t('access.lockedBody'));
                          setJoinOpen(flags.canJoin);
                          return;
                        }
                        router.push(`/viewer/${a.id}`);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-4 py-3 text-start text-sm transition-colors last:border-0 hover:bg-surface-alt"
                    >
                      <FileIcon size={17} className="shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      {a.locked && !hasAccess ? <LockIcon size={15} className="shrink-0 text-subtle" /> : null}
                    </button>
                  ))
                )}
              </Card>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <EnrollmentCard course={course} onJoin={() => setJoinOpen(true)} onContinue={continueLearning} />

          <Card>
            <CardTitle action={<span className="text-[13px] font-semibold text-muted">{formatNumber(course.lessonCount, language)}</span>}>
              {t('web.curriculum')}
            </CardTitle>
            {groups.length === 0 || groups.every((g) => g.sections.length === 0) ? (
              <p className="py-4 text-center text-[13px] text-muted">{t('courses.empty.sectionsBody')}</p>
            ) : (
              /* The narrow mirror of the content tab. Each part is a bordered
                 block with a numbered header, so the sidebar tells the same
                 Course -> Part -> lesson story as the main column instead of
                 running the parts together. */
              <div className="flex flex-col gap-2.5">
                {groups.map((g, gi) => (
                  <div
                    key={g.key}
                    className={cn(
                      hasParts && 'overflow-hidden rounded-xl border border-border bg-surface-alt/40'
                    )}
                  >
                    {hasParts ? (
                      <div className="flex items-center gap-2 border-b border-border bg-surface px-2.5 py-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-fg">
                          {formatNumber(gi + 1, language)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                          {g.title || t('web.curriculum')}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {g.owned ? <Badge label={t('library.owned')} tone="success" /> : null}
                          <span className="text-[13px] font-semibold text-subtle">
                            {formatNumber(g.lessonCount, language)}
                          </span>
                        </span>
                      </div>
                    ) : null}
                    <div className={cn('flex flex-col', hasParts && 'p-1')}>
                      {g.sections.map((s) => (
                        <div key={s.id} className="flex flex-col">
                          <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[13px] font-semibold text-foreground">
                            {s.locked ? <LockIcon size={14} className="shrink-0 text-subtle" /> : null}
                            <span className="min-w-0 flex-1 truncate">{s.title}</span>
                            <span className="shrink-0 text-subtle">{formatNumber(s.lessonCount, language)}</span>
                          </div>
                          {s.lessons.map((l) => (
                            <Link
                              key={l.id}
                              href={`/lessons/${l.id}`}
                              aria-current={l.id === currentLessonId ? 'page' : undefined}
                              onClick={(e) => {
                                if (l.locked && !l.isPreview) {
                                  e.preventDefault();
                                  openLesson(l);
                                }
                              }}
                              className={cn(
                                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-surface-alt',
                                l.id === currentLessonId && 'bg-primary-soft font-semibold text-primary-ink'
                              )}
                            >
                              <span className="w-4 shrink-0 text-center">
                                {l.progress?.completed ? (
                                  <CheckIcon size={14} className="text-success" />
                                ) : l.locked && !l.isPreview ? (
                                  <LockIcon size={13} className="text-subtle" />
                                ) : (
                                  <PlayIcon size={12} className="text-subtle" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{l.title}</span>
                              {l.isPreview ? <Badge label={t('courses.preview')} tone="info" /> : null}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>

      <JoinSheet courseId={course.id} open={joinOpen} onClose={() => setJoinOpen(false)} />
    </AppShell>
  );
}

/**
 * One part of the curriculum, as a self-contained block.
 *
 * The complaint this answers is that Part 1, Part 2 and Part 3 read as one
 * continuous list. Three things do the separating, and all three are needed:
 *
 *   * a header carrying the part NUMBER as a filled badge, so the eye can
 *     count parts without reading titles;
 *   * an outer card per part, so a part's sections are visibly inside it; and
 *   * a larger gap between parts than between the sections within one — the
 *     cheapest and most reliable grouping cue there is.
 *
 * `showHeader` is false for a course with no parts: inventing a "Part 1" for a
 * course that was never divided would be worse than the flat list.
 */
function PartBlock({
  group,
  index,
  showHeader,
  currentLessonId,
  onOpenLesson,
}: {
  group: CurriculumGroup;
  index: number;
  showHeader: boolean;
  currentLessonId: string | null;
  onOpenLesson: (lesson: LessonSummary) => void;
}) {
  const { t, language } = useTranslation();

  return (
    <section
      className={cn(
        showHeader && 'overflow-hidden rounded-2xl border border-border bg-surface-alt/40'
      )}
      aria-label={showHeader ? group.title || t('parts.partNumber', { index: index + 1 }) : undefined}
    >
      {showHeader ? (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-4 py-3">
          {/* The number is the anchor. Rendered as a solid badge rather than
              text so it survives a long Arabic title beside it. */}
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-fg">
            {formatNumber(index + 1, language)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t('parts.partNumber', { index: index + 1 })}
            </p>
            <h3 className="truncate text-sm font-bold">{group.title}</h3>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {group.owned ? <Badge label={t('parts.owned')} tone="success" /> : null}
            {!group.owned && group.locked ? <Badge label={t('parts.locked')} tone="warning" /> : null}
            <span className="text-[13px] font-semibold text-muted">
              {t('parts.lessonCount', { count: group.lessonCount })}
            </span>
          </span>
        </header>
      ) : null}

      {group.sections.length === 0 ? (
        <p className="px-4 py-5 text-center text-[13px] text-muted">{t('parts.emptyPart')}</p>
      ) : (
        /* Sections stack vertically inside the part, each its own card, so the
           third level of the hierarchy is still visible inside the second. */
        <div className={cn('flex flex-col gap-2.5', showHeader && 'p-3')}>
          {group.sections.map((section) => (
            <details
              key={section.id}
              className="overflow-hidden rounded-xl border border-border bg-surface"
              open={!section.locked}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-bold">
                {section.locked ? (
                  <LockIcon size={16} className="shrink-0 text-subtle" />
                ) : (
                  <PlayIcon size={16} className="shrink-0 text-primary-ink" />
                )}
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                <span className="shrink-0 text-[13px] font-normal text-muted">
                  {formatNumber(section.lessonCount, language)}
                </span>
              </summary>
              <div className="border-t border-border">
                {section.lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => onOpenLesson(lesson)}
                    aria-current={lesson.id === currentLessonId ? 'page' : undefined}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 text-start text-sm transition-colors last:border-0 hover:bg-surface-alt',
                      lesson.id === currentLessonId && 'bg-primary-soft font-semibold text-primary-ink'
                    )}
                  >
                    <span className="w-4 shrink-0 text-center">
                      {lesson.progress?.completed ? (
                        <CheckIcon size={15} className="text-success" />
                      ) : lesson.locked && !lesson.isPreview ? (
                        <LockIcon size={14} className="text-subtle" />
                      ) : (
                        <PlayIcon size={13} className="text-primary-ink" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                    {lesson.isPreview ? <Badge label={t('courses.preview')} tone="info" /> : null}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function Notice({
  tone,
  title,
  body,
  children,
}: {
  tone: 'neutral' | 'warning' | 'danger';
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const border =
    tone === 'danger' ? 'border-danger/40 bg-danger/10' : tone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-border bg-surface-alt';
  return (
    <div className={cn('rounded-lg border p-3.5 text-[13px]', border)}>
      <strong>{title}</strong>
      <p className="mt-1 text-muted">{body}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * The course's access panel. Same states, same order and same wording as the
 * mobile `AccessPanel`: archived, expired, revoked, pending approval, pending
 * payment, active, and finally the join button — whose label says "free" only
 * for a course that is free, and which is disabled when the server offers no
 * way in.
 */
function EnrollmentCard({
  course,
  onJoin,
  onContinue,
}: {
  course: CourseDetail;
  onJoin: () => void;
  onContinue: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useSession();
  const flags = courseAccessFlags(course);
  const label = joinLabel(course);
  const contact = (
    <SupportLinks
      channels={['whatsapp', 'email']}
      context={{ reason: 'access', courseTitle: course.title, fullName: user?.fullName, phone: user?.phone }}
    />
  );

  let action: React.ReactNode;
  if (flags.isArchived) {
    action = (
      <Notice tone="neutral" title={t('access.archivedTitle')} body={t('access.archivedBody')}>
        {contact}
      </Notice>
    );
  } else if (flags.isExpired) {
    action = (
      <Notice tone="danger" title={t('access.expiredTitle')} body={t('access.expiredBody')}>
        {course.access.availableMethods.length > 0 ? (
          <Button fullWidth variant="secondary" onClick={onJoin}>
            {t('access.joinNow')}
          </Button>
        ) : (
          contact
        )}
      </Notice>
    );
  } else if (flags.isRevoked) {
    action = (
      <Notice tone="danger" title={t('access.revoked')} body={t('access.expiredBody')}>
        {contact}
      </Notice>
    );
  } else if (course.access.state === 'PENDING_APPROVAL') {
    action = <Notice tone="warning" title={t('access.pendingTitle')} body={t('access.pendingBody')} />;
  } else if (course.access.state === 'PENDING_PAYMENT') {
    action = (
      <Notice tone="warning" title={t('access.paymentPendingTitle')} body={t('access.paymentPendingBody')}>
        <Button fullWidth variant="secondary" onClick={onJoin}>
          {t('access.joinNow')}
        </Button>
      </Notice>
    );
  } else if (flags.hasAccess) {
    const started = (course.progress?.percent ?? 0) > 0;
    action = (
      <Button fullWidth size="lg" onClick={onContinue}>
        <PlayIcon size={15} />
        {started ? t('courses.continueCourse') : t('courses.startCourse')}
      </Button>
    );
  } else {
    action = (
      <div className="flex flex-col gap-2">
        <Button fullWidth size="lg" onClick={onJoin} disabled={!flags.canJoin}>
          {label.kind === 'free'
            ? t('access.joinFree')
            : label.kind === 'buy'
              ? t('access.buyFor', { price: formatMoney(label.price, language) })
              : t('access.joinNow')}
        </Button>
        {!flags.canJoin ? <p className="text-center text-[12px] text-muted">{t('access.noMethods')}</p> : null}
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-subtle">
          <ShieldIcon size={13} />
          {t('security.protectedContentTitle')}
        </p>
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        {/*
          A student who holds the course is told what their access is worth in
          time, not money. Otherwise: "Free" only when the course is free, the
          price when there is one, and nothing at all for a paid course that
          has no current price — it is not free, it is just not on sale.
        */}
        {flags.hasAccess ? (
          <span className="text-[13px] font-semibold text-muted">
            {course.access.expiresAt
              ? t('access.expiresOn', { date: formatDate(course.access.expiresAt, language) })
              : t('access.lifetimeAccess')}
          </span>
        ) : course.isFree ? (
          <Badge label={t('common.free')} tone="success" />
        ) : course.price ? (
          <span className="text-xl font-bold tracking-tight">{formatMoney(course.price, language)}</span>
        ) : null}
      </div>

      <div className="mt-3">
        <KeyValue label={t('courses.content')}>{formatNumber(course.lessonCount, language)}</KeyValue>
        <KeyValue label={t('web.col.duration')}>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon size={14} className="text-subtle" />
            {formatDuration(course.totalDurationSeconds, language)}
          </span>
        </KeyValue>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-border pt-4">
        <Avatar name={course.teacher.fullName} uri={course.teacher.avatarUrl} size={36} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{course.teacher.fullName}</div>
          {course.teacher.title ? <div className="truncate text-[13px] text-muted">{course.teacher.title}</div> : null}
        </div>
      </div>

      {course.progress && flags.hasAccess ? (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 text-[13px] font-semibold text-muted">{t('courses.yourProgress')}</div>
          <ProgressBar percent={course.progress.percent} showLabel />
        </div>
      ) : null}

      <div className="mt-4">{action}</div>
    </Card>
  );
}

function JoinOption({
  title,
  subtitle,
  price,
  owned,
  selected,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  price: string | null;
  owned: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-lg border p-3', selected ? 'border-primary bg-primary-soft' : 'border-border bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold">{title}</span>
        {owned ? <Badge label={t('parts.owned')} tone="success" /> : price ? <span className="text-sm font-bold">{price}</span> : null}
      </div>
      {subtitle ? <p className="text-[13px] text-muted">{subtitle}</p> : null}
      {owned ? null : (
        <Button size="sm" variant={selected ? 'primary' : 'secondary'} onClick={onSelect}>
          {selected ? t('access.selected') : t('access.chooseThis')}
        </Button>
      )}
    </div>
  );
}

/**
 * The join sheet. It asks the server (`/join-options`) what the options and
 * mechanisms are, exactly as the mobile `JoinSheet` does: the whole course and
 * each part with their prices, then only the ways in the server permits. Online
 * payment is never offered — the platform sells courses with cash cards, not
 * cards online.
 */
function JoinSheet({ courseId, open, onClose }: { courseId: string; open: boolean; onClose: () => void }) {
  return <JoinSheetBody key={open ? 'open' : 'closed'} courseId={courseId} open={open} onClose={onClose} />;
}

function JoinSheetBody({ courseId, open, onClose }: { courseId: string; open: boolean; onClose: () => void }) {
  const { t, language } = useTranslation();
  const options = useJoinOptions(courseId, open);
  const enroll = useEnroll(courseId);
  const redeem = useRedeemCourseCode(courseId);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [intent, setIntent] = React.useState<string | null>(null);

  const data: CourseJoinOptions | undefined = options.data;

  const afterJoin = (state: AccessState) => {
    if (state === 'ACTIVE') toast.success(t('access.joinedBody'));
    else if (state === 'PENDING_APPROVAL') toast.info(t('access.pendingBody'));
    else if (state === 'PENDING_PAYMENT') toast.info(t('access.paymentPendingBody'));
    onClose();
  };

  const doEnroll = async (method: 'FREE' | 'ADMIN_APPROVAL') => {
    setError(null);
    try {
      const res = await enroll.mutateAsync(method);
      afterJoin(res.state);
    } catch (e) {
      setError(toUserMessage(e, t));
    }
  };

  const doRedeem = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) {
      setError(t('access.codeRequired'));
      return;
    }
    setError(null);
    try {
      const res = await redeem.mutateAsync(trimmed);
      afterJoin(res.state);
    } catch (e) {
      setError(toUserMessage(e, t));
    }
  };

  const actions = data ? joinSheetActions(data) : null;

  return (
    <Sheet open={open} onClose={onClose} title={t('access.joinTitle')}>
      {options.isLoading ? (
        <p className="py-8 text-center text-sm text-muted">{t('common.loading')}</p>
      ) : options.isError || !data || !actions ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} compact />
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-sm font-semibold">{localizedName({ name: data.title, nameAr: data.titleAr }, language)}</p>
          <p className="text-sm text-muted">{t('access.joinIntro')}</p>

          <JoinOption
            title={t('access.fullCourse')}
            subtitle={t('access.fullCourseBody')}
            price={
              data.fullCourse.isFree
                ? t('access.free')
                : data.fullCourse.price === null
                  ? null
                  : formatMoney({ amount: data.fullCourse.price, currency: data.fullCourse.currency }, language)
            }
            owned={data.fullCourse.owned}
            selected={intent === 'FULL'}
            onSelect={() => setIntent('FULL')}
          />

          {data.hasParts ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-muted">{t('access.orOnePart')}</p>
              {data.parts.map((part) => (
                <JoinOption
                  key={part.id}
                  title={localizedName({ name: part.title, nameAr: part.titleAr }, language)}
                  subtitle={t('parts.sectionCount', { count: part.sectionCount })}
                  price={part.price === null ? null : formatMoney({ amount: part.price, currency: part.currency }, language)}
                  owned={part.owned}
                  selected={intent === part.id}
                  onSelect={() => setIntent(part.id)}
                />
              ))}
            </div>
          ) : null}

          {actions.free ? (
            <Button fullWidth onClick={() => void doEnroll('FREE')} loading={enroll.isPending}>
              {t('access.joinFree')}
            </Button>
          ) : null}
          {actions.approval ? (
            <Button fullWidth variant="secondary" onClick={() => void doEnroll('ADMIN_APPROVAL')} loading={enroll.isPending}>
              {t('access.requestApproval')}
            </Button>
          ) : null}

          {actions.code ? (
            <div className="rounded-lg border border-border bg-surface-alt/60 p-3">
              <p className="text-sm font-semibold">{t('access.methodCode')}</p>
              <p className="mb-2 mt-1 text-[13px] text-muted">
                {intent === 'FULL' ? t('access.cardHintFullCourse') : intent ? t('access.cardHintPart') : t('access.cardHintGeneric')}
              </p>
              <Input
                label={t('access.codeLabel')}
                placeholder={t('access.codePlaceholder')}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                disabled={redeem.isPending}
                autoComplete="off"
                dir="ltr"
              />
              <Button fullWidth className="mt-2" loading={redeem.isPending} onClick={() => void doRedeem()}>
                {t('access.redeem')}
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {actions.none ? <p className="rounded-lg border border-border p-3 text-sm text-muted">{t('access.noMethods')}</p> : null}
        </div>
      )}
    </Sheet>
  );
}
