'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/core';
import { GridIcon } from '@/components/ui/icons';
import { ACCESS_BADGE } from '@/lib/course-access';
import { formatDuration, formatMoney, formatNumber } from '@/lib/format';
import type { CourseSummary } from '@/types/domain';

import { activationRoutes } from '../lib/routes';
import { useActivationT } from '../use-t';

/**
 * A course in the portal's catalogue.
 *
 * The same card as the learning website's — cover, title, instructor, lesson
 * count and duration, price, access state — so a student recognises their
 * courses at a glance. Two differences, both deliberate: it leads to the
 * portal's course page (information and activation), and it shows no learning
 * progress, because nothing is learned here.
 */
export function ActivationCourseCard({ course }: { course: CourseSummary }) {
  const { t, language } = useActivationT();
  const badge = ACCESS_BADGE[course.access.state];

  return (
    <Link
      href={activationRoutes.course(course.id)}
      data-testid="course-card"
      className="block w-full overflow-hidden rounded-xl border border-border bg-surface text-start transition hover:border-border-strong hover:shadow-md"
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
        <h3 className="clamp-2 text-sm font-semibold leading-snug">{course.title}</h3>
        <p className="mt-1 truncate text-xs text-muted">{course.teacher.fullName}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {formatNumber(course.lessonCount, language)} {t('lesson.lesson')} · {formatDuration(course.totalDurationSeconds, language)}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="min-w-0">
            {course.isFree ? (
              <Badge label={t('common.free')} tone="success" />
            ) : course.price && course.access.state === 'NOT_ENROLLED' ? (
              // A price on a course the student already holds reads as a
              // charge still owed; the access badge is what matters then.
              <span className="truncate text-sm font-bold text-primary-ink">{formatMoney(course.price, language)}</span>
            ) : null}
          </span>
          {badge ? <Badge label={t(badge.key)} tone={badge.tone} /> : null}
        </div>
      </div>
    </Link>
  );
}
