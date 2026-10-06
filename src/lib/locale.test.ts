import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contentLocale } from './locale.ts';

describe('contentLocale', () => {
  it('accepts the two platform languages', () => {
    assert.equal(contentLocale('ar'), 'ar');
    assert.equal(contentLocale('en'), 'en');
    assert.equal(contentLocale('ar-EG,ar;q=0.9'), 'ar');
  });

  it('ignores anything else, so the backend default applies', () => {
    assert.equal(contentLocale('fr-FR'), null);
    assert.equal(contentLocale(''), null);
    assert.equal(contentLocale(null), null);
  });
});
