"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { CourseCard } from "@/components/courses/CourseCard";
import { formatNumber } from "@/lib/format";
import { Badge, Button, Card, CardTitle } from "@/components/ui/core";
import {
  AppShell,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/ui/feedback";
import { Input, Select, Sheet, Toggle } from "@/components/ui/forms";
import { FilterIcon } from "@/components/ui/icons";
import { Toolbar } from "@/components/ui/table";
import {
  useAcademicYears,
  useProfile,
  useCourseList,
  type CourseFilters,
} from "@/features/api";
import { useSession, useTranslation } from "@/lib/session-context";

type Sort = NonNullable<CourseFilters["sort"]>;
type TFn = (key: string, params?: Record<string, string | number>) => string;

interface FilterControlsProps {
  t: TFn;
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
        label={props.t("common.search")}
        value={props.searchTerm}
        onChange={(e) => props.onSearch(e.target.value)}
        placeholder={props.t("common.search")}
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
        <span className="text-[13px] font-semibold">
          {props.t("courses.filterFree")}
        </span>
        <Toggle
          checked={props.freeOnly}
          onChange={props.onFree}
          label={props.t("courses.filterFree")}
        />
      </div>
    </div>
  );
}

export default function CoursesPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { status } = useSession();
  const [sort, setSort] = React.useState<Sort>("newest");
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(
    null,
  );
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  /*
    University and faculty are deliberately absent: they come from the
    student's own profile and are enforced server-side by
    `studentCourseWhere`. Sending them could only ever narrow the result set,
    never widen it, so the control would have been a filter that could not do
    anything useful.
  */
  const filters = React.useMemo<CourseFilters>(
    () => ({
      sort,
      free: freeOnly || undefined,
      q: searchTerm || undefined,
      academicYearId: academicYearId ?? undefined,
    }),
    [sort, freeOnly, searchTerm, academicYearId],
  );

  const query = useCourseList(filters);
  const profile = useProfile();
  /*
    Scoped to the FACULTY, not the department. A department-owned ladder
    outranks the faculty's (catalog.service.ts resolveAcademicStructure), so
    asking by department could offer only a subset of the years a student may
    browse. The faculty is the unit the catalogue is actually scoped to.
  */
  const years = useAcademicYears(profile.data?.faculty?.id);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const activeFilterCount =
    (freeOnly ? 1 : 0) + (searchTerm ? 1 : 0) + (academicYearId ? 1 : 0);

  const clearFilters = React.useCallback(() => {
    setFreeOnly(false);
    setSearchTerm("");
    setAcademicYearId(null);
  }, []);

  const yearOptions = (years.data ?? []).map((y) => ({
    value: y.id,
    label: y.nameAr || y.name,
  }));
  const sortOptions = [
    { value: "newest", label: t("courses.sortNewest") },
    { value: "popular", label: t("courses.sortPopular") },
    { value: "priceLow", label: t("courses.sortPriceLow") },
    { value: "priceHigh", label: t("courses.sortPriceHigh") },
  ];

  const controlProps: FilterControlsProps = {
    t,
    yearOptions,
    searchTerm,
    academicYearId: academicYearId ?? "",
    /*
      Labelled from the ladder the options came from, not from the department's
      study type — the two are independent now, and a levels student was being
      shown an "Academic year" filter above a list of levels.
    */
    yearLabel:
      (years.data?.[0]?.kind ?? profile.data?.academicYear?.structure?.kind) ===
      "LEVEL"
        ? t("auth.level")
        : t("courses.filterYear"),
    freeOnly,
    onSearch: setSearchTerm,
    onYear: (value) => setAcademicYearId(value || null),
    onFree: setFreeOnly,
  };

  return (
    <AppShell>
      <PageHeader
        title={t("courses.title")}
        breadcrumbs={[
          { href: "/home", label: t("tabs.home") },
          { label: t("courses.title") },
        ]}
        action={
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden"
            onClick={() => setFiltersOpen(true)}
            type="button"
          >
            <FilterIcon size={16} />
            {t("courses.filters")}
            {activeFilterCount > 0
              ? ` (${formatNumber(activeFilterCount, language)})`
              : ""}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <Card>
            <CardTitle
              action={
                activeFilterCount > 0 ? (
                  <Badge label={String(activeFilterCount)} tone="primary" />
                ) : undefined
              }
            >
              {t("courses.filters")}
            </CardTitle>
            <FilterControls {...controlProps} />
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-[13px] text-muted">
                {t("web.resultsCount", { count: total })}
              </span>
              {activeFilterCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={clearFilters}
                >
                  {t("courses.clearFilters")}
                </Button>
              ) : null}
            </div>
          </Card>
        </aside>

        <div className="min-w-0">
          <Toolbar>
            <span className="text-[13px] font-semibold">
              {t("web.resultsCount", { count: total })}
            </span>
            {/*
              Search and sorting live in the filters Sheet below `lg`.

              They sat here at a fixed 176px input plus a fixed 208px select
              beside a label, so this row needed 429px before anything else.
              Under 445px of viewport the row cannot fit, and because it is
              one flex item inside a `flex-wrap` Toolbar the wrap never
              happened - the document simply grew sideways and the heading,
              the cards and the controls themselves were clipped on every
              device narrower than that. Phones wide enough to fit it were
              fine, which is what made it look device-specific.

              The Sheet already renders both controls off the same state
              (`FilterControls` for search, the sort Select below it), so a
              phone loses nothing but a tap: the count stays here and the rest
              sits behind the filters button above. From `lg` up the row is
              inline again and unchanged.
            */}
            <div className="ms-auto hidden items-center gap-2 lg:flex">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("common.search")}
                type="search"
                aria-label={t("common.search")}
                className="w-44 lg:w-64"
              />
              <span className="text-[13px] text-muted">
                {t("courses.sortBy")}
              </span>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                options={sortOptions}
                className="w-52"
              />
            </div>
          </Toolbar>

          {query.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-xl bg-surface-alt"
                />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={t("courses.empty.listTitle")}
              body={t("courses.empty.listBody")}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
              {query.hasNextPage ? (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void query.fetchNextPage()}
                    loading={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage
                      ? t("common.loading")
                      : t("common.seeAll")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t("courses.filters")}
      >
        <div className="flex flex-col gap-4 pb-2">
          <FilterControls {...controlProps} />
          <Select
            label={t("courses.sortBy")}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            options={sortOptions}
          />
          {activeFilterCount > 0 ? (
            <Button
              variant="secondary"
              type="button"
              onClick={clearFilters}
              fullWidth
            >
              {t("courses.clearFilters")}
            </Button>
          ) : null}
        </div>
      </Sheet>
    </AppShell>
  );
}
