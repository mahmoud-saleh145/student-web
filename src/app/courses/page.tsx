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
import { Select, Sheet, Toggle } from "@/components/ui/forms";
import { FilterIcon } from "@/components/ui/icons";
import { Toolbar } from "@/components/ui/table";
import {
  useAcademicYears,
  useProfile,
  useCourseList,
  useFaculties,
  useUniversities,
  type CourseFilters,
} from "@/features/api";
import { useSession, useTranslation } from "@/lib/session-context";

type Sort = NonNullable<CourseFilters["sort"]>;
type TFn = (key: string, params?: Record<string, string | number>) => string;

interface FilterControlsProps {
  t: TFn;
  universityOptions: { value: string; label: string }[];
  facultyOptions: { value: string; label: string }[];
  yearOptions: { value: string; label: string }[];
  yearLabel: string;
  universityId: string;
  facultyId: string;
  academicYearId: string;
  freeOnly: boolean;
  onUniversity: (value: string) => void;
  onFaculty: (value: string) => void;
  onYear: (value: string) => void;
  onFree: (value: boolean) => void;
}

function FilterControls(props: FilterControlsProps) {
  return (
    <div className="space-y-4">
      <Select
        label={props.t("courses.filterUniversity")}
        value={props.universityId}
        onChange={(e) => props.onUniversity(e.target.value)}
        placeholder="—"
        options={props.universityOptions}
      />
      <Select
        label={props.t("auth.faculty")}
        value={props.facultyId}
        onChange={(e) => props.onFaculty(e.target.value)}
        placeholder="—"
        options={props.facultyOptions}
        disabled={!props.universityId}
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
  const [universityId, setUniversityId] = React.useState<string | null>(null);
  const [facultyId, setFacultyId] = React.useState<string | null>(null);
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(
    null,
  );
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const filters = React.useMemo<CourseFilters>(
    () => ({
      sort,
      free: freeOnly || undefined,
      universityId: universityId ?? undefined,
      facultyId: facultyId ?? undefined,
      academicYearId: academicYearId ?? undefined,
    }),
    [sort, freeOnly, universityId, facultyId, academicYearId],
  );

  const query = useCourseList(filters);
  const universities = useUniversities();
  const faculties = useFaculties(universityId);
  const profile = useProfile();
  const years = useAcademicYears(profile.data?.department?.id);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const activeFilterCount =
    (freeOnly ? 1 : 0) +
    (universityId ? 1 : 0) +
    (facultyId ? 1 : 0) +
    (academicYearId ? 1 : 0);

  const clearFilters = React.useCallback(() => {
    setFreeOnly(false);
    setUniversityId(null);
    setFacultyId(null);
    setAcademicYearId(null);
  }, []);

  const universityOptions = (universities.data ?? []).map((u) => ({
    value: u.id,
    label: u.nameAr || u.name,
  }));
  const facultyOptions = (faculties.data ?? []).map((f) => ({
    value: f.id,
    label: f.nameAr || f.name,
  }));
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
    universityOptions,
    facultyOptions,
    yearOptions,
    universityId: universityId ?? "",
    facultyId: facultyId ?? "",
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
    onUniversity: (value) => {
      setUniversityId(value || null);
      // The year filter is scoped to a unit, so a year chosen under one
      // university is meaningless under another. Clearing it here is what stops
      // the request combining a new university with another university's rung.
      setFacultyId(null);
      setAcademicYearId(null);
    },
    onFaculty: (value) => {
      setFacultyId(value || null);
      // Same reason, one level up: the list behind the year filter changes with
      // the college, so a year already chosen is no longer necessarily offered.
      setAcademicYearId(null);
    },
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
            <div className="ms-auto flex items-center gap-2">
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
