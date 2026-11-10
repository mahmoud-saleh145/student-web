/**
 * What actually went wrong when a protected PDF failed to open.
 *
 * THE DEFECT THIS EXISTS TO FIX
 * ----------------------------
 * The reader used to keep one thing from a failed load: an HTTP status, when
 * pdf.js happened to carry one. Every failure without a status — and pdf.js
 * drops it for a 404, for a dropped connection, for a browser that cannot run
 * pdf.js at all, for a damaged file and for a page that failed to draw — was
 * then shown as "the reading link has expired or was refused", with a button
 * that asked the server for a new ticket.
 *
 * That message was wrong for nearly all of them, and the button could not help:
 * a browser missing `Promise.withResolvers` (Safari before 17.4, Chrome before
 * 119) threw before a single byte was requested, so every new ticket failed the
 * same way while the media gate never saw a request. The student was told their
 * link had been refused when nothing had refused anything.
 *
 * This module turns the error into a `PdfLoadFailure` the reader can explain
 * truthfully. It is pure (no pdf.js import) so every branch is unit-tested.
 */

export type PdfLoadFailureKind =
  /** 503 from the media gate: it could not verify the ticket. Nothing was decided. */
  | 'unverifiable'
  /** 401/403/410 from the media gate: the ticket expired or was refused. */
  | 'refused'
  /** 404 from the media gate: the file is not in storage. A new ticket cannot fix it. */
  | 'missing'
  /** Any other HTTP status from the media gate (5xx, 416, ...). */
  | 'server'
  /** The download never completed: offline, connection dropped, CORS, DNS. */
  | 'network'
  /** The bytes arrived but are not a readable PDF. */
  | 'invalid'
  /** This browser could not start the PDF engine (missing APIs, worker blocked). */
  | 'client'
  /** The document opened, but drawing a page failed (memory, canvas limits). */
  | 'render'
  | 'unknown';

export interface PdfLoadFailure {
  kind: PdfLoadFailureKind;
  /** The media gate's HTTP status, when pdf.js reported one. */
  status?: number;
}

/**
 * Where the reader was when the error was thrown.
 *
 *   setup   importing pdf.js, configuring its worker, creating the loading task
 *           — nothing has been requested from the media gate yet;
 *   load    waiting for the document (the request, the download, the parse);
 *   render  drawing pages of a document that already opened.
 */
export type PdfLoadPhase = 'setup' | 'load' | 'render';

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  details?: unknown;
}

/**
 * Text a browser's `fetch` uses for a request that never produced a response,
 * or a body that stopped arriving: Chromium, WebKit and Gecko respectively, and
 * the stream variants. pdf.js forwards these as `UnknownErrorException` whose
 * `details` is the original `TypeError` rendered as a string.
 */
const NETWORK_PATTERN =
  /failed to fetch|network ?error|load failed|networkerror when attempting|the network connection was lost|connection (?:reset|closed|refused)|terminated/i;

/** The bundler or the browser failing to download the viewer's own code. */
const CHUNK_PATTERN =
  /loading (?:css )?chunk .* failed|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i;

function asErrorLike(error: unknown): ErrorLike {
  return error !== null && typeof error === 'object' ? (error as ErrorLike) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The kind an HTTP status from the media gate stands for. */
export function kindForStatus(status: number): PdfLoadFailureKind {
  if (status === 503) return 'unverifiable';
  if (status === 401 || status === 403 || status === 410) return 'refused';
  if (status === 404) return 'missing';
  if (status === 0) return 'network';
  return 'server';
}

export function classifyPdfLoadError(error: unknown, phase: PdfLoadPhase): PdfLoadFailure {
  const e = asErrorLike(error);
  const name = text(e.name);
  const message = text(e.message);
  const details = text(e.details);

  // A status from the gate is the most precise fact available: use it whatever
  // the phase. (pdf.js 4.x: UnexpectedResponseException; 5.x: ResponseException.)
  if (typeof e.status === 'number' && Number.isInteger(e.status) && e.status > 0) {
    return { kind: kindForStatus(e.status), status: e.status };
  }

  // pdf.js reports a 404 as MissingPDFException and drops the status.
  if (name === 'MissingPDFException' || (name === 'ResponseException' && /\b404\b/.test(message))) {
    return { kind: 'missing', status: 404 };
  }

  if (name === 'InvalidPDFException' || name === 'FormatError') return { kind: 'invalid' };

  // Nothing was requested from the gate yet. The viewer's own code failing to
  // download (offline, a dropped connection) is a network failure; anything
  // else is this browser being unable to run the viewer — never the ticket.
  if (phase === 'setup') {
    if (name === 'ChunkLoadError' || CHUNK_PATTERN.test(message)) return { kind: 'network' };
    return { kind: 'client' };
  }

  if (name === 'TypeError' && NETWORK_PATTERN.test(message)) return { kind: 'network' };
  if (name === 'UnknownErrorException' && NETWORK_PATTERN.test(`${message} ${details}`)) {
    return { kind: 'network' };
  }

  // The worker could not be started or died: a client capability, not delivery.
  if (/setting up fake worker|worker was destroyed|worker.*failed/i.test(`${message} ${details}`)) {
    return { kind: 'client' };
  }

  if (phase === 'render') return { kind: 'render' };
  return { kind: 'unknown' };
}

/**
 * A short code the reader prints under the message, so a student's screenshot
 * tells support which branch they hit without anyone reproducing it.
 */
export function failureReference(failure: PdfLoadFailure): string {
  return `PDF-${failure.kind.toUpperCase()}${failure.status ? `-${failure.status}` : ''}`;
}
