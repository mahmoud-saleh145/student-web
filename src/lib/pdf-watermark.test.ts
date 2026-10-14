import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  burnImageWatermark,
  identityWatermarkText,
  loadWatermarkImage,
  PDF_WATERMARK_MAX_PAGE_FRACTION,
  PDF_WATERMARK_OPACITY,
  type WatermarkContext,
  type WatermarkImage,
  watermarkPlacement,
} from './pdf-watermark.ts';

/**
 * The watermark image drawn into every protected PDF page.
 *
 * Two promises are pinned here, because breaking either is silent: the mark
 * must keep its shape and stay inside the page on every page size, and it must
 * never be the reason a document fails to open.
 */

const here = dirname(fileURLToPath(import.meta.url));

// The shipped artwork's real size (src/assets/brand/pdf-watermark.png).
const IMAGE = { width: 1824, height: 2003 };

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('identityWatermarkText', () => {
  it('puts the name and the ticket ID line side by side, as the video and image overlay does', () => {
    assert.equal(identityWatermarkText('Test Student', 'ID: 3F9A1C2B'), 'Test Student · ID: 3F9A1C2B');
  });

  it('keeps an Arabic name intact', () => {
    assert.equal(identityWatermarkText('محمد أحمد', 'ID: 3F9A1C2B'), 'محمد أحمد · ID: 3F9A1C2B');
  });

  it('falls back to the name alone - never an invented ID - when the ticket has none', () => {
    assert.equal(identityWatermarkText('Test Student'), 'Test Student');
    assert.equal(identityWatermarkText('Test Student', ''), 'Test Student');
    assert.equal(identityWatermarkText('Test Student', '   '), 'Test Student');
    assert.equal(identityWatermarkText('Test Student', null), 'Test Student');
  });

  it('still shows the ID when the name is blank', () => {
    assert.equal(identityWatermarkText('  ', 'ID: 3F9A1C2B'), 'ID: 3F9A1C2B');
  });
});

describe('watermarkPlacement', () => {
  it('centres the image on an A4 portrait page, limited by width', () => {
    const box = watermarkPlacement(1240, 1754, IMAGE.width, IMAGE.height);
    assert.ok(box);
    assert.ok(close(box.width, 1240 * PDF_WATERMARK_MAX_PAGE_FRACTION));
    assert.ok(close(box.x, (1240 - box.width) / 2));
    assert.ok(close(box.y, (1754 - box.height) / 2));
  });

  it('is limited by height on a landscape page', () => {
    const box = watermarkPlacement(1754, 1240, IMAGE.width, IMAGE.height);
    assert.ok(box);
    assert.ok(close(box.height, 1240 * PDF_WATERMARK_MAX_PAGE_FRACTION));
    assert.ok(box.width <= 1754 * PDF_WATERMARK_MAX_PAGE_FRACTION);
  });

  it('preserves the aspect ratio and stays inside the page for any shape', () => {
    const pages: [number, number][] = [
      [1240, 1754],
      [1754, 1240],
      [500, 5000],
      [5000, 300],
      [700, 990],
    ];
    for (const [w, h] of pages) {
      const box = watermarkPlacement(w, h, IMAGE.width, IMAGE.height);
      assert.ok(box, `${w}x${h}`);
      assert.ok(close(box.width / box.height, IMAGE.width / IMAGE.height), `ratio on ${w}x${h}`);
      assert.ok(box.x >= 0 && box.y >= 0, `origin on ${w}x${h}`);
      assert.ok(box.x + box.width <= w && box.y + box.height <= h, `extent on ${w}x${h}`);
      assert.ok(box.width <= w * PDF_WATERMARK_MAX_PAGE_FRACTION + 1e-6, `width share on ${w}x${h}`);
      assert.ok(box.height <= h * PDF_WATERMARK_MAX_PAGE_FRACTION + 1e-6, `height share on ${w}x${h}`);
    }
  });

  it('scales with the canvas, so every device pixel ratio gets the same share', () => {
    const one = watermarkPlacement(800, 1131, IMAGE.width, IMAGE.height);
    const two = watermarkPlacement(1600, 2262, IMAGE.width, IMAGE.height);
    assert.ok(one && two);
    assert.ok(close(two.width, one.width * 2));
    assert.ok(close(two.x, one.x * 2));
    assert.ok(close(two.y, one.y * 2));
  });

  it('refuses sizes that cannot be drawn', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(watermarkPlacement(bad, 1000, IMAGE.width, IMAGE.height), null);
      assert.equal(watermarkPlacement(1000, bad, IMAGE.width, IMAGE.height), null);
      assert.equal(watermarkPlacement(1000, 1000, bad, IMAGE.height), null);
      assert.equal(watermarkPlacement(1000, 1000, IMAGE.width, bad), null);
    }
  });
});

