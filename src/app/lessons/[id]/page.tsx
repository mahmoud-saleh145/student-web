'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { Badge, Button, Card, CardTitle } from '@/components/ui/core';
import { AppShell, ErrorState, PageHeader } from '@/components/ui/feedback';
import { CheckCircleIcon, CheckIcon, ChevronRightIcon, ClockIcon, FileIcon, LockIcon, PlayIcon, TrendingUpIcon } from '@/components/ui/icons';
import { useCourse, useCourseParts, useLesson, useMarkLessonComplete } from '@/features/api';
import { formatDuration, formatNumber, formatTimecode, localizedName } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import { cn } from '@/lib/utils';
import type { Language } from '@/i18n/dictionaries';
import type { CoursePart, CourseSection, LessonSummary } from '@/types/domain';

interface OutlineGroup {
  key: string;
  title: string;
  sections: CourseSection[];
}

function buildGroups(sections: CourseSection[], parts: CoursePart[], language: Language): OutlineGroup[] {
  if (parts.length === 0) return [{ key: 'all', title: '', sections }];
  const byTitle = new Map(sections.map((s) => [s.title, s]));
  const groups: OutlineGroup[] = parts.map((p) => ({
    key: p.id,
    title: localizedName({ name: p.title, nameAr: p.titleAr }, language),
    sections: p.sections
      .map((ps) => byTitle.get(ps.title))
      .filter((s): s is CourseSection => !!s),
  }));
  const matched = groups.reduce((n, g) => n + g.sections.length, 0);
  return matched === 0 ? [{ key: 'all', title: '', sections }] : groups;
}

