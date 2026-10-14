/**
 * The marks drawn into every page of a protected PDF: the Student Center
 * watermark image, and the text of the student-identity tile.
 *
 * Both document flows - lecture attachments (`/viewer/[id]`) and Library
 * documents (`/library/reader/[id]`) - render through `ProtectedPdf`, which
 * paints each page onto a canvas. The image is drawn INTO that canvas right
 * after the page, beside the student-name tile from `burnWatermark`, so it
 * scrolls, stretches and zooms with the page exactly as the page itself does.
 *
 * This is a display-time mark. The PDF is not modified: the stored file, and
 * the bytes behind the signed URL, are still the original.
 *
 * Two rules everything here follows:
 *
 *   - It can never cost the student the document. An image that fails to load,
 *     or to draw, is skipped, and the page renders exactly as it did before
 *     this existed - with the student-name watermark.
 *   - It never makes the page harder to read. It is drawn with `multiply`,
 *     which can only darken: black text stays black, and no pixel of the image
 *     can lighten what is beneath it.
 */

/**
 * The text tiled across each page by `burnWatermark`: the student's name and
 * their ID, as composed by the server in the document ticket
 * (`watermark.primary` and `watermark.secondary`, e.g. "ID: 3F9A1C2B").
 *
 * Joined the way the web `Watermark` overlay joins them for video and images,
 * so the same student reads the same way on every protected surface. Both
 * halves come from the ticket, never from the client's own session, so a
 * patched client cannot put someone else's identity on the page.
 */
export function identityWatermarkText(primary: string, secondary?: string | null): string {
  return [primary, secondary]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** The largest share of the page's width, and of its height, the image may cover. */
export const PDF_WATERMARK_MAX_PAGE_FRACTION = 0.75;

/**
 * Opacity of the image.
 *
 * Higher than the 0.1 of the solid student-name text because the artwork is
 * already a sparse dot pattern: at phone width the dots blend into a light
 * grey, and at 0.25 the mark all but disappeared there.
 */
export const PDF_WATERMARK_OPACITY = 0.35;

/**
 * How long a document waits for the image before drawing its pages without it.
 *
 * The image is requested alongside the document, so this only matters when the
 * asset itself is stuck. A slow watermark must not hold a document hostage.
 */
export const PDF_WATERMARK_LOAD_TIMEOUT_MS = 8000;

export interface WatermarkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A decoded image, with the intrinsic size the browser reports for it. */
export type WatermarkImage = CanvasImageSource & {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
};

/** The part of a 2D context this module touches - narrow, so tests can supply one. */
export type WatermarkContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'drawImage'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'imageSmoothingEnabled'
  | 'imageSmoothingQuality'
>;

/**
 * Where the image goes on one page: centred, aspect ratio preserved, and scaled
 * to fit inside `maxFraction` of the page in BOTH directions, so a landscape
 * page and a tall one carry a mark of the same relative weight.
 *
 * The sizes are the canvas's own pixel size, which already includes the device
 * pixel ratio, so the mark is the same share of the page on every screen.
 * Returns null for any size that cannot be drawn (zero, negative, NaN).
 */
export function watermarkPlacement(
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
  maxFraction: number = PDF_WATERMARK_MAX_PAGE_FRACTION
): WatermarkBox | null {
  const sizes = [pageWidth, pageHeight, imageWidth, imageHeight, maxFraction];
  if (!sizes.every((n) => Number.isFinite(n) && n > 0)) return null;

  const scale = Math.min((pageWidth * maxFraction) / imageWidth, (pageHeight * maxFraction) / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

/**
 * Draws the image onto one rendered page. Never throws.
 *
 * Returns whether it drew, for the tests; the viewer does not need to know,
 * because a page without the image is still a correct page.
 */
export function burnImageWatermark(
  context: WatermarkContext,
  pageWidth: number,
  pageHeight: number,
  image: WatermarkImage
): boolean {
  const box = watermarkPlacement(pageWidth, pageHeight, image.naturalWidth, image.naturalHeight);
  if (!box) return false;

  context.save();
  try {
    context.globalAlpha = PDF_WATERMARK_OPACITY;
    context.globalCompositeOperation = 'multiply';
    // The artwork is ~1800px and is drawn several times smaller on a phone;
    // without smoothing its dot pattern aliases into stripes.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, box.x, box.y, box.width, box.height);
    return true;
  } catch {
    return false;
  } finally {
    context.restore();
  }
}

/**
 * Loads the image, resolving to null rather than rejecting.
 *
 * Every way this can fail - the request errors, the file is not an image the
 * browser can decode, it reports no size, or it never arrives - ends in null,
 * and null means "draw the pages without it". Because the promise never
 * rejects, awaiting it inside the viewer's try block cannot turn into the
 * viewer's "could not open this document" state.
 */
export function loadWatermarkImage(
  src: string,
  timeoutMs: number = PDF_WATERMARK_LOAD_TIMEOUT_MS
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || !src) {
      resolve(null);
      return;
    }

    const image = new Image();
    const settle = (result: HTMLImageElement | null) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timer = setTimeout(() => settle(null), timeoutMs);

    image.onload = () => settle(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
    image.onerror = () => settle(null);
    image.decoding = 'async';
    image.src = src;
  });
}
