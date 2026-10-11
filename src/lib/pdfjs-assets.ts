/**
 * Where pdf.js gets its font and character-map data from.
 *
 * THE DEFECT THIS EXISTS TO FIX
 * ----------------------------
 * `getDocument` was called with `{ url, withCredentials: false }` and nothing
 * else. pdf.js does not bundle these resources: it fetches them at runtime from
 * `standardFontDataUrl` and `cMapUrl`. With neither set, pdf.js could not load
 * the metrics of any non-embedded standard-14 font and warned on every document:
 *
 *     Warning: UnknownErrorException:
 *     Ensure that the `standardFontDataUrl` API parameter is provided.
 *
 * It does NOT fail the page. It carries on using substitute metrics for the real
 * font, so glyph advances are wrong and the text overlaps - letters run into one
 * another and words merge. That is a rendering failure with no error surfaced
 * anywhere in the UI, which is why it looked like the document itself was
 * corrupted.
 *
 * Supplying the URLs makes pdf.js load the real font programs and the CMaps it
 * ships with, which is the only supported configuration. Verified against
 * pdfjs-dist 4.10.38: with these options the warning disappears and a standard
 * font document loads cleanly.
 *
 * The files themselves are copied out of the installed `pdfjs-dist` package by
 * `scripts/copy-pdfjs-assets.mjs` at build time, so they always match the
 * library version actually in use rather than being hand-vendored copies that
 * drift. Nothing is added to git; see `.gitignore`.
 */

/** Directory the build step publishes these assets under. */
export const PDFJS_ASSET_BASE = '/pdfjs';

/**
 * Runtime options merged into every `getDocument` call.
 *
 * `cMapPacked` must match the format on disk: pdfjs-dist ships `.bcmap`, which
 * is the packed binary form.
 */
export function pdfjsAssetOptions() {
  return {
    cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
  } as const;
}