import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pdfjsDocumentOptions } from './pdfjs-document.ts';

/**
 * The permanent fix for the cross-device rendering failure.
 *
 * By default pdf.js registers each EMBEDDED font as an `@font-face` rule and
 * lets the browser shape the text and supply advance widths, so rendering
 * depends on the device's font engine. Measured in production: one document
 * rendered correctly on two devices and with overlapping, merged glyphs on two
 * others, while the same file was always fine in an external viewer.
 *
 * Forcing PDF.js to draw glyphs as paths makes the output identical on every
 * device. That was proven on the affected device with a temporary `?ff=1`
 * switch before this became the unconditional default, and the switch has been
 * removed.
 *
 * These tests pin the setting so it cannot be "simplified" back, and assert
 * there is no longer any query-parameter or environment escape hatch.
 */

describe('PDF.js renders glyphs as paths', () => {
  const opts = pdfjsDocumentOptions('https://gate.example/signed-doc.pdf');

  it('always disables the browser font engine', () => {
    assert.equal(opts.disableFontFace, true);
  });

  it('is not a default that a caller can accidentally inherit', () => {
    // An explicit `false`, or a missing key, both restore the device-dependent
    // behaviour. The key must be present and true, unconditionally.
    assert.ok('disableFontFace' in opts);
    assert.notEqual(opts.disableFontFace, false);
  });

  it('does not depend on the URL, a query parameter, or the environment', () => {
    // The diagnostic switch keyed off `window.location.search`; the permanent
    // configuration must be the same for every document and every request.
    const a = pdfjsDocumentOptions('https://gate.example/a.pdf');
    const b = pdfjsDocumentOptions('https://gate.example/b.pdf');

    assert.equal(a.disableFontFace, true);
    assert.equal(b.disableFontFace, true);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  });
});

describe('the rest of the delivery configuration is preserved', () => {
  const opts = pdfjsDocumentOptions('https://gate.example/signed-doc.pdf');

  it('carries the signed URL through unchanged', () => {
    assert.equal(opts.url, 'https://gate.example/signed-doc.pdf');
  });

  it('does not ask the browser to send credentials', () => {
    // The URL is bound to one viewer by its signature; credentials would demand
    // a stricter CORS contract from the edge for no gain.
    assert.equal(opts.withCredentials, false);
  });

  it('still points pdf.js at the published font and CMap data', () => {
    // Unrelated to the font-engine change and still required: without these,
    // pdf.js warns and draws non-embedded fonts with substitute metrics.
    assert.ok(opts.standardFontDataUrl.endsWith('/standard_fonts/'));
    assert.ok(opts.cMapUrl.endsWith('/cmaps/'));
    assert.equal(opts.cMapPacked, true);
  });
});