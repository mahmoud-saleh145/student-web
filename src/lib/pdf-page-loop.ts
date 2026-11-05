/**
 * Walks a PDF one page at a time, releasing each page as soon as it is drawn.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ProtectedPdf` draws every page onto its own canvas. PDF.js keeps a page's
 * decoded images alive until `page.cleanup()` is called, and the viewer never
 * called it, so every image of every page stayed in memory for as long as the
 * reader was open.
 *
 * For a typical document that cost nothing anyone noticed. For a 600 dpi scan it
 * is a lot: each A4 page is one 4968 x 7016 image, about 133 MB once decoded.
 * Measured in Chrome on a 17-page scan of that kind, the decoded images the page
 * still held peaked at 532 MB without this loop and 133 MB (one page) with it,
 * and nothing is left once the last page is drawn. Library documents like this
 * crashed iPhone Safari ("A problem repeatedly occurred" - no JavaScript error,
 * no failed request, nothing in any log).
 *
 * This removes the build-up. It does not make a single page cheaper: decoding
 * one such page still takes ~200 MB of short-lived memory inside PDF.js, so
 * very high resolution scans remain heavy on phones whatever the viewer does.
 *
 * The finished canvas keeps the rendered, watermarked pixels, so releasing the
 * page afterwards loses nothing that is on screen.
 *
 * Kept free of PDF.js and the DOM so the release guarantee is testable on its
 * own: see `pdf-page-loop.test.ts`.
 */

/** The part of a PDF.js page this loop touches. */
export interface ReleasablePage {
  cleanup(): unknown;
}

/** The part of a PDF.js document this loop touches. */
export interface PagedDocument<P extends ReleasablePage> {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<P>;
}

/**
 * Calls `draw` for pages 1..numPages in order, one at a time, and releases each
 * page before the next is fetched - including when `draw` throws, and including
 * a page fetched just as the viewer was closed.
 *
 * Returns `true` once every page has been drawn, `false` if `isCancelled`
 * stopped it first. An error from `getPage` or `draw` propagates, after the page
 * it concerned has been released.
 */
export async function drawPagesReleasingEach<P extends ReleasablePage>(
  doc: PagedDocument<P>,
  draw: (page: P, pageNumber: number) => Promise<void>,
  isCancelled: () => boolean
): Promise<boolean> {
  for (let n = 1; n <= doc.numPages; n += 1) {
    if (isCancelled()) return false;

    const page = await doc.getPage(n);
    try {
      if (isCancelled()) return false;
      await draw(page, n);
    } finally {
      page.cleanup();
    }
  }

  return !isCancelled();
}
