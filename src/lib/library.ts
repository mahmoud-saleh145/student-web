/**
 * What the Library screens may show, decided from the backend's answer alone.
 *
 * The backend (Phase 1) is the authority on every Library decision: which
 * materials a student may see (academic scope + the storefront switch), what
 * each part means to them (`access`), and whether a document may be opened
 * (the ticket route). Nothing here re-derives eligibility from a profile, a
 * year/level or a price. It only reads the states the server returned and
 * maps them to actions — and, for the transition period, falls back to the
 * deprecated mirror fields (`owned`, `purchasable`, `isPreview`, `fullyOwned`,
 * `available`) when talking to a backend that predates `access`/`view`/
 * `status`.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

import type { PdfLoadFailure } from './pdf-load-failure.ts';

export type LibraryPartAccess = 'OWNED' | 'REVOKED' | 'PREVIEW' | 'PURCHASABLE' | 'UNAVAILABLE';
/**
 * What the student holds for a part, independent of what they can do with it
 * (Decision B). A part can be revoked AND offered as a free preview: `access`
 * then says PREVIEW and `ownership` says REVOKED.
 */
export type LibraryPartOwnership = 'OWNED' | 'REVOKED' | 'NONE';
export type LibraryPackageAccess = 'OWNED' | 'PURCHASABLE' | 'UNAVAILABLE';
export type LibraryView = 'FULL' | 'OWNER';
export type MyLibraryStatus = 'READABLE' | 'WITHDRAWN';

const PART_ACCESS: ReadonlySet<string> = new Set([
  'OWNED',
  'REVOKED',
  'PREVIEW',
  'PURCHASABLE',
  'UNAVAILABLE',
]);
const PACKAGE_ACCESS: ReadonlySet<string> = new Set(['OWNED', 'PURCHASABLE', 'UNAVAILABLE']);

export interface PartAccessInput {
  access?: string | null;
  ownership?: string | null;
  owned?: boolean;
  isPreview?: boolean;
  purchasable?: boolean;
}

/**
 * The part's access state. `access` wins whenever it is present; an unknown
 * value is treated as UNAVAILABLE (fail closed), never as purchasable.
 */
export function partAccess(part: PartAccessInput): LibraryPartAccess {
  if (typeof part.access === 'string') {
    return PART_ACCESS.has(part.access) ? (part.access as LibraryPartAccess) : 'UNAVAILABLE';
  }
  // Legacy backend: the mirrors only. Owning wins over being a preview.
  if (part.owned) return 'OWNED';
  if (part.isPreview) return 'PREVIEW';
  if (part.purchasable) return 'PURCHASABLE';
  return 'UNAVAILABLE';
}

/**
 * The part's ownership, for labelling only: it never decides an action, which
 * is `access`'s job. A backend that predates `ownership` is read from the
 * access state, which then held the same information (REVOKED outranked
 * everything but OWNED). An unknown value says nothing is held.
 */
export function partOwnership(part: PartAccessInput): LibraryPartOwnership {
  if (typeof part.ownership === 'string') {
    return part.ownership === 'OWNED' || part.ownership === 'REVOKED' ? part.ownership : 'NONE';
  }
  const access = partAccess(part);
  return access === 'OWNED' ? 'OWNED' : access === 'REVOKED' ? 'REVOKED' : 'NONE';
}

export interface PackageAccessInput {
  access?: string | null;
  fullyOwned?: boolean;
}

export function packageAccess(pkg: PackageAccessInput): LibraryPackageAccess {
  if (typeof pkg.access === 'string') {
    return PACKAGE_ACCESS.has(pkg.access) ? (pkg.access as LibraryPackageAccess) : 'UNAVAILABLE';
  }
  // Legacy backend: it offered every package that was not fully owned. The
  // quote and the purchase are refused server-side for anything unavailable,
  // so this can at worst show a Buy button that the quote then declines.
  return pkg.fullyOwned ? 'OWNED' : 'PURCHASABLE';
}

/** A response without `view` is the full view of a pre-Phase-1 backend. */
export function materialView(detail: { view?: string | null }): LibraryView {
  return detail.view === 'OWNER' ? 'OWNER' : 'FULL';
}

export interface PartActions {
  /** Open in the reader. */
  read: boolean;
  /** The reader is being opened for a free preview, not an owned copy. */
  preview: boolean;
  buy: boolean;
}

/**
 * Which buttons a part gets. In the owner view only an OWNED part is ever
 * actionable, whatever else the response might contain.
 */
export function partActions(access: LibraryPartAccess, view: LibraryView): PartActions {
  if (view === 'OWNER') {
    return { read: access === 'OWNED', preview: false, buy: false };
  }
  return {
    read: access === 'OWNED' || access === 'PREVIEW',
    preview: access === 'PREVIEW',
    buy: access === 'PURCHASABLE',
  };
}

/**
 * The parts a view may list. The owner view lists owned parts only — the
 * backend already sends nothing else, and this keeps it that way if it ever
 * did.
 */
export function visibleParts<T extends PartAccessInput>(parts: T[], view: LibraryView): T[] {
  return view === 'OWNER' ? parts.filter((part) => partAccess(part) === 'OWNED') : parts;
}