/** Records what the viewer would do to the page's canvas. */
function fakeContext(options: { failDraw?: boolean } = {}) {
  const calls: string[] = [];
  const draws: { alpha: number; op: string; args: unknown[] }[] = [];
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    save() {
      calls.push('save');
    },
    restore() {
      calls.push('restore');
    },
    drawImage(...args: unknown[]) {
      calls.push('drawImage');
      if (options.failDraw) throw new Error('InvalidStateError');
      draws.push({ alpha: this.globalAlpha, op: this.globalCompositeOperation, args });
    },
  };
  return { context: context as unknown as WatermarkContext, calls, draws };
}

const image = (width = IMAGE.width, height = IMAGE.height) =>
  ({ naturalWidth: width, naturalHeight: height }) as unknown as WatermarkImage;

describe('burnImageWatermark', () => {
  it('draws once, centred, faint, and only ever darkening the page', () => {
    const { context, calls, draws } = fakeContext();
    assert.equal(burnImageWatermark(context, 1240, 1754, image()), true);

    assert.deepEqual(calls, ['save', 'drawImage', 'restore']);
    assert.equal(draws.length, 1);
    assert.equal(draws[0]!.alpha, PDF_WATERMARK_OPACITY);
    assert.equal(draws[0]!.op, 'multiply');

    const box = watermarkPlacement(1240, 1754, IMAGE.width, IMAGE.height)!;
    assert.deepEqual(draws[0]!.args.slice(1), [box.x, box.y, box.width, box.height]);
  });

  it('keeps the opacity subtle', () => {
    assert.ok(PDF_WATERMARK_OPACITY > 0 && PDF_WATERMARK_OPACITY <= 0.5);
  });

  it('never throws when the draw fails, and still restores the context', () => {
    const { context, calls } = fakeContext({ failDraw: true });
    assert.doesNotThrow(() => assert.equal(burnImageWatermark(context, 1240, 1754, image()), false));
    assert.deepEqual(calls, ['save', 'drawImage', 'restore']);
  });

  it('does not touch the page for an image that reports no size', () => {
    const { context, calls } = fakeContext();
    assert.equal(burnImageWatermark(context, 1240, 1754, image(0, 0)), false);
    assert.deepEqual(calls, []);
  });
});

describe('loadWatermarkImage', () => {
  const original = (globalThis as { Image?: unknown }).Image;
  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = original;
  });

  /** A stand-in for the browser's Image that settles the way a test asks. */
  function installImage(outcome: 'load' | 'error' | 'empty' | 'never') {
    (globalThis as { Image?: unknown }).Image = class {
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = 'auto';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => {
          if (outcome === 'load') {
            this.naturalWidth = IMAGE.width;
            this.naturalHeight = IMAGE.height;
            this.onload?.();
          } else if (outcome === 'empty') {
            this.onload?.();
          } else if (outcome === 'error') {
            this.onerror?.();
          }
        }, 0);
      }
    };
  }

  it('resolves to the image once it has loaded', async () => {
    installImage('load');
    const result = await loadWatermarkImage('/mark.png', 1000);
    assert.ok(result);
    assert.equal(result.naturalWidth, IMAGE.width);
  });

  it('resolves to null, never rejects, when the image fails to load', async () => {
    installImage('error');
    assert.equal(await loadWatermarkImage('/mark.png', 1000), null);
  });

  it('resolves to null for an image that decodes to no size', async () => {
    installImage('empty');
    assert.equal(await loadWatermarkImage('/mark.png', 1000), null);
  });

  it('gives up after the timeout instead of holding the document', async () => {
    installImage('never');
    assert.equal(await loadWatermarkImage('/mark.png', 20), null);
  });

  it('resolves to null where there is no Image at all', async () => {
    (globalThis as { Image?: unknown }).Image = undefined;
    assert.equal(await loadWatermarkImage('/mark.png', 1000), null);
  });
});

describe('the shipped watermark asset', () => {
  // Read straight from the PNG header, so a replacement that dropped the
  // transparency (and would paint a white block over the page) fails here.
  const png = readFileSync(resolve(here, '../assets/brand/pdf-watermark.png'));

  it('is a PNG of the expected size', () => {
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), IMAGE.width);
    assert.equal(png.readUInt32BE(20), IMAGE.height);
  });

  it('keeps an alpha channel', () => {
    // IHDR colour type 6 = truecolour with alpha.
    assert.equal(png[25], 6);
  });
});
