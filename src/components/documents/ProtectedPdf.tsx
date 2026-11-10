'use client';

import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import * as React from 'react';

import { burnWatermark } from '@/components/protection/Watermark';
import {
  classifyPdfLoadError,
  failureReference,
  type PdfLoadFailure,
  type PdfLoadPhase,
} from '@/lib/pdf-load-failure';
import { drawPagesReleasingEach } from '@/lib/pdf-page-loop';
import { burnImageWatermark, identityWatermarkText, loadWatermarkImage } from '@/lib/pdf-watermark';
import { pdfjsDocumentOptions } from '@/lib/pdfjs-document';
import { useTranslation } from '@/lib/session-context';

import pdfWatermark from '@/assets/brand/pdf-watermark.png';

/**
 * A purchased document, drawn rather than handed over.
 *
 * The reader used to point an `<iframe>` at the signed URL. The browser then
 * rendered it with its own PDF viewer — which carries a Download button and a
 * Print button, and whose address is one right-click away. Every protection
 * around the document (a short-lived URL bound to one viewer, the watermark,
 * the device binding behind it) ended at a toolbar the platform does not own.
 *
 * pdf.js reads the bytes and paints each page onto a canvas instead. There is
 * no file for the browser to offer, no viewer chrome, and no object URL left
 * behind: the bytes are fetched once, rendered, and dropped. A determined
 * reader can still photograph the screen — that is true of paper too — but the
 * easy path of pressing Save is gone.
 *
 * The worker is loaded from the app's own origin rather than a CDN, so the
 * document never depends on a third party being up or honest.
 *
 * pdf.js is loaded from its LEGACY build (pinned by lib/pdfjs-build.test.ts).
 * The default build calls `Promise.withResolvers` and other
 * recent APIs without a fallback, so on Safari before 17.4 and Chrome before
 * 119 opening a document threw before anything was requested, and the student
 * was told their reading link had expired.
 */