export default function LessonPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, language } = useTranslation();
  const router = useRouter();
  const query = useLesson(id);
  const lesson = query.data;
  const markComplete = useMarkLessonComplete(id ?? '', lesson?.courseId);
  const courseQuery = useCourse(lesson?.courseId);
  const partsQuery = useCourseParts(lesson?.courseId);

  if (query.isLoading) {
    return (
      <AppShell>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-6 h-8 w-2/3 animate-pulse rounded-lg bg-surface-alt" />
            <div className="aspect-video w-full animate-pulse rounded-xl bg-surface-alt" />
            <div className="mt-4 h-40 w-full animate-pulse rounded-xl bg-surface-alt" />
          </div>
          <div className="h-80 animate-pulse rounded-xl bg-surface-alt" />
        </div>
      </AppShell>
    );
  }
  if (query.isError || !lesson) {
    return (
      <AppShell>
        <PageHeader title={t('lesson.lesson')} back />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </AppShell>
    );
  }

  const video = lesson.video;
  const progress = lesson.progress;
  const notReady = video?.status === 'UPLOADING' || video?.status === 'QUEUED' || video?.status === 'PROCESSING';
  const unavailable = video?.status === 'FAILED' || video?.status === 'ARCHIVED';
  const resumable = !!progress && progress.positionSeconds > 5 && !progress.completed;
  const courseTitle = courseQuery.data?.title ?? '';
  const groups = buildGroups(
    courseQuery.data?.sections ?? [],
    partsQuery.data?.hasParts ? partsQuery.data.parts : [],
    language
  );

  const outlineRow = (l: LessonSummary) => {
    const locked = l.locked && !l.isPreview;
    const inner = (
      <>
        <span className="w-4 shrink-0 text-center">
          {l.progress?.completed ? (
            <CheckIcon size={14} className="text-success" />
          ) : locked ? (
            <LockIcon size={13} className="text-subtle" />
          ) : (
            <PlayIcon size={12} className="text-subtle" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{l.title}</span>
      </>
    );
    const className = cn(
      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
      l.id === lesson.id ? 'bg-primary-soft font-semibold text-primary-ink' : 'text-muted hover:bg-surface-alt'
    );
    return locked ? (
      <span key={l.id} className={cn(className, 'cursor-not-allowed')}>
        {inner}
      </span>
    ) : (
      <Link key={l.id} href={`/lessons/${l.id}`} aria-current={l.id === lesson.id ? 'page' : undefined} className={className}>
        {inner}
      </Link>
    );
  };

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <PageHeader
            title={lesson.title}
            subtitle={courseTitle || t('lesson.lesson')}
            breadcrumbs={[
              { href: '/my-courses', label: t('tabs.myCourses') },
              ...(courseTitle ? [{ href: `/courses/${lesson.courseId}`, label: courseTitle }] : []),
              { label: lesson.title },
            ]}
            meta={
              <>
                <Badge label={lesson.kind} />
                <Badge label={formatDuration(lesson.durationSeconds, language)} />
                {progress?.completed ? <Badge label={t('lesson.completed')} tone="success" /> : null}
                {lesson.isPreview ? <Badge label={t('courses.preview')} tone="info" /> : null}
              </>
            }
          />

          <div className="flex flex-col gap-4">
            {video ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-black text-white">
                {notReady ? (
                  <>
                    <ClockIcon size={30} />
                    <p className="font-bold">{t('player.notReadyTitle')}</p>
                    <p className="max-w-md px-8 text-center text-sm text-white/70">{t('player.notReadyBody')}</p>
                  </>
                ) : unavailable ? (
                  <p className="px-8 text-center text-sm font-bold">{t('errors.genericBody')}</p>
                ) : (
                  <Button size="lg" onClick={() => router.push(`/player/${video.id}`)}>
                    <PlayIcon size={18} />
                    {t('lesson.watchNow')}
                  </Button>
                )}
                {resumable ? (
                  <span className="text-[13px] font-semibold text-white/80" dir="ltr">
                    {formatTimecode(progress.positionSeconds)}
                  </span>
                ) : null}
                {progress && progress.percent > 0 ? (
                  <div className="h-1 w-full self-end rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <Card>
              <h2 className="text-[15px] font-bold">{t('lesson.aboutLesson')}</h2>
              {lesson.description ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{lesson.description}</p>
              ) : null}
            </Card>

            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', progress?.completed ? 'bg-success/10 text-success' : 'bg-primary-soft text-primary-ink')}>
                  {progress?.completed ? <CheckCircleIcon size={20} /> : <TrendingUpIcon size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{progress?.completed ? t('lesson.completed') : t('progress.inProgress')}</div>
                  {progress && progress.percent > 0 ? (
                    <div className="mt-0.5 text-[13px] text-muted" dir="ltr">
                      {formatTimecode(progress.positionSeconds)} / {formatTimecode(progress.durationSeconds)}
                    </div>
                  ) : null}
                </div>
                {lesson.completionRule.type === 'MANUAL' && !progress?.completed ? (
                  <Button size="sm" variant="secondary" loading={markComplete.isPending} onClick={() => markComplete.mutate()}>
                    {t('lesson.markComplete')}
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardTitle>{t('lesson.attachments')}</CardTitle>
              {lesson.attachments.length === 0 ? (
                <p className="text-sm text-muted">{t('lesson.noAttachments')}</p>
              ) : (
                <div className="flex flex-col">
                  {lesson.attachments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => router.push(`/viewer/${a.id}`)}
                      className="flex w-full cursor-pointer items-center gap-3 border-t border-border py-2.5 text-start text-sm transition-colors first:border-0 hover:bg-surface-alt"
                    >
                      <FileIcon size={17} className="shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      {a.locked ? <LockIcon size={15} className="shrink-0 text-subtle" /> : null}
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                {lesson.previousLessonId ? (
                  <Button variant="secondary" fullWidth onClick={() => router.replace(`/lessons/${lesson.previousLessonId}`)}>
                    <ChevronRightIcon size={16} className={language === 'en' ? 'rotate-180' : undefined} />
                    {t('lesson.previousLesson')}
                  </Button>
                ) : null}
              </div>
              <div className="flex-1">
                {lesson.nextLessonId ? (
                  <Button fullWidth onClick={() => router.replace(`/lessons/${lesson.nextLessonId}`)}>
                    {t('lesson.nextLesson')}
                    <ChevronRightIcon size={16} />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardTitle>{t('web.curriculum')}</CardTitle>
            {groups.every((g) => g.sections.length === 0) ? (
              <p className="py-4 text-center text-[13px] text-muted">{t('courses.empty.sectionsBody')}</p>
            ) : (
              <div className="-mx-1 flex flex-col">
                {groups.map((g, gi) => (
                  <div key={g.key} className={cn('px-1', gi > 0 && 'mt-3')}>
                    <div className="mb-1.5 truncate text-[13px] font-bold uppercase tracking-wider text-muted">
                      {g.title || t('web.curriculum')}
                    </div>
                    <div className="flex flex-col">
                      {g.sections.map((s) => (
                        <div key={s.id} className="flex flex-col">
                          <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[13px] font-semibold">
                            {s.locked ? <LockIcon size={14} className="shrink-0 text-subtle" /> : null}
                            <span className="min-w-0 flex-1 truncate">{s.title}</span>
                            <span className="shrink-0 text-subtle">{formatNumber(s.lessonCount, language)}</span>
                          </div>
                          {s.lessons.map(outlineRow)}
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
    </AppShell>
  );
}