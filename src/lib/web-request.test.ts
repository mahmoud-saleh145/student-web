import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WEB_REQUEST_HEADER, hasWebRequestHeader } from './web-request.ts';

describe('hasWebRequestHeader', () => {
  it('accepts a request carrying the marker', () => {
    assert.equal(hasWebRequestHeader(new Headers({ [WEB_REQUEST_HEADER]: '1' })), true);
  });

  it('rejects a request without it, as a cross-site form post would be', () => {
    assert.equal(hasWebRequestHeader(new Headers({ 'content-type': 'text/plain' })), false);
  });

  it('rejects any other value', () => {
    assert.equal(hasWebRequestHeader(new Headers({ [WEB_REQUEST_HEADER]: 'true' })), false);
  });
});
