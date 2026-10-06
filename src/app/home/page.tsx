'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { CourseCard } from '@/components/courses/CourseCard';
import { Badge, Card, CardTitle, ProgressBar, Stat } from '@/components/ui/core';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import {
  ArrowRightIcon,
  BellIcon,
  BookIcon,
  ChevronRightIcon,
  GridIcon,
  LayersIcon,
  LifeBuoyIcon,
  SearchIcon,
  SettingsIcon,
  WalletIcon,
} from '@/components/ui/icons';
import { SectionHeading } from '@/components/ui/table';
import { useHomeFeed, useUnreadCount } from '@/features/api';
import { toWebRoute } from '@/lib/routes';
import { formatCompact, formatDate, formatDuration } from '@/lib/format';
import { useSession, useTranslation } from '@/lib/session-context';
import type { ContinueWatchingItem } from '@/types/domain';

const QUICK_LINKS: { href: string; labelKey: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { href: '/search', labelKey: 'tabs.search', icon: SearchIcon },
  { href: '/courses', labelKey: 'tabs.courses', icon: GridIcon },
  { href: '/my-courses', labelKey: 'tabs.myCourses', icon: LayersIcon },
  { href: '/library', labelKey: 'library.title', icon: BookIcon },
  { href: '/wallet', labelKey: 'wallet.title', icon: WalletIcon },
  { href: '/support', labelKey: 'support.title', icon: LifeBuoyIcon },
  { href: '/settings', labelKey: 'settings.title', icon: SettingsIcon },
  { href: '/notifications', labelKey: 'tabs.notifications', icon: BellIcon },
];

function SeeAllLink({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-semibold text-primary-ink transition hover:underline"
    >
      {t('common.seeAll')}
      <ArrowRightIcon size={14} />
    </Link>
  );
}