export function myLibraryStatus(item: { status?: string | null; available?: boolean }): MyLibraryStatus {
  if (item.status === 'READABLE' || item.status === 'WITHDRAWN') return item.status;
  return item.available === false ? 'WITHDRAWN' : 'READABLE';
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type LibraryErrorContext = 'browse' | 'material' | 'purchase' | 'reader' | 'preview';

/**
 * The dictionary key for a Library failure, or null to use the app's generic
 * mapping (which already covers device binding, session, credit and the
 * like).
 *
 * The generic mapping speaks about courses ("Payment is required to access
 * this course", "This course has been archived"), which is wrong on a Library
 * screen; and two Library codes have no generic entry at all. What the student
 * is told never names the reason a material is hidden: "out of scope",
 * "storefront off" and "does not exist" all read the same, exactly as the
 * backend answers them with the same 404.
 */
export function libraryErrorKey(
  code: string | undefined,
  status: number | undefined,
  context: LibraryErrorContext,
): string | null {
  switch (code) {
    case 'LIBRARY_ENTITLEMENT_REVOKED':
      // Decision B: a free preview is not ownership. When a preview is refused
      // to someone whose copy was revoked, the preview is what is unavailable.
      return context === 'preview' ? 'library.errors.previewUnavailable' : 'library.errors.revoked';
    case 'LIBRARY_NOT_AVAILABLE':
      return 'library.errors.notAvailable';
    case 'NOT_FOUND':
      return context === 'preview' ? 'library.errors.previewUnavailable' : 'library.errors.notAvailable';
    case 'PAYMENT_REQUIRED':
      return context === 'preview' ? 'library.errors.previewUnavailable' : 'library.errors.notOwned';
    case 'COURSE_ARCHIVED':
      return 'library.errors.withdrawn';
    case 'INVALID_STATE':
      return 'library.errors.notForSale';
    case 'CONFLICT':
      return context === 'purchase' ? 'library.errors.alreadyOwned' : null;
    case 'FORBIDDEN':
      return 'library.errors.forbidden';
    case 'NETWORK_OFFLINE':
    case 'NETWORK_TIMEOUT':
      return 'library.errors.network';
    default:
      break;
  }
  // Device binding, session, credit, maintenance: the generic messages are right.
  if (code && (code.startsWith('DEVICE_') || code === 'INSUFFICIENT_CREDIT' || code === 'WALLET_LOCKED')) {
    return null;
  }
  if (status === 404) return context === 'preview' ? 'library.errors.previewUnavailable' : 'library.errors.notAvailable';
  if (status === 403) return 'library.errors.forbidden';
  if (status === 410) return 'library.errors.withdrawn';
  if (status !== undefined && (status === 0 || status >= 500)) return 'library.errors.network';
  return null;
}

/** New tickets the reader will ask for after the media gate refuses one. */
export const READER_MAX_REOPENS = 2;

/**
 * What the reader says when a document it was given fails to load, and whether
 * it offers another try. `failure` is what actually went wrong
 * (lib/pdf-load-failure.ts), not just an HTTP status.
 *
 *   unverifiable  503: the gate could not verify the ticket. Nothing was
 *                 decided, so trying again is always offered.
 *   refused       401/403/410: the ticket expired or was refused. Asking again
 *                 re-checks on the server; after READER_MAX_REOPENS the offer
 *                 stops, so a refusal can never become an endless loop.
 *   network       the download did not complete. Trying again is offered.
 *   server        any other gate status. Trying again is offered.
 *   missing       404: the file is not in storage. A new ticket cannot fix it.
 *   invalid       the file is damaged. A new ticket cannot fix it.
 *   client        this browser cannot run the viewer. A new ticket cannot fix it.
 *   render        a page failed to draw; one more try, then stop.
 *   unknown       as `render`.
 *
 * Every retry is the student's own click and costs one ticket request. The one
 * automatic retry the reader makes is decided by `readerAutoRetry`.
 */
export function readerLoadFailure(input: {
  failure: PdfLoadFailure;
  preview: boolean;
  reopens: number;
}): { messageKey: string; canRetry: boolean } {
  const { failure, preview, reopens } = input;
  const exhausted = reopens >= READER_MAX_REOPENS;
  switch (failure.kind) {
    case 'unverifiable':
      return { messageKey: 'library.errors.verifyUnavailable', canRetry: true };
    case 'refused':
      if (exhausted) {
        return {
          messageKey: preview ? 'library.errors.previewUnavailable' : 'library.errors.readerRefused',
          canRetry: false,
        };
      }
      return {
        messageKey: preview ? 'library.errors.previewLoadFailed' : 'library.errors.ticketExpired',
        canRetry: true,
      };
    case 'network':
      return { messageKey: 'library.errors.downloadInterrupted', canRetry: true };
    case 'server':
      return { messageKey: 'library.errors.deliveryFailed', canRetry: true };
    case 'missing':
      return { messageKey: 'library.errors.fileMissing', canRetry: false };
    case 'invalid':
      return { messageKey: 'library.errors.fileDamaged', canRetry: false };
    case 'client':
      return { messageKey: 'library.errors.browserUnsupported', canRetry: false };
    case 'render':
      return { messageKey: 'library.errors.renderFailed', canRetry: !exhausted };
    default:
      return { messageKey: 'library.errors.deliveryFailed', canRetry: !exhausted };
  }
}

/**
 * Whether the reader should quietly ask for one new ticket before showing an
 * error. Only for failures that are plausibly momentary (the connection
 * dropped, the gate or the API hiccuped) and only once per visit: a refusal is
 * never retried automatically, and nothing that a new ticket cannot fix is.
 */
export const READER_AUTO_RETRIES = 1;

export function readerAutoRetry(failure: PdfLoadFailure, autoRetries: number): boolean {
  if (autoRetries >= READER_AUTO_RETRIES) return false;
  return failure.kind === 'network' || failure.kind === 'unverifiable' || failure.kind === 'server';
}

/** Whether trying again could help — a refusal will not change on retry. */
export function isRetryableLibraryError(code: string | undefined, status: number | undefined): boolean {
  if (code === 'NETWORK_OFFLINE' || code === 'NETWORK_TIMEOUT') return true;
  return status === undefined || status === 0 || status >= 500;
}
