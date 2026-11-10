import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Which pdf.js build the protected viewer loads, and why it matters.
 *
 * The production defect: the reader loaded `pdfjs-dist`'s default build, which
 * calls `Promise.withResolvers` (and other recent APIs) with no fallback. On
 * Safari before 17.4 and Chrome before 119 that threw inside `getDocument`,
 * before anything was requested from the media gate, and the reader told the
 * student their reading link had expired or was refused. Every "reopen" minted
 * a new ticket that failed the same way.
 *
 * The behavioural test below reproduces that browser in a child process (so the
 * missing global cannot leak into other tests): the default build fails exactly
 * as it did for students, and the legacy build opens the same document.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const ONE_PAGE_PDF =
  '%PDF-1.4\\n1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n2 0 obj\\n' +
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n3 0 obj\\n' +
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>\\nendobj\\ntrailer\\n<< /Root 1 0 R >>\\n%%EOF\\n';

/** Opens a PDF with `specifier`, in a fresh process with no Promise.withResolvers. */
function openWithoutWithResolvers(specifier: string): string {
  const script = `
    delete Promise.withResolvers;
    const data = new Uint8Array(Buffer.from('${ONE_PAGE_PDF}', 'latin1'));
    try {
      const pdfjs = await import('${specifier}');
      const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
      console.log('OPENED ' + doc.numPages);
      await doc.destroy();
    } catch (e) {
      console.log('FAILED ' + e.name + ': ' + e.message);
    }
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return `${run.stdout}${run.stderr}`;
}

describe('the protected viewer loads the legacy pdf.js build', () => {
  const source = read('src/components/documents/ProtectedPdf.tsx');

  it('imports the legacy library and the matching legacy worker', () => {
    assert.match(source, /import\('pdfjs-dist\/legacy\/build\/pdf\.mjs'\)/);
    assert.match(source, /'pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs'/);
  });

  it('never loads the default build, whose worker and API differ from the legacy one', () => {
    assert.doesNotMatch(source, /import\('pdfjs-dist'\)/);
    assert.doesNotMatch(source, /'pdfjs-dist\/build\/pdf\.worker/);
  });
});

describe('a browser without Promise.withResolvers (Safari < 17.4, Chrome < 119)', () => {
  it('could not open any document with the default build — the production failure', () => {
    const out = openWithoutWithResolvers('pdfjs-dist/build/pdf.mjs');
    assert.match(out, /FAILED TypeError: Promise\.withResolvers is not a function/);
  });

  it('opens the document with the legacy build', () => {
    const out = openWithoutWithResolvers('pdfjs-dist/legacy/build/pdf.mjs');
    assert.match(out, /OPENED 1/);
  });
});
