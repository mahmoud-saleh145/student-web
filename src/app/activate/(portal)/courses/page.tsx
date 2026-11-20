'use client';

import * as React from 'react';

import {
  useActivationAcademicYears,
  useActivationCourseList,
  useActivationProfile,
  type ActivationCourseFilters,
} from '@/activation/api';
import { ActivationCourseCard } from '@/activation/components/ActivationCourseCard';
import { activationRoutes } from '@/activation/lib/routes';
import { useActivationT, type ActivationT } from '@/activation/use-t';
import { Badge, Button, Card, CardTitle } from '@/components/ui/core';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/feedback';
import { Input, Select, Sheet, Toggle } from '@/components/ui/forms';
import { FilterIcon } from '@/components/ui/icons';
import { Toolbar } from '@/components/ui/table';
import { formatNumber, localizedName } from '@/lib/format';

type Sort = NonNullable<ActivationCourseFilters['sort']>;

interface FilterControlsProps {
  t: ActivationT;
  yearOptions: { value: string; label: string }[];
  yearLabel: string;
  searchTerm: string;
  academicYearId: string;
  freeOnly: boolean;
  onSearch: (value: string) => void;
  onYear: (value: string) => void;
  onFree: (value: boolean) => void;
}

function FilterControls(props: FilterControlsProps) {
  return (
    <div className="space-y-4">
      <Input
        label={props.t('common.search')}
        value={props.searchTerm}
        onChange={(e) => props.onSearch(e.target.value)}
        placeholder={props.t('common.search')}
        type="search"
      />
      <Select
        label={props.yearLabel}
        value={props.academicYearId}
        onChange={(e) => props.onYear(e.target.value)}
        placeholder="—"
        options={props.yearOptions}
      />
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-[13px] font-semibold">{props.t('courses.filterFree')}</span>
        <Toggle checked={props.freeOnly} onChange={props.onFree} label={props.t('courses.filterFree')} />
      </div>
    </div>
  );
}

/**
 * The course catalogue, as the backend scopes it for this student.
 *
 * The same discovery as the learning website: the backend returns only
 * published courses targeted at the student's own university, faculty and
 * department (General and Programs branches alike follow from the department
 * on their profile), and this page adds the same display filters on top —
 * search, year or level, free only, sort. University, faculty and department
 * are not filters here because they are not choices: they are the student's
 * profile, enforced server-side. No new eligibility rule is introduced.
 */
export default function ActivationCoursesPage() {
  const { t, language } = useActivationT();
  const [sort, setSort] = React.useState<Sort>('newest');
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [rawSearch, setRawSearch] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  // One request per pause in typing, not one per keystroke.
  React.useEffect(() => {
    const id = setTimeout(() => setSearchTerm(rawSearch.trim()), 350);
    return () => clearTimeout(id);
  }, [rawSearch]);

  const filters = React.useMemo<ActivationCourseFilters>(
    () => ({
      sort,
      free: freeOnly || undefined,
      q: searchTerm || undefined,
      academicYearId: academicYearId ?? undefined,
    }),
    [sort, freeOnly, searchTerm, academicYearId],
  );

  const query = useActivationCourseList(filters);
  const profile = useActivationProfile();
  const years = useActivationAcademicYears(profile.data?.faculty?.id);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const activeFilterCount = (freeOnly ? 1 : 0) + (searchTerm ? 1 : 0) + (academicYearId ? 1 : 0);

  const clearFilters = React.useCallback(() => {
    setFreeOnly(false);
    setRawSearch('');
    setSearchTerm('');
    setAcademicYearId(null);
  }, []);

  const yearOptions = (years.data ?? []).map((y) => ({ value: y.id, label: localizedName(y, language) }));
  const sortOptions = [
    { value: 'newest', label: t('courses.sortNewest') },
    { value: 'popular', label: t('courses.sortPopular') },
    { value: 'priceLow', label: t('courses.sortPriceLow') },
    { value: 'priceHigh', label: t('courses.sortPriceHigh') },
  ];

  const controlProps: FilterControlsProps = {
    t,
    yearOptions,
    searchTerm: rawSearch,
    academicYearId: academicYearId ?? '',
    // Labelled from the ladder the options came from: a levels college must
    // not be shown an "Academic year" filter above a list of levels.
    yearLabel:
      (years.data?.[0]?.kind ?? profile.data?.academicYear?.structure?.kind) === 'LEVEL'
        ? t('auth.level')
        : t('courses.filterYear'),
    freeOnly,
    onSearch: setRawSearch,
    onYear: (value) => setAcademicYearId(value || null),
    onFree: setFreeOnly,
  };

  return (
    <>
      <PageHeader
        title={t('courses.title')}
        subtitle={t('act.courses.subtitle')}
        breadcrumbs={[{ href: activationRoutes.home, label: t('act.nav.home') }, { label: t('courses.title') }]}
        action={
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)} type="button">
            <FilterIcon size={16} />
            {t('courses.filters')}
            {activeFilterCount > 0 ? ` (${formatNumber(activeFilterCount, language)})` : ''}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <Card>
            <CardTitle action={activeFilterCount > 0 ? <Badge label={String(activeFilterCount)} tone="primary" /> : undefined}>
              {t('courses.filters')}
            </CardTitle>
            <FilterControls {...controlProps} />
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-[13px] text-muted">{t('web.resultsCount', { count: total })}</span>
              {activeFilterCount > 0 ? (
                <Button variant="ghost" size="sm" type="button" onClick={clearFilters}>
                  {t('courses.clearFilters')}
                </Button>
              ) : null}
            </div>
          </Card>
        </aside>

        <div className="min-w-0">
          <Toolbar>
            <span className="text-[13px] font-semibold" data-testid="course-count">
              {t('web.resultsCount', { count: total })}
            </span>
            {/* Sorting lives in the filters sheet below `lg`, as on the learning
                website: a fixed-width control here pushes narrow phones sideways. */}
            <div className="ms-auto hidden items-center gap-2 lg:flex">
              <span className="text-[13px] text-muted">{t('courses.sortBy')}</span>
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={sortOptions} className="w-52" />
            </div>
          </Toolbar>

          {query.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-alt" />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t('courses.empty.listTitle')} body={t('courses.empty.listBody')} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((course) => (
                  <ActivationCourseCard key={course.id} course={course} />
                ))}
              </div>
              {query.hasNextPage ? (
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" type="button" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                    {query.isFetchingNextPage ? t('common.loading') : t('common.seeAll')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('courses.filters')}>
        <div className="flex flex-col gap-4 pb-2">
          <FilterControls {...controlProps} />
          <Select label={t('courses.sortBy')} value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={sortOptions} />
          {activeFilterCount > 0 ? (
            <Button variant="secondary" type="button" onClick={clearFilters} fullWidth>
              {t('courses.clearFilters')}
            </Button>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
