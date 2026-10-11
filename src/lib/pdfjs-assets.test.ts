import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PDFJS_ASSET_BASE, pdfjsAssetOptions } from './pdfjs-assets.ts';

/**
 * Regression cover for the overlapping-glyph defect.
 *
 * `ProtectedPdf` used to call `getDocument({ url, withCredentials: false })`.
 * pdf.js does not bundle standard-font metrics or CMaps - it fetches them from
 * `standardFontDataUrl` / `cMapUrl`. With neither set it warns
 *
 *     Warning: UnknownErrorException:
 *     Ensure that the `standardFontDataUrl` API parameter is provided.
 *
 * does NOT fail the page, and then draws text using substitute advances. The
 * symptom is glyphs overlapping and words merging - a document that looks
 * corrupt - with nothing wrong reported by the UI.
 *
 * These tests assert the OBSERVABLE contract rather than the source text: they
 * load a real PDF through the real pdf.js using the exact options this module
 * hands the viewer, and require that pdf.js does NOT emit the warning. Removing
 * `standardFontDataUrl` makes them fail.
 *
 * The PDF is generated here rather than checked in: a ~600-byte file whose text
 * uses a NON-EMBEDDED standard-14 font, which is the case that needs the real
 * metrics. It contains no real course material.
 */

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Minimal valid PDF; text set in Helvetica, which is not embedded. */
function standardFontPdf(): Uint8Array {
  const objs: string[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] ' +
    '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>';
  const content = 'BT /F1 18 Tf 20 70 Td (Lecture notes: Hello World) Tj ET';
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objs[5] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

/**
 * Loads the generated PDF, capturing whatever pdf.js prints while it works.
 *
 * Captured at the console rather than by patching `pdfjs.Util` on purpose: the
 * font loader lives in the worker and reports through its own module instance,
 * so patching the exported `Util` object silently catches nothing. The warning
 * does reach the console, and that is what a developer would actually see.
 *
 * `getDocument` detaches the buffer it is given, so each call gets a fresh copy.
 */
async function loadWithOptions(extra: Record<string, unknown>) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const seen: string[] = [];

  const record = (...args: unknown[]) => {
    seen.push(args.map((a) => String(a)).join(' '));
  };
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  console.warn = record;
  console.log = record;
  console.error = record;

  try {
    const doc = await pdfjs
      .getDocument({
        data: standardFontPdf(),
        useWorkerFetch: false,
        isEvalSupported: false,
        ...extra,
      } as never)
      .promise;
    const page = await doc.getPage(1);
    const text = await page.getTextContent();
    return {
      text: text.items.map((i) => ('str' in i ? i.str : '')).join(''),
      seen,
    };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
  }
}

const assetOptions = pdfjsAssetOptions();

test('the viewer is told where pdf.js keeps its font data', () => {
  // The options the viewer merges into getDocument. If someone drops one of
  // these, glyph overlap returns silently.
  assert.equal(typeof assetOptions.standardFontDataUrl, 'string');
  assert.equal(typeof assetOptions.cMapUrl, 'string');
  assert.equal(assetOptions.cMapPacked, true);

  assert.ok(
    assetOptions.standardFontDataUrl.endsWith('/standard_fonts/'),
    'standardFontDataUrl must address the standard_fonts directory',
  );
  assert.ok(assetOptions.cMapUrl.endsWith('/cmaps/'), 'cMapUrl must address the cmaps directory');
  // pdfjs-dist ships .bcmap, so the packed flag must be on.
  assert.equal(assetOptions.cMapPacked, true);
});

/** Maps a published `/pdfjs/...` URL onto the same directory on disk. */
function toDisk(url: string): string {
  return url.replace(`${PDFJS_ASSET_BASE}/`, join(ROOT, 'public', 'pdfjs').replace(/\\/g, '/') + '/');
}

test('the published files actually satisfy pdf.js, with the viewer\'s own options', async () => {
  // Behavioural guard on the exported config, not a shape check: these are the
  // exact URLs the viewer passes. If they are emptied, undefined reaches
  // pdf.js, the warning comes back, and this fails - which is the regression.
  const { text, seen } = await loadWithOptions({
    standardFontDataUrl: toDisk(assetOptions.standardFontDataUrl),
    cMapUrl: toDisk(assetOptions.cMapUrl),
    cMapPacked: assetOptions.cMapPacked,
  });

  assert.match(text, /Lecture notes/);
  assert.ok(
    !seen.some((m) => m.includes('standardFontDataUrl')),
    `pdf.js warned about missing font data: ${seen.join(' | ')}`,
  );
  assert.ok(
    !seen.some((m) => m.includes('cMapUrl')),
    `pdf.js warned about missing CMap data: ${seen.join(' | ')}`,
  );
});

test('the same document loaded WITHOUT the options warns - the defect this fixes', async () => {
  // Still extracts text, which is exactly why the bug was invisible: nothing
  // fails, nothing surfaces in the UI, the glyphs just come out wrong.
  const { text, seen } = await loadWithOptions({});

  assert.match(text, /Lecture notes/);
  assert.ok(
    seen.some((m) => m.includes('standardFontDataUrl')),
    'expected the un-configured load to warn; if pdf.js changed, re-check this guard',
  );
});

test('the build publishes both asset directories', () => {
  // The runtime URLs above are only useful if the files are actually served.
  const published = join(ROOT, 'public', PDFJS_ASSET_BASE.replace(/^\//, ''));

  for (const dir of ['cmaps', 'standard_fonts']) {
    const target = join(published, dir);
    assert.ok(existsSync(target), `${dir} was not published to public/ - run npm run pdfjs:assets`);
    assert.ok(readdirSync(target).length > 0, `${dir} was published empty`);
  }
});