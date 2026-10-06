'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Badge, Button, Card, Chip } from '@/components/ui/core';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { GridIcon, LockIcon, SearchIcon } from '@/components/ui/icons';
import { DataTable, SectionHeading, type Column } from '@/components/ui/table';
import { useSearch } from '@/features/api';
import { formatNumber } from '@/lib/format';
import { toWebRoute } from '@/lib/routes';
import { useTranslation } from '@/lib/session-context';
import type { SearchResultItem } from '@/types/domain';

const SEARCH_MIN = 2;
const ENTITY_FILTERS = ['COURSE', 'LESSON', 'TEACHER'] as const;
const RECENTS_KEY = 'edu-web-recents';

function useDebounced(value: string, ms: number) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function ResultThumb({ item }: { item: SearchResultItem }) {
  return (
    <span className="grid h-9 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-alt">
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <GridIcon size={14} className="text-subtle" />
      )}
    </span>
  );
}

function entityTone(entity: string): 'primary' | 'info' | 'neutral' {
  if (entity === 'COURSE') return 'primary';
  if (entity === 'LESSON') return 'info';
  return 'neutral';
}

function SearchWorkspace() {
  const { t, language } = useTranslation();
  // The API's entity enum, named for the reader. An unknown entity falls back
  // to the enum itself rather than to a blank badge.
  const entityLabel = React.useCallback(
    (entity: string) => {
      const key = `search.entity.${entity}`;
      const label = t(key);
      return label === key ? entity : label;
    },
    [t]
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [text, setText] = React.useState(initialQuery);
  const [entity, setEntity] = React.useState<string | undefined>(undefined);
  const debounced = useDebounced(text.trim(), 350);
  const query = useSearch(debounced, entity);
  const enabled = debounced.length >= SEARCH_MIN;

  const [recents, setRecents] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    setText(initialQuery);
  }, [initialQuery]);

  const addRecent = React.useCallback((term: string) => {
    const clean = term.trim();
    if (clean.length < SEARCH_MIN) return;
    setRecents((prev) => {
      const next = [clean, ...prev.filter((r) => r !== clean)].slice(0, 8);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecents = React.useCallback(() => {
    setRecents([]);
    localStorage.removeItem(RECENTS_KEY);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    addRecent(q);
    router.replace(q ? `/search?q=${encodeURIComponent(q)}` : '/search', { scroll: false });
  };

  const open = React.useCallback(
    (route: string) => {
      addRecent(debounced);
      router.push(toWebRoute(route, '/search'));
    },
    [addRecent, debounced, router]
  );

  const groups = query.data ?? [];
  const hasResults = groups.some((g) => g.items.length > 0);
  const courseItems = groups.filter((g) => g.entity === 'COURSE').flatMap((g) => g.items);
  const otherItems = groups.filter((g) => g.entity !== 'COURSE').flatMap((g) => g.items);

  const columns = React.useMemo<Column<SearchResultItem>[]>(
    () => [
      {
        key: 'title',
        header: t('search.title'),
        className: 'min-w-[240px]',
        render: (r) => (
          <div className="flex items-center gap-3">
            <ResultThumb item={r} />
            <span className="flex min-w-0 items-center gap-1.5">
              {r.locked ? <LockIcon size={14} className="shrink-0 text-subtle" /> : null}
              <span className="clamp-1 text-[13px] font-semibold">{r.title}</span>
            </span>
          </div>
        ),
      },
      {
        key: 'type',
        header: t('web.col.type'),
        render: (r) => <Badge label={entityLabel(r.entity)} tone={entityTone(r.entity)} />,
      },
      {
        key: 'parent',
        header: t('web.col.course'),
        render: (r) => <span className="clamp-1 text-[13px] text-muted">{r.subtitle ?? '—'}</span>,
      },
    ],
    [t, entityLabel]
  );

  return (
    <>
      <PageHeader
        title={t('search.title')}
        breadcrumbs={[
          { href: '/home', label: t('tabs.home') },
          { label: t('search.title') },
        ]}
      />

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="relative">
            <SearchIcon size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('search.placeholder')}
              aria-label={t('common.search')}
              className="h-12 w-full rounded-lg border border-border-strong bg-background ps-11 pe-4 text-sm text-foreground outline-none transition placeholder:text-subtle focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Chip label={t('search.all')} selected={!entity} onClick={() => setEntity(undefined)} />
            {ENTITY_FILTERS.map((e) => (
              <Chip key={e} label={entityLabel(e)} selected={entity === e} onClick={() => setEntity(e)} />
            ))}
            <Button type="submit" size="sm" className="ms-auto">
              {t('common.search')}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        {!enabled ? (
          <>
            {recents.length > 0 ? (
              <div className="mb-6">
                <SectionHeading
                  title={t('search.recent')}
                  action={
                    <button
                      type="button"
                      onClick={clearRecents}
                      className="cursor-pointer rounded-md text-[13px] font-semibold text-primary-ink transition hover:underline"
                    >
                      {t('search.clearRecent')}
                    </button>
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {recents.map((r) => (
                    <Chip key={r} label={r} onClick={() => setText(r)} />
                  ))}
                </div>
              </div>
            ) : null}
            <EmptyState title={t('search.idle.title')} body={t('search.idle.body')} compact />
          </>
        ) : query.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-xl bg-surface-alt" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !hasResults ? (
          <EmptyState title={t('search.empty.title')} />
        ) : (
          <div className="space-y-8">
            {courseItems.length > 0 ? (
              <section>
                <SectionHeading
                  title={t('courses.title')}
                  subtitle={t('web.resultsCount', { count: formatNumber(courseItems.length, language) })}
                />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {courseItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => open(item.route)}
                      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface text-start transition hover:border-border-strong hover:shadow-md"
                    >
                      <div className="flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-alt">
                        {item.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <GridIcon size={26} className="text-subtle" />
                        )}
                      </div>
                      <div className="p-4">
                        <div className="clamp-2 text-sm font-semibold leading-snug">{item.title}</div>
                        {item.subtitle ? <div className="mt-1 truncate text-xs text-muted">{item.subtitle}</div> : null}
                        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                          <Badge label={entityLabel(item.entity)} tone={entityTone(item.entity)} />
                          {item.locked ? (
                            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-subtle">
                              <LockIcon size={12} />
                              <span className="truncate">{t('access.lockedBody')}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {otherItems.length > 0 ? (
              <section>
                <SectionHeading
                  title={t('web.curriculum')}
                  subtitle={t('web.resultsCount', { count: formatNumber(otherItems.length, language) })}
                />
                <DataTable<SearchResultItem>
                  columns={columns}
                  rows={otherItems}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => open(r.route)}
                  empty={t('web.noResults')}
                  mobile={(r) => (
                    <button type="button" onClick={() => open(r.route)} className="w-full cursor-pointer text-start">
                      <div className="clamp-1 text-[13px] font-semibold">{r.title}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge label={entityLabel(r.entity)} tone={entityTone(r.entity)} />
                        {r.subtitle ? <span className="truncate text-xs text-muted">{r.subtitle}</span> : null}
                      </div>
                    </button>
                  )}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

export default function SearchPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <React.Suspense
        fallback={
          <>
            <PageHeader title={t('search.title')} />
            <div className="h-40 animate-pulse rounded-xl bg-surface-alt" />
          </>
        }
      >
        <SearchWorkspace />
      </React.Suspense>
    </AppShell>
  );
}