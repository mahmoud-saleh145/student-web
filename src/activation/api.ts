'use client';

import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api-client';
import type { Paginated } from '@/types/api';
import type {
  AcademicYear,
  CodeValidation,
  CourseDetail,
  CourseJoinOptions,
  CoursePartsResponse,
  CourseSummary,
  EnrollmentMethod,
  EnrollmentResult,
  LibraryMaterialDetail,
  LibraryMaterialSummary,
  LibraryPurchaseKind,
  LibraryPurchaseResult,
  LibraryQuote,
  MyLibraryItem,
  RechargeResult,
  User,
  WalletSummary,
  WalletTransaction,
} from '@/types/domain';

import { activationApi } from './lib/client';
import { useActivationSession } from './session';

/**
 * The portal's data access.
 *
 * The same backend endpoints, parameters and response types as the learning
 * website's `features/api.ts` — the catalogue, visibility and eligibility
 * rules are the backend's and are identical for both — but through the
 * portal's proxy and into the portal's query cache, under the portal's own
 * keys. There is deliberately no hook here for a lesson, a playback ticket, an
 * attachment ticket or a Library document: the portal's proxy would refuse
 * them, and no page in this tree has a use for one.
 *
 * Every key carries the signed-in user, so an answer cached for one account is
 * never found by another that signs in on the same browser.
 */

export const ACTIVATION_PAGE_SIZE = 20;

export interface ActivationCourseFilters {
  q?: string;
  /** A display filter. Never widens what the backend lets this student see. */
  academicYearId?: string;
  free?: boolean;
  sort?: 'newest' | 'popular' | 'priceLow' | 'priceHigh';
}

const root = (userId: string | null) => ['activation', userId ?? 'anonymous'] as const;

export const aqk = {
  all: (userId: string | null) => root(userId),
  profile: (userId: string | null) => [...root(userId), 'profile'] as const,
  years: (userId: string | null, facultyId: string | null) => [...root(userId), 'academic-years', facultyId] as const,
  courses: (userId: string | null) => [...root(userId), 'courses'] as const,
  courseList: (userId: string | null, filters: object) => [...root(userId), 'courses', 'list', filters] as const,
  myCourses: (userId: string | null) => [...root(userId), 'courses', 'mine'] as const,
  course: (userId: string | null, id: string) => [...root(userId), 'courses', 'detail', id] as const,
  parts: (userId: string | null, id: string) => [...root(userId), 'courses', 'parts', id] as const,
  joinOptions: (userId: string | null, id: string) => [...root(userId), 'courses', 'join-options', id] as const,
  library: (userId: string | null) => [...root(userId), 'library'] as const,
  libraryBrowse: (userId: string | null, filters: object) => [...root(userId), 'library', 'browse', filters] as const,
  libraryMine: (userId: string | null) => [...root(userId), 'library', 'mine'] as const,
  material: (userId: string | null, id: string) => [...root(userId), 'library', 'material', id] as const,
  wallet: (userId: string | null) => [...root(userId), 'wallet'] as const,
  walletSummary: (userId: string | null) => [...root(userId), 'wallet', 'summary'] as const,
  walletTransactions: (userId: string | null) => [...root(userId), 'wallet', 'transactions'] as const,
};

function useUserId(): string | null {
  return useActivationSession().user?.id ?? null;
}

function pageParams(page: number): Record<string, number> {
  return { page, pageSize: ACTIVATION_PAGE_SIZE };
}

const nextPage = <T,>(last: Paginated<T>) => (last.meta.hasNext ? last.meta.page + 1 : undefined);

/**
 * Ownership answers are never served from a previous visit: they are re-read
 * on every mount, and dropped once no screen shows them.
 */
const OWNERSHIP_POLICY = { staleTime: 0, gcTime: 0, refetchOnMount: 'always' } as const;

// ---------------------------------------------------------------------------
// Profile and academic structure
// ---------------------------------------------------------------------------

export function useActivationProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: aqk.profile(userId),
    queryFn: ({ signal }) => activationApi.get<User>('profile', { signal }),
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  });
}

/**
 * The year/level ladder of the student's own faculty — the unit the catalogue
 * is scoped to. Asked by `facultyId`, which the backend resolves to that
 * college's ladder (its own, else its university's).
 */
