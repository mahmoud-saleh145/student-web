export type UserRole = "MASTER" | "ADMIN" | "TEACHER" | "STUDENT";
export type Gender = "MALE" | "FEMALE";
export type AccountStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "DISABLED";

export interface University {
  id: string;
  name: string;
  nameAr: string;
  logoUrl?: string | null;
}

export interface Faculty {
  id: string;
  universityId: string;
  name: string;
  nameAr: string;
}

/**
 * Whether a department is a general department or a programme branch.
 *
 * Administrative metadata. It is deliberately NOT the academic system: whether a
 * college counts in years or in levels is its own configuration, resolved
 * server-side. Nothing in the student app reads this to decide a label.
 */
export type StudyType = "GENERAL" | "PROGRAMS";

export interface Department {
  studyType?: StudyType;
  id: string;
  facultyId: string;
  name: string;
  nameAr: string;
}

/** The academic progression system: نظام الفرق or نظام الليفلز. */
export type AcademicStructureKind = "YEAR" | "LEVEL";

export interface AcademicYear {
  id: string;
  order: number;
  name: string;
  nameAr: string;
  /**
   * Which vocabulary this rung is expressed in. Present on the public list and
   * on a profile's rung; the label a screen shows must come from here rather
   * than from anything the student selected.
   */
  kind?: AcademicStructureKind;
  /** Reported on a profile rung so the label follows the ladder it belongs to. */
  structure?: { kind: AcademicStructureKind } | null;
}

export interface User {
  id: string;
  fullName: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  gender: Gender;
  avatarUrl?: string | null;
  university: University | null;
  faculty: Faculty | null;
  department: Department | null;
  academicYear: AcademicYear | null;
  createdAt: string;
}

export interface Teacher {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  title?: string | null;
  bio?: string | null;
}

export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "HIDDEN";
export type EnrollmentMethod = "FREE" | "PAYMENT" | "CODE" | "ADMIN_APPROVAL";

export type AccessState =
  | "NOT_ENROLLED"
  | "PENDING_APPROVAL"
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "ARCHIVED";

export interface Money {
  amount: number;
  currency: string;
}

export interface CourseAccess {
  state: AccessState;
  expiresAt: string | null;
  enrolledAt: string | null;
  availableMethods: EnrollmentMethod[];
}

export interface CourseProgress {
  completedLessons: number;
  totalLessons: number;
  percent: number;
  lastLessonId: string | null;
  lastWatchedAt: string | null;
}

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  thumbnailUrl: string | null;
  teacher: Teacher;
  status: CourseStatus;
  price: Money | null;
  isFree: boolean;
  lessonCount: number;
  sectionCount: number;
  totalDurationSeconds: number;
  rating?: number | null;
  studentCount?: number | null;
  university?: Pick<University, "id" | "name" | "nameAr"> | null;
  academicYear?: Pick<AcademicYear, "id" | "name" | "nameAr"> | null;
  access: CourseAccess;
  progress: CourseProgress | null;
  publishedAt: string | null;
}

export interface CourseDetail extends CourseSummary {
  description: string;
  sections: CourseSection[];
  attachments: Attachment[];
  requirements: string[];
  outcomes: string[];
  updatedAt: string;
}

export interface CourseSection {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  order: number;
  lessonCount: number;
  durationSeconds: number;
  locked: boolean;
  unlocksAt: string | null;
  progressPercent: number;
  lessons: LessonSummary[];
}

export type LessonKind = "VIDEO" | "DOCUMENT" | "QUIZ" | "LIVE";

export interface LessonSummary {
  id: string;
  sectionId: string;
  courseId: string;
  title: string;
  kind: LessonKind;
  order: number;
  durationSeconds: number;
  isPreview: boolean;
  locked: boolean;
  attachmentCount: number;
  progress: WatchProgress | null;
}

export interface LessonDetail extends LessonSummary {
  description: string | null;
  video: VideoRef | null;
  attachments: Attachment[];
  nextLessonId: string | null;
  previousLessonId: string | null;
  nextVideoId: string | null;
  previousVideoId: string | null;
  completionRule: CompletionRule;
}

