import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { drawPagesReleasingEach } from './pdf-page-loop.ts';

/**
 * Pins the memory fix for the Library reader crash on iPhone.
 *
 * A 600 dpi scan decodes to ~133 MB per page. The reader never released a page
 * after drawing it, so decoded images piled up for as long as it stayed open.
 * These tests hold the loop to "at most one page alive at a time".
 */

interface FakePage {
  readonly n: number;
  cleanups: number;
  cleanup(): void;
}

function fakeDocument(numPages: number) {
  const pages: FakePage[] = [];
  let alive = 0;
  let maxAlive = 0;

  const doc = {
    numPages,
    async getPage(n: number): Promise<FakePage> {
      alive += 1;
      maxAlive = Math.max(maxAlive, alive);
      const page: FakePage = {
        n,
        cleanups: 0,
        cleanup() {
          if (this.cleanups === 0) alive -= 1;
          this.cleanups += 1;
        },
      };
      pages.push(page);
      return page;
    },
  };

  return { doc, pages, maxAlive: () => maxAlive, alive: () => alive };
}

describe('drawPagesReleasingEach', () => {
  it('draws every page in order and releases each one exactly once', async () => {
    const { doc, pages } = fakeDocument(17);
    const drawn: number[] = [];

    const done = await drawPagesReleasingEach(doc, async (_page, n) => {
      drawn.push(n);
    }, () => false);

    assert.equal(done, true);
    assert.deepEqual(drawn, Array.from({ length: 17 }, (_, i) => i + 1));
    assert.equal(pages.length, 17);
    assert.ok(pages.every((p) => p.cleanups === 1));
  });

  it('never holds more than one page at a time', async () => {
    const { doc, maxAlive, alive } = fakeDocument(24);

    await drawPagesReleasingEach(doc, async () => {
      // Yield, as a real render does, so an overlapping fetch would show up.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }, () => false);

    assert.equal(maxAlive(), 1);
    assert.equal(alive(), 0);
  });

  it('releases the page when drawing it fails, and reports the failure', async () => {
    const { doc, pages } = fakeDocument(5);

    await assert.rejects(
      drawPagesReleasingEach(doc, async (_page, n) => {
        if (n === 3) throw new Error('render failed');
      }, () => false),
      /render failed/
    );

    assert.equal(pages.length, 3);
    assert.ok(pages.every((p) => p.cleanups === 1));
  });

  it('stops when the viewer closes, releasing the page it had just fetched', async () => {
    const { doc, pages, alive } = fakeDocument(10);
    let closed = false;

    const done = await drawPagesReleasingEach(doc, async (_page, n) => {
      if (n === 4) closed = true;
    }, () => closed);

    assert.equal(done, false);
    assert.equal(pages.length, 4);
    assert.ok(pages.every((p) => p.cleanups === 1));
    assert.equal(alive(), 0);
  });

  it('releases a page that arrives after the viewer was closed, without drawing it', async () => {
    const { doc, pages } = fakeDocument(3);
    let closed = false;
    const drawn: number[] = [];

    const original = doc.getPage.bind(doc);
    doc.getPage = async (n: number) => {
      const page = await original(n);
      if (n === 2) closed = true; // closed while page 2 was being fetched
      return page;
    };

    const done = await drawPagesReleasingEach(doc, async (_page, n) => {
      drawn.push(n);
    }, () => closed);

    assert.equal(done, false);
    assert.deepEqual(drawn, [1]);
    assert.equal(pages.length, 2);
    assert.ok(pages.every((p) => p.cleanups === 1));
  });

  it('handles an empty document', async () => {
    const { doc } = fakeDocument(0);
    assert.equal(await drawPagesReleasingEach(doc, async () => {}, () => false), true);
  });
});
