/**
 * What the success screen shows: the result of the activation just made.
 *
 * Carried from the page that activated to `/activate/success` in the tab's
 * `sessionStorage` — not in the URL. A success URL with details in it would
 * put a course, an amount or (worse) a code into browser history, the
 * referrer, server logs and any link the student shares.
 *
 * WHAT IS STORED: display facts the server already confirmed — a course title,
 * the names of the parts that became owned, an amount credited. WHAT IS NEVER
 * STORED: the access code or recharge code, and any token. The record also
 * names the account it belongs to, and is ignored for any other.
 *
 * It is a receipt, not a record of entitlement. Ownership lives on the
 * backend; clearing this changes nothing the student owns, and forging it
 * grants nothing — it only changes what one screen says.
 *
 * Pure apart from the storage it is handed, so it runs under `node --test`.
 */

export const LAST_ACTIVATION_KEY = 'edu-activation-last';

/** A receipt older than this is not "the activation just made". */
export const LAST_ACTIVATION_TTL_MS = 30 * 60_000;

export interface NamedItem {
  title: string;
  titleAr?: string | null;
}

export type CourseOutcome =
  /** Ownership changed; `wholeCourse` / `parts` / `sections` say how. */
  | 'unlocked'
  /** Accepted by the server, but ownership did not change. */
  | 'nothing-new'
  /** Accepted, but ownership could not be re-read to say what changed. */
  | 'unverified'
  /** Joined a free course. */
  | 'joined'
  /** A request for approval was filed. */
  | 'pending-approval';

export interface CourseActivation {
  kind: 'course';
  courseId: string;
  courseTitle: string;
  outcome: CourseOutcome;
  wholeCourse: boolean;
  parts: NamedItem[];
  sections: NamedItem[];
  /** Set for a teacher card, which may cover more courses than this one. */
  teacherName: string | null;
}

export interface RechargeActivation {
  kind: 'recharge';
  credited: number;
  balance: number;
  currency: string;
}

export interface LibraryActivation {
  kind: 'library';
  materialId: string | null;
  title: string;
  partsGranted: number;
  pricePaid: number;
  balanceAfter: number;
  currency: string;
  alreadyPurchased: boolean;
}

export type ActivationReceipt = CourseActivation | RechargeActivation | LibraryActivation;

interface Stored {
  userId: string;
  at: number;
  receipt: ActivationReceipt;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function namedItems(value: unknown): NamedItem[] | null {
  if (!Array.isArray(value)) return null;
  const out: NamedItem[] = [];
  for (const item of value) {
    const v = item as { title?: unknown; titleAr?: unknown } | null;
    if (!v || !isString(v.title)) return null;
    out.push({ title: v.title, titleAr: isString(v.titleAr) ? v.titleAr : null });
  }
  return out;
}

const COURSE_OUTCOMES: ReadonlySet<string> = new Set(['unlocked', 'nothing-new', 'unverified', 'joined', 'pending-approval']);

/** Rebuilds a receipt from untrusted storage, keeping only known fields. */
export function parseReceipt(value: unknown): ActivationReceipt | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;

  if (v.kind === 'course') {
    const parts = namedItems(v.parts);
    const sections = namedItems(v.sections);
    if (!isString(v.courseId) || !isString(v.courseTitle) || !isString(v.outcome) || !COURSE_OUTCOMES.has(v.outcome)) return null;
    if (!parts || !sections) return null;
    return {
      kind: 'course',
      courseId: v.courseId,
      courseTitle: v.courseTitle,
      outcome: v.outcome as CourseOutcome,
      wholeCourse: v.wholeCourse === true,
      parts,
      sections,
      teacherName: isString(v.teacherName) ? v.teacherName : null,
    };
  }

  if (v.kind === 'recharge') {
    if (!isNumber(v.credited) || !isNumber(v.balance) || !isString(v.currency)) return null;
    return { kind: 'recharge', credited: v.credited, balance: v.balance, currency: v.currency };
  }

  if (v.kind === 'library') {
    if (!isString(v.title) || !isNumber(v.partsGranted) || !isNumber(v.pricePaid) || !isNumber(v.balanceAfter) || !isString(v.currency)) {
      return null;
    }
    return {
      kind: 'library',
      materialId: isString(v.materialId) ? v.materialId : null,
      title: v.title,
      partsGranted: v.partsGranted,
      pricePaid: v.pricePaid,
      balanceAfter: v.balanceAfter,
      currency: v.currency,
      alreadyPurchased: v.alreadyPurchased === true,
    };
  }

  return null;
}

export function saveLastActivation(storage: Storage, userId: string, receipt: ActivationReceipt, now: number = Date.now()): void {
  try {
    const clean = parseReceipt(receipt);
    if (!clean) return;
    const stored: Stored = { userId, at: now, receipt: clean };
    storage.setItem(LAST_ACTIVATION_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or disabled: the activation still happened; only the
    // receipt screen has less to say.
  }
}

export function readLastActivation(storage: Storage, userId: string, now: number = Date.now()): ActivationReceipt | null {
  try {
    const raw = storage.getItem(LAST_ACTIVATION_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Stored> | null;
    if (!stored || stored.userId !== userId || !isNumber(stored.at)) return null;
    if (now - stored.at > LAST_ACTIVATION_TTL_MS || stored.at > now + 60_000) return null;
    return parseReceipt(stored.receipt);
  } catch {
    return null;
  }
}

export function clearLastActivation(storage: Storage): void {
  try {
    storage.removeItem(LAST_ACTIVATION_KEY);
  } catch {
    // Nothing depends on this.
  }
}