function ContinueTile({ item }: { item: ContinueWatchingItem }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/lessons/${item.lesson.id}`)}
      className="block w-[260px] shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-surface text-start transition hover:border-border-strong hover:shadow-md"
    >
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-alt">
        {item.course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.course.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <GridIcon size={26} className="text-subtle" />
        )}
      </div>
      <div className="p-4">
        <p className="clamp-1 text-sm font-semibold leading-snug">{item.lesson.title}</p>
        <p className="mt-1 truncate text-xs text-muted">{item.course.title}</p>
        <ProgressBar percent={item.progress.percent} showLabel className="mt-3" />
      </div>
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 border-b border-border pb-5">
        <div className="h-8 w-1/3 rounded-lg bg-surface-alt" />
        <div className="mt-3 h-5 w-24 rounded-lg bg-surface-alt" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <div className="h-64 rounded-xl bg-surface-alt" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 rounded-xl bg-surface-alt" />
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="h-40 rounded-xl bg-surface-alt" />
          <div className="h-56 rounded-xl bg-surface-alt" />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { t, language } = useTranslation();
  const { user, status } = useSession();
  const router = useRouter();
  const feed = useHomeFeed();
  const unread = useUnreadCount(status === 'authenticated');

  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || feed.isLoading) {
    return (
      <AppShell>
        <HomeSkeleton />
      </AppShell>
    );
  }

  if (feed.isError) {
    return (
      <AppShell>
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      </AppShell>
    );
  }

  const data = feed.data;
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'home.greetingMorning' : hour < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening', {
    name: user?.fullName.split(' ')[0] ?? '',
  });

  const continueList = data?.continueWatching ?? [];
  const myCourses = data?.myCourses ?? [];
  const recommended = data?.recommended ?? [];
  const newCourses = data?.newCourses ?? [];
  const announcements = data?.announcements ?? [];
  const banners = announcements.filter((n) => Boolean(n.imageUrl));

  const hasNothing =
    !data ||
    (continueList.length === 0 && myCourses.length === 0 && newCourses.length === 0 && recommended.length === 0);

  return (
    <AppShell unread={unread.data?.count ?? 0}>
      <PageHeader
        title={greeting}
        meta={
          data ? (
            <>
              <Badge label={`${t('home.stats.courses')}: ${formatCompact(data.stats.enrolledCourses, language)}`} tone="primary" />
              <Badge label={`${t('home.stats.lessons')}: ${formatCompact(data.stats.completedLessons, language)}`} tone="success" />
              <Badge label={`${t('home.stats.streak')}: ${formatCompact(data.stats.streakDays, language)}`} tone="warning" />
            </>
          ) : null
        }
      />

      {/*
        The mobile home opens with a banner strip: every announcement that
        carries an image, opening its route on tap (features/ads). Same source,
        same order, same destinations.
      */}
      {banners.length > 0 ? (
        <div className="mb-6 flex snap-x gap-4 overflow-x-auto pb-2">
          {banners.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => (n.route ? router.push(toWebRoute(n.route, '/notifications')) : undefined)}
              className="relative aspect-[21/9] w-[min(560px,85vw)] shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl border border-border bg-surface-alt text-start"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.imageUrl ?? ''} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 text-sm font-semibold text-white">
                {n.title}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {continueList.length > 0 ? (
            <section>
              <SectionHeading title={t('home.continueWatching')} action={<SeeAllLink href="/my-courses" />} />
              <div className="flex gap-4 overflow-x-auto pb-2">
                {continueList.slice(0, 8).map((item) => (
                  <ContinueTile key={item.lesson.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          {myCourses.length > 0 ? (
            <section>
              <SectionHeading title={t('home.myCourses')} action={<SeeAllLink href="/my-courses" />} />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {myCourses.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            </section>
          ) : null}

          {recommended.length > 0 ? (
            <section>
              <SectionHeading title={t('home.recommended')} action={<SeeAllLink href="/courses" />} />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recommended.slice(0, 6).map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            </section>
          ) : null}

          {newCourses.length > 0 ? (
            <section>
              <SectionHeading title={t('home.newCourses')} action={<SeeAllLink href="/courses" />} />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {newCourses.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            </section>
          ) : null}

          {hasNothing ? (
            <EmptyState
              title={t('home.noCoursesTitle')}
              body={t('home.noCoursesBody')}
              actionLabel={t('home.browseCourses')}
              onAction={() => router.push('/courses')}
            />
          ) : null}
        </div>

        <aside className="space-y-5">
          {data ? (
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">{t('web.overview')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('home.stats.courses')} value={formatCompact(data.stats.enrolledCourses, language)} tone="primary" />
                <Stat label={t('home.stats.lessons')} value={formatCompact(data.stats.completedLessons, language)} tone="success" />
                <Stat label={t('home.stats.watchTime')} value={formatDuration(data.stats.watchTimeSeconds, language)} />
                <Stat label={t('home.stats.streak')} value={formatCompact(data.stats.streakDays, language)} tone="warning" />
              </div>
            </div>
          ) : null}

          <Card padded={false}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h2 className="text-[15px] font-bold">{t('home.announcements')}</h2>
              <SeeAllLink href="/notifications" />
            </div>
            {announcements.length > 0 ? (
              <ul className="divide-y divide-border">
                {announcements.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => router.push(toWebRoute(n.route, '/notifications'))}
                      className="w-full cursor-pointer px-5 py-3 text-start transition hover:bg-surface-alt"
                    >
                      <span className="clamp-1 block text-[13px] font-semibold">{n.title}</span>
                      <span className="clamp-2 mt-0.5 block text-xs text-muted">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-subtle">{formatDate(n.createdAt, language)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-[13px] text-muted">{t('notifications.empty.title')}</p>
            )}
          </Card>

          <Card>
            <CardTitle>{t('web.quickLinks')}</CardTitle>
            <nav className="space-y-0.5">
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href + item.labelKey}
                    href={item.href}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-semibold text-muted transition hover:bg-surface-alt hover:text-foreground"
                  >
                    <Icon size={17} />
                    <span className="flex-1 truncate">{t(item.labelKey)}</span>
                    <ChevronRightIcon size={14} className="text-subtle transition group-hover:text-muted" />
                  </Link>
                );
              })}
            </nav>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}