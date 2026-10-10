import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";
import type { Paginated } from "@/types/api";
import type {
  AcademicYear,
  AppNotification,
  AttachmentTicket,
  AuthorizedDevice,
  CodeValidation,
  CourseDetail,
  CourseJoinOptions,
  CoursePartsResponse,
  CourseSummary,
  Department,
  EnrollmentMethod,
  EnrollmentResult,
  Faculty,
  HomeFeed,
  LessonDetail,
  LibraryDocumentTicket,
  LibraryMaterialDetail,
  LibraryMaterialSummary,
  LibraryPurchaseKind,
  LibraryPurchaseResult,
  LibraryQuote,
  MyLibraryItem,
  NotificationPreferences,
  RechargeResult,
  SearchResultGroup,
  SupportTicketDetail,
  SupportTicketSummary,
  University,
  User,
  WalletSummary,
  WalletTransaction,
  WatchProgress,
} from "@/types/domain";

export const PAGE_SIZE = 20;

function params(obj: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface CourseFilters {
  q?: string;
  universityId?: string;
  facultyId?: string;
  academicYearId?: string;
  teacherId?: string;
  free?: boolean;
  sort?: "newest" | "popular" | "priceLow" | "priceHigh";
}

export const authApi = {
  me: () => api.get<User>("auth/me"),
};

export const catalogApi = {
  universities: () => api.get<University[]>("catalog/universities"),
  faculties: (universityId: string) =>
    api.get<Faculty[]>(`catalog/universities/${universityId}/faculties`),
  departments: (facultyId: string, studyType?: "GENERAL" | "PROGRAMS") =>
    api.get<Department[]>(
      `catalog/faculties/${facultyId}/departments${studyType ? `?studyType=${studyType}` : ""}`,
    ),
  academicYears: (departmentId?: string) =>
    api.get<AcademicYear[]>(
      `catalog/academic-years${departmentId ? `?departmentId=${departmentId}` : ""}`,
    ),
  /**
   * The resolved academic system AND the matching year/level list, in one call.
   *
   * One endpoint rather than two because the two answers must agree: which
   * system a college uses is its own configuration (its override, else its
   * university's default), and the list has to be that system's list. Fetching
   * them separately and reconciling on the client is how a student ends up being
   * asked "Which year are you in?" above a list of levels.
   */
  academicSelection: (scope: AcademicSelectionScope) =>
    api.get<AcademicSelectionResponse>("catalog/academic-selection", {
      query: scope,
    }),
};

export function useUniversities() {
  return useQuery({
    queryKey: qk.catalog.universities(),
    queryFn: catalogApi.universities,
    staleTime: 30 * 60_000,
  });
}
export function useFaculties(universityId: string | null) {
  return useQuery({
    queryKey: qk.catalog.faculties(universityId ?? "none"),
    queryFn: () => catalogApi.faculties(universityId!),
    enabled: !!universityId,
    staleTime: 30 * 60_000,
  });
}
export function useDepartments(
  facultyId: string | null,
  studyType?: "GENERAL" | "PROGRAMS",
) {
  return useQuery({
    queryKey: [...qk.catalog.departments(facultyId ?? "none"), studyType],
    queryFn: () => catalogApi.departments(facultyId!, studyType),
    enabled: !!facultyId,
    staleTime: 30 * 60_000,
  });
}
export function useAcademicYears(departmentId?: string) {
  return useQuery({
    queryKey: [...qk.catalog.academicYears(), departmentId],
    queryFn: () => catalogApi.academicYears(departmentId),
    staleTime: 60 * 60_000,
  });
}

/**
 * Which unit of the hierarchy the academic selection is being asked about.
 *
 * The API resolves a single owner, so exactly one of these is sent. Most
 * specific wins, which is also how the API resolves.
 */
export type AcademicSelectionScope =
  | { departmentId: string; facultyId?: never; universityId?: never }
  | { facultyId: string; departmentId?: never; universityId?: never }
  | { universityId: string; departmentId?: never; facultyId?: never }
  | { departmentId?: never; facultyId?: never; universityId?: never };

/**
 * The college's resolved system plus its entries.
 *
 * `academicSystem` is null when the college has no configured system at all —
 * an explicit "not set up" state the UI renders as a message, rather than
 * guessing a system and labelling a list wrongly.
 */
export interface AcademicSelectionResponse {
  academicSystem: {
    system: "YEAR" | "LEVEL";
    source: "COLLEGE_OVERRIDE" | "UNIVERSITY_DEFAULT";
    universityId: string | null;
    facultyId: string | null;
    universityDefault: "YEAR" | "LEVEL" | null;
    facultyOverride: "YEAR" | "LEVEL" | null;
  } | null;
  academicYears: AcademicYear[];
  /**
   * The vocabulary the returned entries are actually written in.
   *
   * Normally equal to `academicSystem.system`, but not after an administrator
   * changes a university default without also renaming its ladder — which does
   * not happen automatically and must not. The field's label is chosen from THIS,
   * so it can never read "Which year are you in?" above a list of levels.
   */
  ladderKind?: 'YEAR' | 'LEVEL' | null;
  /** False means the configuration and the ladder disagree; see above. */
  ladderMatchesSystem?: boolean;
}

/**
 * The year/level picker payload for a scope.
 *
 * Disabled until a parent is chosen, so a screen cannot accidentally ask for the
 * platform-wide list: `undefined` means "nothing selected yet", which is
 * different from "the whole platform".
 */
export function useAcademicSelection(scope: AcademicSelectionScope | null) {
  return useQuery({
    queryKey: [...qk.catalog.academicYears(), "selection", scope ?? "none"],
    queryFn: () => catalogApi.academicSelection(scope ?? {}),
    enabled: !!scope,
    staleTime: 30 * 60_000,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: qk.auth.profile(),
    queryFn: () => api.get<User>("profile"),
  });
}

export function useHomeFeed() {
  return useQuery({
    queryKey: qk.home.feed(),
    queryFn: () => api.get<HomeFeed>("home/feed"),
  });
}

function courseListQuery(filters: CourseFilters, mine: boolean) {
  return {
    queryKey: mine ? qk.courses.mine(filters) : qk.courses.list(filters),
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: number;
      signal: AbortSignal;
    }) =>
      api.get<Paginated<CourseSummary>>(
        mine
          ? `courses/mine${params({ page: pageParam, pageSize: PAGE_SIZE })}`
          : `courses${params({ ...filters, page: pageParam, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<CourseSummary>) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    select: (data: { pages: Paginated<CourseSummary>[] }) => ({
      pages: data.pages,
      items: data.pages.flatMap((p) => p.items),
      total: data.pages[0]?.meta.total ?? 0,
    }),
  };
}

export function useCourseList(filters: CourseFilters) {
  return useInfiniteQuery(courseListQuery(filters, false));
}
export function useMyCourses() {
  return useInfiniteQuery(courseListQuery({}, true));
}
export function useCourse(id: string | undefined) {
  return useQuery({
    queryKey: qk.courses.detail(id ?? "none"),
    queryFn: ({ signal }) => api.get<CourseDetail>(`courses/${id}`, { signal }),
    enabled: !!id,
  });
}
export function useJoinOptions(courseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.courses.joinOptions(courseId ?? "none"),
    queryFn: ({ signal }) =>
      api.get<CourseJoinOptions>(`courses/${courseId}/join-options`, {
        signal,
      }),
    enabled: !!courseId && enabled,
  });
}
export function useCourseParts(courseId: string | undefined) {
  return useQuery({
    queryKey: qk.courses.parts(courseId ?? "none"),
    queryFn: ({ signal }) =>
      api.get<CoursePartsResponse>(`courses/${courseId}/parts`, { signal }),
    enabled: !!courseId,
  });
}
export function useEnroll(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (method: EnrollmentMethod) =>
      api.post<EnrollmentResult>(`courses/${courseId}/enroll`, { method }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.courses.all });
    },
  });
}
export function useRedeemCourseCode(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.post<EnrollmentResult>(`courses/${courseId}/redeem`, { code }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.courses.all });
    },
  });
}
export function useValidateCode() {
  return useMutation({
    mutationFn: (payload: { code: string; courseId?: string }) =>
      api.post<CodeValidation>("codes/validate", payload),
  });
}

export function useLesson(id: string | undefined) {
  return useQuery({
    queryKey: qk.lessons.detail(id ?? "none"),
    queryFn: ({ signal }) => api.get<LessonDetail>(`lessons/${id}`, { signal }),
    enabled: !!id,
  });
}
export function useLessonByVideo(videoId: string | undefined) {
  return useQuery({
    queryKey: qk.lessons.byVideo(videoId ?? "none"),
    queryFn: ({ signal }) =>
      api.get<LessonDetail>(`lessons/by-video/${videoId}`, { signal }),
    enabled: !!videoId,
  });
}
export function useMarkLessonComplete(lessonId: string, courseId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WatchProgress>(`lessons/${lessonId}/complete`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.lessons.detail(lessonId) });
      if (courseId)
        void qc.invalidateQueries({ queryKey: qk.courses.detail(courseId) });
    },
  });
}
export function useAttachmentTicket(
  attachmentId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: qk.attachments.ticket(attachmentId ?? "none"),
    queryFn: () =>
      api.get<AttachmentTicket>(`attachments/${attachmentId}/ticket`),
    enabled: !!attachmentId && enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useWallet() {
  return useQuery({
    queryKey: qk.wallet.summary(),
    queryFn: () => api.get<WalletSummary>("wallet"),
  });
}
export function useWalletTransactions() {
  return useInfiniteQuery({
    queryKey: qk.wallet.transactions({}),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<WalletTransaction>>(
        `wallet/transactions${params({ page: pageParam, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<WalletTransaction>) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    select: (data: { pages: Paginated<WalletTransaction>[] }) => ({
      pages: data.pages,
      items: data.pages.flatMap((p) => p.items),
    }),
  });
}
export function useRedeemRecharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.post<RechargeResult>("wallet/redeem", { code }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.wallet.all });
    },
  });
}