export interface CompletionRule {
  type: "WATCH_PERCENT" | "MANUAL" | "WATCH_FULL";
  threshold: number;
  requireContiguous: boolean;
}

export interface VideoRef {
  id: string;
  lessonId: string;
  courseId: string;
  assetId: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  availableQualities: string[];
  hasCaptions: boolean;
  captionLanguages: string[];
  status:
    "UPLOADING" | "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";
}

export type DrmScheme = "widevine" | "fairplay" | "none";

export interface PlaybackTicket {
  ticketId: string;
  manifestUrl: string;
  playbackHeaders: Record<string, string>;
  drm: {
    scheme: DrmScheme;
    licenseUrl: string | null;
    certificateUrl: string | null;
    licenseHeaders: Record<string, string>;
  };
  /** TEMPORARY playback hotfix: signed Gumlet embed-player URL, when the backend enables it. */
  embedUrl?: string | null;
  watermark: WatermarkPayload;
  captions: CaptionTrack[];
  expiresAt: string;
  ttlSeconds: number;
  resumePositionSeconds: number;
  streamSessionId: string;
  heartbeatIntervalSeconds: number;
}

export interface WatermarkPayload {
  primary: string;
  secondary: string;
  sessionTag: string;
  opacity: number;
  moveIntervalSeconds: number;
}

export interface CaptionTrack {
  language: string;
  label: string;
  url: string;
  isDefault: boolean;
}

export interface WatchProgress {
  lessonId: string;
  positionSeconds: number;
  durationSeconds: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

export interface ContinueWatchingItem {
  lesson: LessonSummary;
  course: Pick<CourseSummary, "id" | "title" | "thumbnailUrl" | "teacher">;
  progress: WatchProgress;
}

export type AttachmentKind =
  "PDF" | "IMAGE" | "DOC" | "SHEET" | "LINK" | "OTHER";

export interface Attachment {
  id: string;
  lessonId: string | null;
  courseId: string;
  title: string;
  kind: AttachmentKind;
  sizeBytes: number | null;
  pageCount: number | null;
  protected: boolean;
  downloadable: boolean;
  locked: boolean;
}

export interface AttachmentTicket {
  attachmentId: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
  watermark: WatermarkPayload;
}

export interface EnrollmentResult {
  state: AccessState;
  courseId: string;
  payment?: {
    provider: string;
    checkoutUrl: string;
    reference: string;
  } | null;
  message?: string | null;
}

export type NotificationKind =
  | "NEW_COURSE"
  | "NEW_SECTION"
  | "NEW_LESSON"
  | "NEW_VIDEO"
  | "ANNOUNCEMENT"
  | "PAYMENT"
  | "ENROLLMENT"
  | "COURSE_UPDATE"
  | "ADMIN"
  | "SECURITY";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  route: string | null;
  imageUrl: string | null;
}

export type SearchEntity = "COURSE" | "LESSON" | "TEACHER" | "ATTACHMENT";

export interface SearchResultGroup {
  entity: SearchEntity;
  total: number;
  items: SearchResultItem[];
}

export interface SearchResultItem {
  id: string;
  entity: SearchEntity;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  route: string;
  locked: boolean;
}

export interface AuthorizedDevice {
  id: string;
  name: string;
  platform: string;
  model: string;
  lastSeenAt: string;
  current: boolean;
  authorizedAt: string;
}

export interface HomeFeed {
  continueWatching: ContinueWatchingItem[];
  myCourses: CourseSummary[];
  newCourses: CourseSummary[];
  recommended: CourseSummary[];
  announcements: AppNotification[];
  stats: {
    enrolledCourses: number;
    completedLessons: number;
    watchTimeSeconds: number;
    streakDays: number;
  };
}

export type AdTargetType =
  "NONE" | "COURSE" | "SECTION" | "LESSON" | "EXTERNAL_URL" | "APP_SCREEN";