export function useActivationAcademicYears(facultyId: string | null | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: aqk.years(userId, facultyId ?? null),
    queryFn: ({ signal }) =>
      activationApi.get<AcademicYear[]>('catalog/academic-years', { signal, query: { facultyId } }),
    enabled: userId !== null && !!facultyId,
    staleTime: 60 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export function useActivationCourseList(filters: ActivationCourseFilters) {
  const userId = useUserId();
  return useInfiniteQuery({
    queryKey: aqk.courseList(userId, filters),
    queryFn: ({ pageParam, signal }) =>
      // University, faculty and department are not sent: the backend applies
      // the student's own profile (`studentCourseWhere`), and unknown query
      // fields are rejected outright.
      activationApi.get<Paginated<CourseSummary>>('courses', {
        signal,
        query: {
          q: filters.q,
          academicYearId: filters.academicYearId,
          free: filters.free ? true : undefined,
          sort: filters.sort,
          ...pageParams(pageParam),
        },
      }),
    enabled: userId !== null,
    initialPageParam: 1,
    getNextPageParam: nextPage<CourseSummary>,
    select: (data) => ({
      items: data.pages.flatMap((p) => p.items),
      total: data.pages[0]?.meta.total ?? 0,
    }),
  });
}

export function useActivationMyCourses() {
  const userId = useUserId();
  return useInfiniteQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.myCourses(userId),
    queryFn: ({ pageParam, signal }) =>
      activationApi.get<Paginated<CourseSummary>>('courses/mine', { signal, query: pageParams(pageParam) }),
    enabled: userId !== null,
    initialPageParam: 1,
    getNextPageParam: nextPage<CourseSummary>,
    select: (data) => ({ items: data.pages.flatMap((p) => p.items) }),
  });
}

export function useActivationCourse(id: string | undefined) {
  const userId = useUserId();
  return useQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.course(userId, id ?? 'none'),
    queryFn: ({ signal }) => activationApi.get<CourseDetail>(`courses/${id}`, { signal }),
    enabled: !!id && userId !== null,
    retry: false,
  });
}

export function useActivationCourseParts(id: string | undefined) {
  const userId = useUserId();
  return useQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.parts(userId, id ?? 'none'),
    queryFn: ({ signal }) => activationApi.get<CoursePartsResponse>(`courses/${id}/parts`, { signal }),
    enabled: !!id && userId !== null,
    retry: false,
  });
}

/**
 * The server's statement of what can be acquired and what is already owned.
 * It answers 404 for a course that is not on offer (anything but PUBLISHED);
 * that is an answer — "nothing to activate here" — not a failure to retry.
 */
export function useActivationJoinOptions(id: string | undefined, enabled = true) {
  const userId = useUserId();
  return useQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.joinOptions(userId, id ?? 'none'),
    queryFn: ({ signal }) => activationApi.get<CourseJoinOptions>(`courses/${id}/join-options`, { signal }),
    enabled: !!id && userId !== null && enabled,
    retry: false,
  });
}