export function useLibraryBrowse(q: string) {
  return useInfiniteQuery({
    queryKey: qk.library.browse({ q }),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<LibraryMaterialSummary>>(
        `library/materials${params({ q: q || undefined, page: pageParam, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<LibraryMaterialSummary>) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    select: (data: { pages: Paginated<LibraryMaterialSummary>[] }) => ({
      pages: data.pages,
      items: data.pages.flatMap((p) => p.items),
    }),
  });
}
export function useMyLibrary() {
  return useInfiniteQuery({
    queryKey: qk.library.mine({}),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<MyLibraryItem>>(
        `library/me${params({ page: pageParam, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<MyLibraryItem>) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    select: (data: { pages: Paginated<MyLibraryItem>[] }) => ({
      pages: data.pages,
      items: data.pages.flatMap((p) => p.items),
    }),
  });
}
export function useLibraryMaterial(id: string | undefined) {
  return useQuery({
    queryKey: qk.library.material(id ?? "none"),
    queryFn: ({ signal }) =>
      api.get<LibraryMaterialDetail>(`library/materials/${id}`, { signal }),
    enabled: !!id,
  });
}
export function useLibraryQuote() {
  return useMutation({
    mutationFn: (payload: { kind: LibraryPurchaseKind; targetId: string }) =>
      api.post<LibraryQuote>("library/quote", payload),
  });
}
export function useLibraryPurchase(materialId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { kind: LibraryPurchaseKind; targetId: string }) =>
      api.post<LibraryPurchaseResult>("library/purchase", payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.library.all });
      void qc.invalidateQueries({ queryKey: qk.wallet.all });
      if (materialId)
        void qc.invalidateQueries({
          queryKey: qk.library.material(materialId),
        });
    },
  });
}
export function useOpenDocument() {
  return useMutation({
    mutationFn: (partId: string) =>
      api.post<LibraryDocumentTicket>(`library/parts/${partId}/open`, {}),
    retry: false,
  });
}

