// Publishes the pdf.js font and CMap data as static files.
//
// pdf.js fetches these at runtime; it does not bundle them. Without them the
// viewer renders text with substitute metrics and glyphs overlap. They already
// exist inside the installed `pdfjs-dist` package, so they are copied out rather
// than hand-vendored - that way they always match the library version in use.
//
// Idempotent, and safe to skip when the target is already populated.
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = require('pdfjs-dist/package.json');
const from = resolve(dirname(require.resolve('pdfjs-dist/package.json')));
const to = join(root, 'public', 'pdfjs');

const DIRS = ['cmaps', 'standard_fonts'];

const missing = DIRS.filter((d) => !existsSync(join(from, d)));
if (missing.length) {
  console.error(
    `[pdfjs-assets] ${pkg.version} does not ship: ${missing.join(', ')}. ` +
      'The viewer will render text with fallback metrics and glyphs will overlap.',
  );
  process.exit(1);
}

const alreadyComplete = DIRS.every((d) => {
  const target = join(to, d);
  return existsSync(target) && readdirSync(target).length > 0;
});

if (alreadyComplete && process.env.PDFJS_ASSETS_FORCE !== '1') {
  console.log('[pdfjs-assets] already published; skipping.');
} else {
  mkdirSync(to, { recursive: true });
  for (const dir of DIRS) {
    cpSync(join(from, dir), join(to, dir), { recursive: true });
  }
  const counts = DIRS.map((d) => `${d}=${readdirSync(join(to, d)).length}`).join(' ');
  console.log(`[pdfjs-assets] published pdfjs-dist@${pkg.version} -> public/pdfjs (${counts})`);
}