export interface AdTarget {
  type: AdTargetType;
  entityId: string | null;
  url: string | null;
}

export interface Advertisement {
  id: string;
  imageUrl: string;
  aspectRatio: number | null;
  title: string | null;
  description: string | null;
  ctaLabel: string | null;
  target: AdTarget;
  displayOrder: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface CoursePartSection {
  id: string;
  title: string;
  titleAr: string | null;
  sortOrder: number;
  locked: boolean;
}

export type CoursePartOwnership = "PART_PURCHASE" | "FULL_COURSE";

export interface CoursePart {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  sortOrder: number;
  price: number | null;
  pricePercent: number | null;
  currency: string;
  owned: boolean;
  ownedSince: string | null;
  ownedVia: CoursePartOwnership | null;
  purchasable: boolean;
  sectionCount: number;
  sections: CoursePartSection[];
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
}

export interface CourseJoinOptions {
  courseId: string;
  title: string;
  titleAr: string | null;
  fullCourse: {
    price: number | null;
    currency: string;
    isFree: boolean;
    owned: boolean;
    purchasable: boolean;
  };
  hasParts: boolean;
  ownsAllParts: boolean;
  parts: CoursePart[];
  methods: {
    accessCode: boolean;
    wallet: boolean;
    onlinePayment: boolean;
  };
  enrollmentMethods: EnrollmentMethod[];
}

export interface CoursePartsResponse {
  courseId: string;
  hasParts: boolean;
  coursePrice: number | null;
  ownsAllParts: boolean;
  parts: CoursePart[];
}

export type CoursePartAcquisition = "CODE" | "WALLET";

export interface CoursePartPurchase {
  id: string;
  courseId: string;
  courseTitle: string;
  partId: string;
  partTitle: string;
  valueAtAcquisition: number;
  currency: string;
  acquiredVia: CoursePartAcquisition;
  acquiredAt: string;
}

export type CodeTargetType = "COURSE" | "PART" | "SECTION" | "TEACHER";

export interface CodeValidation {
  valid: boolean;
  course: { id: string; title: string } | null;
  targetType: CodeTargetType;
  section: { id: string; title: string } | null;
  teacher: { id: string; fullName: string } | null;
  remainingRedemptions: number;
  accessDurationType: string | null;
  accessDurationDays: number | null;
  expiresAt: string | null;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  totalRecharged: number;
  totalSpent: number;
  transactionCount: number;
  updatedAt: string;
}

export type WalletTxDirection = "CREDIT" | "DEBIT";

export interface WalletTransaction {
  id: string;
  type: string;
  direction: WalletTxDirection;
  source: string;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export interface RechargeResult {
  codeId: string;
  code: string;
  credited: number;
  balance: number;
  currency: string;
  transactionId: string | null;
}

export interface LibrarySubject {
  id: string;
  name: string;
}

/**
 * Library wire types, as the Phase 1 backend sends them.
 *
 * `access` / `view` / `status` are the contract. The older boolean mirrors
 * (`owned`, `purchasable`, `isPreview`, `fullyOwned`, `available`) are still
 * sent during the transition and are read only as a fallback — see
 * `lib/library.ts`. Everything optional here is something one of the two
 * views, or an older backend, does not send.
 */
export type LibraryPartAccess = "OWNED" | "REVOKED" | "PREVIEW" | "PURCHASABLE" | "UNAVAILABLE";
export type LibraryPartOwnership = "OWNED" | "REVOKED" | "NONE";
export type LibraryPackageAccess = "OWNED" | "PURCHASABLE" | "UNAVAILABLE";

export interface LibraryAcademicYear {
  id: string;
  name: string;
  nameAr: string | null;
  kind: "YEAR" | "LEVEL";
}

export interface LibraryMaterialSummary {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  coverUrl: string | null;
  subject: LibrarySubject | null;
  /** A browse filter only — never who may see the material. */
  academicYear?: LibraryAcademicYear | null;
  partCount: number;
  packageCount: number;
  /** Parts of this material the student holds, unrevoked. */
  ownedPartCount?: number;
  priceFrom: number | null;
  priceTotal: number | null;
}

export interface LibraryPart {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  sortOrder: number;
  /** Absent in the owner view, which carries no prices. */
  price?: number;
  currency?: string;
  pageCount: number | null;
  mimeType: string | null;
  access?: LibraryPartAccess;
  /**
   * What the student holds, independent of `access` (Decision B): a revoked
   * part may still be offered as a free preview. Absent from an older backend.
   */
  ownership?: LibraryPartOwnership;
  ownedSince: string | null;
  thumbnailUrl?: string | null;
  /** Deprecated mirrors of `access`. */
  isPreview?: boolean;
  owned?: boolean;
  purchasable?: boolean;
}

export interface LibraryPackage {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  price: number;
  currency: string;
  partCount: number;
  partIds: string[];
  partsAlreadyOwned: number;
  access?: LibraryPackageAccess;
  /** Deprecated mirror of `access`. */
  fullyOwned?: boolean;
}

export interface LibraryMaterialDetail {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  coverUrl: string | null;
  subject: LibrarySubject | null;
  academicYear?: LibraryAcademicYear | null;
  /**
   * FULL: in scope with the storefront on. OWNER: the student's own parts
   * only — no prices, no packages, no counts. Absent from an older backend,
   * which only ever sent the full view.
   */
  view?: "FULL" | "OWNER";
  /** Full view only. */
  ownsAllParts?: boolean;
  parts: LibraryPart[];
  packages: LibraryPackage[];
}

export interface MyLibraryItem {
  entitlementId: string;
  partId: string;
  title: string;
  titleAr: string | null;
  materialId: string;
  materialTitle: string;
  pageCount: number | null;
  mimeType: string | null;
  source: string;
  grantedAt: string;
  status?: "READABLE" | "WITHDRAWN";
  /** Deprecated mirror of `status`. */
  available?: boolean;
}

export type LibraryPurchaseKind = "PART" | "PACKAGE";

export interface LibraryQuote {
  kind: LibraryPurchaseKind;
  targetId: string;
  title: string;
  materialTitle: string | null;
  price: number;
  currency: string;
  balance: number;
  sufficientCredit: boolean;
  shortfall: number;
  partCount: number;
  partsAlreadyOwned: number;
  fullyOwned: boolean;
  purchasable: boolean;
}

export interface LibraryPurchaseResult {
  purchaseId: string;
  kind: LibraryPurchaseKind;
  targetId: string;
  title: string;
  pricePaid: number;
  currency: string;
  balanceAfter: number;
  partsGranted: number;
  partsAlreadyOwned: number;
  purchasedAt: string;
  alreadyPurchased: boolean;
}

export interface LibraryPurchaseHistoryItem {
  id: string;
  kind: LibraryPurchaseKind;
  targetId: string | null;
  title: string;
  materialTitle: string | null;
  pricePaid: number;
  currency: string;
  partCount: number;
  purchasedAt: string;
}

export interface LibraryDocumentTicket {
  libraryPartId: string;
  title: string;
  url: string;
  mimeType: string | null;
  pageCount: number | null;
  expiresAt: string;
  watermark: WatermarkPayload;
}

export type SupportTicketStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type SupportTicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type SupportTicketCategory =
  "GENERAL" | "TECHNICAL" | "PAYMENT" | "ACCESS" | "CONTENT" | "OTHER";

export interface SupportTicketSummary {
  id: string;
  reference: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  lastMessageAt: string;
  createdAt: string;
}

export interface SupportMessage {
  id: string;
  body: string;
  isInternal: boolean;
  authorRole: UserRole;
  author: { id: string; fullName: string; role: UserRole } | null;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  courseId: string | null;
  messages: SupportMessage[];
}

export interface NotificationPreferences {
  newCourse: boolean;
  newLesson: boolean;
  announcements: boolean;
  payments: boolean;
}
