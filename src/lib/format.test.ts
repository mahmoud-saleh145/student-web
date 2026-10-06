import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, formatNumber, formatTimecode } from './format.ts';

const ARABIC_INDIC = /[٠-٩]/;
const WESTERN = /[0-9]/;

describe('formatDuration', () => {
  test('uses the locale digits, so a stats row does not mix scripts', () => {
    // The regression: "٣ دروس مكتملة" sat next to "6 د" in the same row,
    // because the duration was interpolated instead of formatted.
    const ar = formatDuration(6 * 60, 'ar');
    assert.ok(ARABIC_INDIC.test(ar), `expected Arabic-Indic digits, got "${ar}"`);
    assert.ok(!WESTERN.test(ar), `expected no Western digits, got "${ar}"`);
    assert.ok(ar.includes('د'));
  });

  test('keeps English output in Western digits', () => {
    assert.equal(formatDuration(6 * 60, 'en'), '6m');
    assert.equal(formatDuration(3 * 3600 + 7 * 60, 'en'), '3h 7m');
  });

  test('formats hours and minutes together in Arabic', () => {
    const ar = formatDuration(3 * 3600 + 7 * 60, 'ar');
    assert.ok(ar.includes('س') && ar.includes('د'), ar);
    assert.ok(!WESTERN.test(ar), ar);
  });

  test('matches how other numbers on the page are formatted', () => {
    assert.ok(formatDuration(5 * 60, 'ar').startsWith(formatNumber(5, 'ar')));
  });
});

describe('formatTimecode', () => {
  test('stays in Western digits — it mirrors the player readout on both platforms', () => {
    assert.equal(formatTimecode(101), '01:41');
    assert.equal(formatTimecode(3671), '1:01:11');
  });
});
