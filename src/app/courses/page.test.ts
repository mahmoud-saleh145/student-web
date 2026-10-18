import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, 'page.tsx'), 'utf8');

/** Strips comments so assertions target code rather than explanatory prose. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/** The JSX between `<Toolbar>` and its matching `</Toolbar>`. */
function between(start: RegExp, end: string): string {
  const from = code.search(start);
  assert.notEqual(from, -1, `expected to find ${start} in page.tsx`);
  const tail = code.slice(from);
  const to = tail.indexOf(end);
  assert.notEqual(to, -1, `expected ${end} after ${start} in page.tsx`);
  return tail.slice(0, to);
}

const toolbar = between(/<Toolbar>/, '</Toolbar>');
const sheet = between(/<Sheet\b/, '</Sheet>');

/**
 * Regression guard for the sideways-scrolling Courses page.
 *
 * The toolbar is a `flex-wrap` row, but search and sorting were a single flex
 * item inside it carrying a fixed 176px input and a fixed 208px select. A
 * wrapped row only wraps between its own children, so that item could never
 * wrap: it needed 429px before anything else, and below 445px of viewport the
 * row simply did not fit. The document grew sideways, and the heading, the
 * cards and the controls themselves were all clipped.
 *
 * Nothing about it said "mobile". The overflow scaled with the viewport, so a
 * 430px phone lost 15px, a 360px phone lost 85px and a tablet lost none - which
 * is why it read as a device-specific rendering fault rather than a layout one.
 *
 * These assertions are static because the failure is a class composition
 * problem in the JSX; nothing observable changes at runtime in this repo's
 * plain `node --test` environment, which has no DOM and no layout engine.
 */
describe('Courses toolbar does not force horizontal overflow', () => {
  it('takes the fixed-width controls out of the row below lg', () => {
    /*
      The group is the overflow: one unshrinkable flex item inside a wrapping
      parent. `hidden` below `lg` is what keeps it out of the min-content width
      of the row, and `lg:flex` is what puts it back for desktop, where the
      content column is wide enough to hold it.
    */
    assert.match(toolbar, /className="[^"]*\bhidden\b[^"]*"/);
    assert.match(toolbar, /className="[^"]*\blg:flex\b[^"]*"/);
  });

  it('keeps every fixed width inside the lg-visible group', () => {
    /*
      The widths are still written here - they are the desktop sizing, and
      removing them would change the desktop row. What matters is that each one
      sits inside the group that is `display:none` below `lg`, so it cannot
      reach the min-content width of a phone's row. A fixed width added to the
      toolbar outside that group would put the 429px floor straight back.
    */
    const gate = toolbar.indexOf('lg:flex"');
    assert.notEqual(gate, -1, 'expected the toolbar group to be gated behind lg');

    const outside = [...toolbar.matchAll(/(?<![\w:-])w-\d+(?![\w-])/g)].filter(
      ([match]) => toolbar.indexOf(match) < gate,
    );
    assert.deepEqual(
      outside.map(([match]) => match),
      [],
      'a fixed width sits in the toolbar outside the group hidden below lg',
    );
  });

  it('keeps search and sorting reachable below lg, in the filters Sheet', () => {
    /*
      Hiding the toolbar group is only safe because the mobile Sheet renders
      both controls off the same state. If they were dropped from the Sheet as
      well, a phone would have no search and no sort at all - so this asserts
      the capability, not just the layout.
    */
    assert.match(sheet, /<FilterControls\b/);
    assert.match(sheet, /<Select[\s\S]*?setSort\(/);
    assert.match(source, /onSearch: setSearchTerm/);
    assert.match(source, /onChange=\{\(e\) => setSort\(/);
  });

  it('keeps the desktop sidebar and the lg:hidden filters button paired', () => {
    /*
      Below `lg` the Sheet is the only way in, so the button that opens it must
      stay `lg:hidden`; at `lg` and up the aside takes over and that button must
      go. They are two halves of the same switch and have moved together.
    */
    assert.match(code, /className="lg:hidden"[\s\S]{0,200}setFiltersOpen\(true\)/);
    assert.match(code, /<aside className="hidden lg:sticky/);
  });
});