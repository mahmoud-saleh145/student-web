import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { MIDDLEWARE_MATCHER, PUBLIC_ASSET_EXTENSIONS } from './middleware-match.ts';

/**
 * Regression cover for the cross-device rendering failure.
 *
 * The viewer's pdf.js fonts and CMaps live under `/pdfjs/**` and end in `.pfb`
 * and `.bcmap`. The session middleware's matcher did not exempt those
 * extensions, so every one of those fetches ran through the middleware and was
 * answered with a redirect to the login page.
 *
 * That failure is silent and device-specific, which is what made it so hard to
 * see: the fetch resolves with HTTP 200 and an HTML body, pdf.js cannot parse
 * font data out of it, and the document is drawn with whatever font the DEVICE
 * supplies as a fallback. Devices whose fallback happens to match the original
 * metrics look correct; the rest show overlapping, merged glyphs. The same file
 * in an external viewer is fine everywhere, because the external viewer carries
 * its own fonts.
 *
 * The tests below run the real matcher Next.js would apply, so a regression in
 * the extension list fails here rather than on a student's phone.
 */

/** Next applies the matcher to the pathname. */
function middlewareRuns(pathname: string): boolean {
  const pattern = MIDDLEWARE_MATCHER[0]!;
  return new RegExp(`^${pattern}$`).test(pathname);
}

describe('pdf.js runtime assets bypass the session redirect', () => {
  it('exempts standard font files', () => {
    assert.equal(middlewareRuns('/pdfjs/standard_fonts/FoxitSerif.pfb'), false);
    assert.equal(middlewareRuns('/pdfjs/standard_fonts/LiberationSans-Regular.ttf'), false);
  });

  it('exempts CMap files', () => {
    assert.equal(middlewareRuns('/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap'), false);
    assert.equal(middlewareRuns('/pdfjs/cmaps/UniGB-UCS2-H.bcmap'), false);
  });

  it('names the extensions the viewer actually requests', () => {
    // Guard against the list and the shipped assets drifting apart.
    assert.ok(PUBLIC_ASSET_EXTENSIONS.includes('pfb'));
    assert.ok(PUBLIC_ASSET_EXTENSIONS.includes('bcmap'));
    assert.ok(PUBLIC_ASSET_EXTENSIONS.includes('ttf'));
  });

  it('exempts the image and font assets that already worked', () => {
    for (const p of [
      '/logo.png',
      '/icon.svg',
      '/fonts/x.woff2',
      '/site.webmanifest',
      '/favicon.ico',
    ]) {
      assert.equal(middlewareRuns(p), false, `${p} should not hit the session redirect`);
    }
  });
});

describe('pages are still gated', () => {
  it('redirects an ordinary page with no session', () => {
    for (const p of ['/', '/login', '/courses/abc', '/viewer/att_1', '/lessons/les_1']) {
      assert.equal(middlewareRuns(p), true, `${p} must still require a session`);
    }
  });

  it('still leaves API routes and Next internals alone', () => {
    assert.equal(middlewareRuns('/api/v1/attachments/x/ticket'), false);
    assert.equal(middlewareRuns('/_next/static/chunks/main.js'), false);
  });

  it('does not exempt an unknown extension', () => {
    // A `.pdf` or `.zip` under an arbitrary path is still a page request: the
    // original PDF is never served from this app's origin, so there is nothing
    // to protect here, but the default must stay closed.
    assert.equal(middlewareRuns('/pdfjs/secret.pdf'), true);
    assert.equal(middlewareRuns('/reports/export.zip'), true);
  });
});

describe('the matcher is well formed', () => {
  it('exports exactly one pattern', () => {
    assert.equal(MIDDLEWARE_MATCHER.length, 1);
    assert.equal(typeof MIDDLEWARE_MATCHER[0], 'string');
  });

  it('compiles as a regular expression', () => {
    assert.doesNotThrow(() => new RegExp(`^${MIDDLEWARE_MATCHER[0]}$`));
  });
});

/**
 * Next.js statically analyses `config.matcher` and rejects an imported
 * identifier, so `src/middleware.ts` has to repeat the pattern as a literal and
 * this list cannot be imported into it. This is the one place a source read is
 * justified: it is what stops the literal and the tested list drifting apart,
 * which would leave the fix quietly undone in production. Every behavioural
 * assertion above runs against the same extension set this check pins.
 */
describe('the deployed matcher agrees with the tested list', () => {
  const source = readFileSync(join(import.meta.dirname, '..', 'middleware.ts'), 'utf8');
  const raw = source.match(/matcher:\s*\[\s*'(\/[^']+)'/)?.[1];
  // The file stores it as a TS string literal, so `\\.` is on disk and the value
  // at runtime is `\.`. Compare what the matcher actually evaluates to.
  const literal = raw?.replace(/\\\\/g, '\\');

  it('has a literal matcher to compare against', () => {
    assert.ok(literal, 'could not read config.matcher out of src/middleware.ts');
  });

  it('matches the pattern the tests exercise', () => {
    assert.equal(literal, MIDDLEWARE_MATCHER[0]);
  });

  it('exempts every extension in the list', () => {
    for (const ext of PUBLIC_ASSET_EXTENSIONS) {
      assert.ok(literal!.includes(ext), `${ext} is missing from the real matcher`);
    }
  });
});