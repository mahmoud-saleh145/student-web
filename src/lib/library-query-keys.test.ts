import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { qk } from './query-keys.ts';

describe('Library query keys', () => {
  it('scope every Library read to the signed-in user', () => {
    assert.notDeepEqual(qk.library.material('student-a', 'm1'), qk.library.material('student-b', 'm1'));
    assert.notDeepEqual(qk.library.browse('student-a', {}), qk.library.browse('student-b', {}));
    assert.notDeepEqual(qk.library.mine('student-a', {}), qk.library.mine('student-b', {}));
  });

  it('keep the shared prefix, so a purchase invalidates every Library read', () => {
    for (const key of [
      qk.library.material('student-a', 'm1'),
      qk.library.browse('student-a', { q: '' }),
      qk.library.mine('student-a', {}),
    ]) {
      assert.deepEqual(key.slice(0, 1), [...qk.library.all]);
    }
  });

  it('separate year/level filters, so a filtered list is never shown unfiltered', () => {
    assert.notDeepEqual(
      qk.library.browse('student-a', { q: '', academicYearId: 'y1' }),
      qk.library.browse('student-a', { q: '', academicYearId: null }),
    );
  });
});
