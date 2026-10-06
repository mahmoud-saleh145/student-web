'use client';

import { useRouter } from 'next/navigation';

import { Badge, ProgressBar } from '@/components/ui/core';
import { GridIcon } from '@/components/ui/icons';
import { formatDuration, formatMoney, localizedName } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import { ACCESS_BADGE } from '@/lib/course-access';
import { cn } from '@/lib/utils';
import type { AccessState, CourseSummary } from '@/types/domain';

type TFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * The access badge, with the mobile card's labels. Every state has a
 * translated label — EXPIRED, REVOKED and ARCHIVED used to print the raw enum.
 */
export function accessBadgeMeta(state: AccessState, t: TFn): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } | null {
  const meta = ACCESS_BADGE[state];
  return meta ? { label: t(meta.key), tone: meta.tone } : null;
}

export function CourseCard({ course, layout = 'grid' }: { course: CourseSummary; layout?: 'grid' | 'rail' }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const title = localizedName({ name: course.title, nameAr: null }, language);
  const access = accessBadgeMeta(course.access.state, t);

  return (
    <button
      type="button"
      onClick={() => router.push(`/courses/${course.id}`)}
      className={cn(
        'block cursor-pointer overflow-hidden rounded-xl border border-border bg-surface text-start transition hover:border-border-strong hover:shadow-md',
        layout === 'rail' ? 'w-[260px] shrink-0' : 'w-full'
      )}
    >
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-alt">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <GridIcon size={26} className="text-subtle" />
        )}
      </div>
      <div className="p-4">
        <h3 className="clamp-2 text-sm font-semibold leading-snug">{title}</h3>
        <p className="mt-1 truncate text-xs text-muted">
          {course.teacher.fullName} · {course.lessonCount} {t('lesson.lesson')} ·{' '}
          {formatDuration(course.totalDurationSeconds, language)}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="min-w-0">
            {course.isFree ? (
              <Badge label={t('common.free')} tone="success" />
            ) : course.price && course.access.state === 'NOT_ENROLLED' ? (
              // A price tag on a course the student already owns reads as a
              // charge they still have to pay. The mobile card drops it on
              // enrolment for the same reason; the access badge beside it is
              // what matters once they are in.
              <span className="truncate text-sm font-bold text-primary-ink">{formatMoney(course.price, language)}</span>
            ) : null}
          </span>
          {access ? <Badge label={access.label} tone={access.tone} /> : null}
        </div>
        {course.progress && course.access.state === 'ACTIVE' ? (
          <ProgressBar percent={course.progress.percent} className="mt-3" />
        ) : null}
      </div>
    </button>
  );
}