/** True when the server answered "this course is not on offer" for join-options. */
export function isNotOnOffer(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Ownership extent for each of a list of enrolled courses, straight from the
 * server: `join-options` where the course is on offer, otherwise `parts`
 * (which the backend still answers for a hidden course's own students).
 */
export interface CourseExtent {
  fullCourseOwned: boolean | null;
  parts: CoursePartsResponse['parts'];
  loading: boolean;
}

export function useCourseExtents(courseIds: string[]): Record<string, CourseExtent> {
  const userId = useUserId();
  const results = useQueries({
    queries: courseIds.map((id) => ({
      ...OWNERSHIP_POLICY,
      queryKey: [...aqk.joinOptions(userId, id), 'extent'] as const,
      enabled: userId !== null,
      retry: false,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Omit<CourseExtent, 'loading'>> => {
        try {
          const options = await activationApi.get<CourseJoinOptions>(`courses/${id}/join-options`, { signal });
          return { fullCourseOwned: options.fullCourse.owned === true, parts: options.hasParts ? options.parts : [] };
        } catch (e) {
          if (!isNotOnOffer(e)) throw e;
          const parts = await activationApi.get<CoursePartsResponse>(`courses/${id}/parts`, { signal });
          // `parts` does not speak about the whole course: leave that unknown.
          return { fullCourseOwned: null, parts: parts.hasParts ? parts.parts : [] };
        }
      },
    })),
  });

  const out: Record<string, CourseExtent> = {};
  courseIds.forEach((id, i) => {
    const r = results[i];
    out[id] = {
      fullCourseOwned: r?.data?.fullCourseOwned ?? null,
      parts: r?.data?.parts ?? [],
      loading: r?.isPending ?? true,
    };
  });
  return out;
}

/** Read-only check of a card: what kind it is, without using it. */
export function useValidateCourseCode(courseId: string) {
  return useMutation({
    mutationFn: (code: string) => activationApi.post<CodeValidation>('codes/validate', { code, courseId }),
  });
}

export function useRedeemCourseCode(courseId: string) {
  return useMutation({
    mutationFn: (code: string) => activationApi.post<EnrollmentResult>(`courses/${courseId}/redeem`, { code }),
  });
}

export function useActivationEnroll(courseId: string) {
  return useMutation({
    mutationFn: (method: Extract<EnrollmentMethod, 'FREE' | 'ADMIN_APPROVAL'>) =>
      activationApi.post<EnrollmentResult>(`courses/${courseId}/enroll`, { method }),
  });
}

/**
 * Re-reads a course's ownership from the server after an activation, and
 * returns the fresh answers. Also drops every cached course answer so no list
 * keeps showing the previous state.
 */
export function useRefreshCourseOwnership(courseId: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return async (): Promise<{
    course: CourseDetail;
    parts: CoursePartsResponse | null;
    joinOptions: CourseJoinOptions | null;
  }> => {
    const [course, parts, joinOptions] = await Promise.all([
      activationApi.get<CourseDetail>(`courses/${courseId}`),
      activationApi.get<CoursePartsResponse>(`courses/${courseId}/parts`).catch(() => null),
      activationApi.get<CourseJoinOptions>(`courses/${courseId}/join-options`).catch(() => null),
    ]);
    qc.setQueryData(aqk.course(userId, courseId), course);
    if (parts) qc.setQueryData(aqk.parts(userId, courseId), parts);
    if (joinOptions) qc.setQueryData(aqk.joinOptions(userId, courseId), joinOptions);
    void qc.invalidateQueries({ queryKey: aqk.courses(userId) });
    return { course, parts, joinOptions };
  };
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export function useActivationLibraryBrowse(q: string, academicYearId?: string) {
  const userId = useUserId();
  return useInfiniteQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.libraryBrowse(userId, { q, academicYearId: academicYearId ?? null }),
    queryFn: ({ pageParam, signal }) =>
      activationApi.get<Paginated<LibraryMaterialSummary>>('library/materials', {
        signal,
        query: { q: q || undefined, academicYearId: academicYearId || undefined, ...pageParams(pageParam) },
      }),
    enabled: userId !== null,
    initialPageParam: 1,
    getNextPageParam: nextPage<LibraryMaterialSummary>,
    select: (data) => ({ items: data.pages.flatMap((p) => p.items) }),
  });
}

export function useActivationMyLibrary() {
  const userId = useUserId();
  return useInfiniteQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.libraryMine(userId),
    queryFn: ({ pageParam, signal }) =>
      activationApi.get<Paginated<MyLibraryItem>>('library/me', { signal, query: pageParams(pageParam) }),
    enabled: userId !== null,
    initialPageParam: 1,
    getNextPageParam: nextPage<MyLibraryItem>,
    select: (data) => ({ items: data.pages.flatMap((p) => p.items) }),
  });
}

export function useActivationLibraryMaterial(id: string | undefined) {
  const userId = useUserId();
  return useQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.material(userId, id ?? 'none'),
    queryFn: ({ signal }) => activationApi.get<LibraryMaterialDetail>(`library/materials/${id}`, { signal }),
    enabled: !!id && userId !== null,
    retry: false,
  });
}

export function useActivationLibraryQuote() {
  return useMutation({
    mutationFn: (payload: { kind: LibraryPurchaseKind; targetId: string }) =>
      activationApi.post<LibraryQuote>('library/quote', payload),
  });
}

/**
 * Buys with wallet credit. The price is never sent — the backend prices the
 * item, debits the wallet and grants the entitlement in one transaction, and
 * a repeat of the same purchase returns the original (`alreadyPurchased`).
 */
export function useActivationLibraryPurchase() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { kind: LibraryPurchaseKind; targetId: string }) =>
      activationApi.post<LibraryPurchaseResult>('library/purchase', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: aqk.library(userId) });
      void qc.invalidateQueries({ queryKey: aqk.wallet(userId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function useActivationWallet() {
  const userId = useUserId();
  return useQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.walletSummary(userId),
    queryFn: ({ signal }) => activationApi.get<WalletSummary>('wallet', { signal }),
    enabled: userId !== null,
  });
}

export function useActivationWalletTransactions() {
  const userId = useUserId();
  return useInfiniteQuery({
    ...OWNERSHIP_POLICY,
    queryKey: aqk.walletTransactions(userId),
    queryFn: ({ pageParam, signal }) =>
      activationApi.get<Paginated<WalletTransaction>>('wallet/transactions', { signal, query: pageParams(pageParam) }),
    enabled: userId !== null,
    initialPageParam: 1,
    getNextPageParam: nextPage<WalletTransaction>,
    select: (data) => ({ items: data.pages.flatMap((p) => p.items) }),
  });
}

/** Redeems an administrator-issued recharge card. The only way credit is added. */
export function useActivationRecharge() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => activationApi.post<RechargeResult>('wallet/redeem', { code }),
    // On failure too: a response that never arrived says nothing about
    // whether the card was credited, so the balance on screen must not be the
    // one from before the attempt.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: aqk.wallet(userId) });
      void qc.invalidateQueries({ queryKey: aqk.library(userId) });
    },
  });
}