export function ProtectedPdf({
  url,
  watermark,
  secondary,
  onReopen,
  describeFailure,
  onFailure,
}: {
  url: string;
  /** The student's name, from the ticket. Shown in the corner badge too. */
  watermark: string;
  /** The student's ID line from the same ticket (`watermark.secondary`). */
  secondary?: string;
  /**
   * Asks the server for a NEW ticket after this one failed to load — it
   * expired, or the media gate refused it (revoked, session or device no
   * longer valid). The reader never retries the same signed URL, and never
   * builds or edits one: the next URL comes from the ticket route, which
   * re-checks the entitlement. Without it the generic failure is shown.
   */
  onReopen?: () => void;
  /**
   * The message for a failed load, and whether to offer `onReopen`. Given what
   * actually failed (lib/pdf-load-failure.ts) — never guessed from a missing
   * status. Without it the generic failure is shown.
   */
  describeFailure?: (failure: PdfLoadFailure) => { messageKey: string; canRetry: boolean };
  /** Told about every failed load, before it is shown, e.g. to retry once. */
  onFailure?: (failure: PdfLoadFailure) => void;
}) {
  const { t } = useTranslation();
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'failed'>('loading');
  const [pages, setPages] = React.useState(0);
  const [failure, setFailure] = React.useState<PdfLoadFailure | null>(null);
  // Read inside the effect without making it a dependency: a new callback
  // identity must not restart a document that is already loading.
  const onFailureRef = React.useRef(onFailure);
  onFailureRef.current = onFailure;

  React.useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    // A new ticket replaces a failed one: start over rather than keep the
    // failure on screen.
    setState('loading');
    setPages(0);
    setFailure(null);

    // Held so closing the reader can stop the work and free it: destroying the
    // loading task ends the document AND its worker thread, which otherwise
    // outlive the page along with every image they decoded.
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;
    // Which step an error came from: before any request (setup), the document
    // itself (load), or drawing its pages (render). See classifyPdfLoadError.
    let phase: PdfLoadPhase = 'setup';

    (async () => {
      try {
        // Requested first so it downloads beside the document. It never
        // rejects: an image that cannot load resolves to null, and the pages
        // are drawn without it - see lib/pdf-watermark.ts.
        const watermarkImage = loadWatermarkImage(pdfWatermark.src);
        const identity = identityWatermarkText(watermark, secondary);

        // The legacy build and its matching worker: both halves must come from
        // the same build. Kept as literal strings so the bundler can see them.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // Left while the pdf.js module was loading: no task exists yet, so stop
        // before creating one that nothing would ever destroy.
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        // Every PDF.js option for this viewer lives in lib/pdfjs-document.ts, so the
        // rendering configuration is testable and cannot drift. `disableFontFace: true`
        // is load-bearing - see the note there.
        loadingTask = pdfjs.getDocument(pdfjsDocumentOptions(url));
        phase = 'load';
        const doc = await loadingTask.promise;
        if (cancelled) return;
        phase = 'render';

        // Awaited before the first page so every page carries the same marks.
        const image = await watermarkImage;
        if (cancelled) return;

        host.replaceChildren();
        setPages(doc.numPages);

        // Draw above CSS resolution so the text stays sharp when the reader
        // zooms, but capped: a tall page at full device pixel ratio can exceed
        // the browser's canvas limit and silently render nothing at all.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // One page at a time, each released as soon as its canvas is finished.
        // The canvas keeps the rendered, watermarked pixels; what is released is
        // PDF.js's decoded copy of the page's images, which otherwise piles up
        // page after page - see lib/pdf-page-loop.ts.
        const completed = await drawPagesReleasingEach(
          doc,
          async (page) => {
            const base = page.getViewport({ scale: 1 });
            const width = host.clientWidth || 800;
            const viewport = page.getViewport({ scale: (width / base.width) * dpr });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.className = 'mb-3 block h-auto w-full rounded-lg bg-white shadow-sm';
            host.appendChild(canvas);

            const context = canvas.getContext('2d');
            if (!context) return;

            renderTask = page.render({ canvasContext: context, viewport });
            try {
              await renderTask.promise;
            } finally {
              renderTask = null;
            }

            // The marks are burned in before the page is released, so every
            // page that reaches the screen carries them.
            if (image) burnImageWatermark(context, canvas.width, canvas.height, image);
            burnWatermark(context, canvas.width, canvas.height, identity, dpr);
          },
          () => cancelled
        );

        if (completed && !cancelled) setState('ready');
      } catch (error) {
        if (!cancelled) {
          const classified = classifyPdfLoadError(error, phase);
          setFailure(classified);
          setState('failed');
          onFailureRef.current?.(classified);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
      releaseCanvases(host);
    };
  }, [url, watermark, secondary]);

  const described = failure && describeFailure ? describeFailure(failure) : null;

  return (
    <div className="relative" data-protected>
      <div
        ref={hostRef}
        aria-label={t('library.read')}
        className="select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      />

      {state === 'loading' ? (
        <p className="py-20 text-center text-sm text-muted">{t('library.opening')}</p>
      ) : null}

      {state === 'failed' ? (
        onReopen && described ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center" role="alert">
            <p className="max-w-sm text-sm text-danger">{t(described.messageKey)}</p>
            {described.canRetry ? (
              <button
                type="button"
                onClick={onReopen}
                className="h-10 cursor-pointer rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold transition hover:bg-surface-alt"
              >
                {t('library.reopen')}
              </button>
            ) : null}
            {failure ? (
              <p className="text-[11px] text-subtle">
                {t('library.errors.reference', { code: failureReference(failure) })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="py-20 text-center text-sm text-danger">{t('errors.genericBody')}</p>
        )
      ) : null}

      {state === 'ready' && pages > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none fixed bottom-6 end-6 select-none rounded bg-black/45 px-2 py-1 text-[11px] font-semibold text-white"
        >
          {watermark}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Frees the page canvases when the reader closes or switches document.
 *
 * Shrinking a canvas to 0x0 releases its backing store at once. WebKit
 * otherwise holds it until garbage collection, which on an iPhone can come too
 * late for the next document. The host has no React children, so emptying it
 * does not disturb React.
 */
function releaseCanvases(host: HTMLElement) {
  for (const canvas of host.querySelectorAll('canvas')) {
    canvas.width = 0;
    canvas.height = 0;
  }
  host.replaceChildren();
}
