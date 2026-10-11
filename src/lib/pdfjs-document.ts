import { pdfjsAssetOptions } from './pdfjs-assets.ts';

/**
 * How every PDF in this app is handed to PDF.js.
 *
 * Both document flows - lecture attachments and standalone Library documents -
 * render through `ProtectedPdf`, so this is the single place their PDF.js
 * behaviour is decided.
 *
 * `disableFontFace: true` is REQUIRED, not a preference. It is set
 * unconditionally for this reason:
 *
 * By default pdf.js registers each EMBEDDED font as an `@font-face` rule and
 * lets the BROWSER shape the text and supply the advance widths. That makes
 * rendering depend on the device's font engine. Measured in production: the
 * same document rendered correctly on two devices and with overlapping, merged
 * glyphs on two others, while the same file was always fine in an external
 * viewer. Forcing PDF.js to convert glyphs to path commands with its own font
 * renderer makes outlines and advances identical on every device.
 *
 * Verified on the affected device before and after: the `?ff=1` diagnostic
 * switch reproduced the fix, with no measurable slowdown.
 *
 * Two things this costs, and why they are acceptable here:
 *
 *   - Text is drawn as paths, so PDF.js's text layer carries no glyphs. This
 *     viewer already renders to a bare `<canvas>` with no text layer, so there
 *     is no selection or find-in-page to lose.
 *   - Path rasterisation is slower than native text. Measured on the affected
 *     device as no noticeable difference.
 *
 * Do not "simplify" this back to the default. The failure it fixes is silent -
 * no error is raised anywhere - and looks like a corrupt document rather than
 * a rendering bug.
 */
export function pdfjsDocumentOptions(url: string) {
  // No credentials: the URL is bound to one viewer by its signature, and asking
  // for credentials on a cross-origin read would demand a stricter CORS
  // contract from the edge for no gain.
  return {
    url,
    withCredentials: false,
    ...pdfjsAssetOptions(),
    disableFontFace: true,
  } as const;
}