export function useNotifications(unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: qk.notifications.list({ unreadOnly }),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<AppNotification>>(
        `notifications${params({ page: pageParam, pageSize: PAGE_SIZE, unread: unreadOnly || undefined })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<AppNotification>) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    select: (data: { pages: Paginated<AppNotification>[] }) => ({
      pages: data.pages,
      items: data.pages.flatMap((p) => p.items),
      total: data.pages[0]?.meta.total ?? 0,
    }),
  });
}
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: qk.notifications.unread(),
    queryFn: () => api.get<{ count: number }>("notifications/unread-count"),
    enabled,
    refetchInterval: 180_000,
    staleTime: 180_000,
  });
}
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`notifications/${id}/read`),
    // Optimistic, as on mobile: the row turns read and the badge drops by one
    // immediately, and both roll back if the server refuses.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.notifications.all });
      const snapshot = qc.getQueriesData({ queryKey: qk.notifications.all });
      qc.setQueriesData<{
        pages: Paginated<AppNotification>[];
        pageParams: unknown[];
      }>({ queryKey: qk.notifications.all }, (old) =>
        old && Array.isArray(old.pages)
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                items: p.items.map((n) =>
                  n.id === id ? { ...n, read: true } : n,
                ),
              })),
            }
          : old,
      );
      qc.setQueryData<{ count: number }>(qk.notifications.unread(), (old) =>
        old ? { count: Math.max(0, old.count - 1) } : old,
      );
      return { snapshot };
    },
    onError: (_e, _id, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.notifications.all });
    },
  });
}
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("notifications/read-all"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notifications.all });
    },
  });
}
export function useNotificationPreferences() {
  return useQuery({
    queryKey: qk.notifications.preferences(),
    queryFn: () =>
      api.get<NotificationPreferences>("notifications/preferences"),
  });
}
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: NotificationPreferences) =>
      api.put<NotificationPreferences>("notifications/preferences", next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: qk.notifications.preferences() });
      const previous = qc.getQueryData<NotificationPreferences>(
        qk.notifications.preferences(),
      );
      qc.setQueryData(qk.notifications.preferences(), next);
      return { previous };
    },
    onError: (_e, _n, ctx) => {
      if (ctx?.previous)
        qc.setQueryData(qk.notifications.preferences(), ctx.previous);
    },
  });
}

export function useSearch(term: string, entity?: string) {
  return useQuery({
    queryKey: qk.search.query(term, entity),
    queryFn: ({ signal }) =>
      api.get<SearchResultGroup[]>(`search${params({ q: term, entity })}`, {
        signal,
      }),
    enabled: term.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useSupportTickets() {
  return useInfiniteQuery({
    queryKey: qk.support.tickets({}),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<SupportTicketSummary>>(
        `support/tickets${params({ page: pageParam, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<SupportTicketSummary>) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    select: (data: { pages: Paginated<SupportTicketSummary>[] }) => ({
      pages: data.pages,
      items: data.pages.flatMap((p) => p.items),
    }),
  });
}
export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: qk.support.ticket(id ?? "none"),
    queryFn: ({ signal }) =>
      api.get<SupportTicketDetail>(`support/tickets/${id}`, { signal }),
    enabled: !!id,
  });
}
export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      subject: string;
      body: string;
      category?: string;
      courseId?: string;
    }) => api.post<SupportTicketDetail>("support/tickets", payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.support.all });
    },
  });
}
export function useReplyToTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<SupportTicketDetail>(`support/tickets/${ticketId}/messages`, {
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.support.ticket(ticketId) });
      void qc.invalidateQueries({ queryKey: qk.support.all });
    },
  });
}

export function useAuthorizedDevices() {
  return useQuery({
    queryKey: qk.devices.list(),
    queryFn: () => api.get<AuthorizedDevice[]>("devices"),
    staleTime: 5 * 60_000,
  });
}
export function useRequestDeviceChange() {
  return useMutation({
    mutationFn: (reason: string) =>
      api.post<{ ok: boolean }>("devices/change-request", { reason }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: { fullName: string }) =>
      api.patch<User>("profile", values),
    onSuccess: async () => {
      // `profile` is what the profile page reads; `me` alone left it stale.
      await qc.invalidateQueries({ queryKey: qk.auth.all });
    },
  });
}
