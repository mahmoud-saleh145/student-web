import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isRetryableLibraryError,
  libraryErrorKey,
  materialView,
  myLibraryStatus,
  packageAccess,
  partAccess,
  partActions,
  partOwnership,
  READER_MAX_REOPENS,
  readerLoadFailure,
  visibleParts,
  type PartAccessInput,
} from './library.ts';

describe('readerLoadFailure', () => {
  const failure = (status: number | undefined, preview: boolean, reopens: number) =>
    readerLoadFailure({ status, preview, reopens });

  it('503 says access could not be verified, and always offers another try', () => {
    for (const preview of [true, false]) {
      for (const reopens of [0, READER_MAX_REOPENS, READER_MAX_REOPENS + 5]) {
        assert.deepEqual(failure(503, preview, reopens), {
          messageKey: 'library.errors.verifyUnavailable',
          canRetry: true,
        });
      }
    }
  });

  it('a refused owned document offers a new ticket, then stops', () => {
    assert.deepEqual(failure(403, false, 0), { messageKey: 'library.errors.ticketExpired', canRetry: true });
    assert.deepEqual(failure(403, false, READER_MAX_REOPENS - 1), { messageKey: 'library.errors.ticketExpired', canRetry: true });
    assert.deepEqual(failure(403, false, READER_MAX_REOPENS), { messageKey: 'library.errors.readerRefused', canRetry: false });
  });

  it('a refused preview speaks about the preview, then stops: no reopen loop', () => {
    assert.deepEqual(failure(403, true, 0), { messageKey: 'library.errors.previewLoadFailed', canRetry: true });
    assert.deepEqual(failure(403, true, READER_MAX_REOPENS), { messageKey: 'library.errors.previewUnavailable', canRetry: false });
  });

  it('a failure with no known status is treated as a possible refusal', () => {
    assert.deepEqual(failure(undefined, false, 0), { messageKey: 'library.errors.ticketExpired', canRetry: true });
    assert.equal(failure(undefined, true, READER_MAX_REOPENS).canRetry, false);
  });

  it('never mentions a device for a preview, which needs no approved device', () => {
    for (const reopens of [0, READER_MAX_REOPENS]) {
      assert.notEqual(failure(403, true, reopens).messageKey, 'library.errors.readerRefused');
    }
  });
});

describe('partAccess', () => {
  it('reads the backend access state when present, whatever the mirrors say', () => {
    assert.equal(partAccess({ access: 'REVOKED', owned: false, isPreview: true }), 'REVOKED');
    assert.equal(partAccess({ access: 'PREVIEW', owned: true }), 'PREVIEW');
    assert.equal(partAccess({ access: 'PURCHASABLE' }), 'PURCHASABLE');
  });

  it('fails closed on an access value it does not know', () => {
    assert.equal(partAccess({ access: 'SOMETHING_NEW', purchasable: true }), 'UNAVAILABLE');
  });

  it('falls back to the deprecated mirrors for a backend without access', () => {
    assert.equal(partAccess({ owned: true, isPreview: true }), 'OWNED');
    assert.equal(partAccess({ isPreview: true }), 'PREVIEW');
    assert.equal(partAccess({ purchasable: true }), 'PURCHASABLE');
    assert.equal(partAccess({}), 'UNAVAILABLE');
  });

  it('never infers purchasability from a price', () => {
    // A part as the wire may carry it, price included; the price is never read.
    const priced = (fields: object) => fields as PartAccessInput;
    assert.equal(partAccess(priced({ access: 'UNAVAILABLE', price: 50 })), 'UNAVAILABLE');
    assert.equal(partAccess(priced({ price: 50 })), 'UNAVAILABLE');
  });
});

describe('partOwnership (Decision B)', () => {
  it('reads the backend ownership, independent of access', () => {
    assert.equal(partOwnership({ access: 'PREVIEW', ownership: 'REVOKED' }), 'REVOKED');
    assert.equal(partOwnership({ access: 'OWNED', ownership: 'OWNED' }), 'OWNED');
    assert.equal(partOwnership({ access: 'PURCHASABLE', ownership: 'NONE' }), 'NONE');
  });

  it('never turns an unknown value into ownership', () => {
    assert.equal(partOwnership({ access: 'OWNED', ownership: 'SOMETHING_NEW' }), 'NONE');
  });

  it('falls back to the access state for a backend without ownership', () => {
    assert.equal(partOwnership({ access: 'REVOKED' }), 'REVOKED');
    assert.equal(partOwnership({ access: 'OWNED' }), 'OWNED');
    assert.equal(partOwnership({ access: 'PREVIEW' }), 'NONE');
    assert.equal(partOwnership({ owned: true }), 'OWNED');
    assert.equal(partOwnership({}), 'NONE');
  });

  it('a revoked part offered as a preview may be read as a preview, never as owned, and never bought', () => {
    const part = { access: 'PREVIEW', ownership: 'REVOKED' };
    assert.deepEqual(partActions(partAccess(part), 'FULL'), { read: true, preview: true, buy: false });
    assert.deepEqual(partActions(partAccess({ access: 'REVOKED', ownership: 'REVOKED' }), 'FULL'), {
      read: false,
      preview: false,
      buy: false,
    });
  });
});

describe('packageAccess', () => {
  it('reads access, and fails closed on an unknown value', () => {
    assert.equal(packageAccess({ access: 'UNAVAILABLE', fullyOwned: false }), 'UNAVAILABLE');
    assert.equal(packageAccess({ access: 'OWNED' }), 'OWNED');
    assert.equal(packageAccess({ access: '???' }), 'UNAVAILABLE');
  });
  it('keeps the legacy behaviour without access', () => {
    assert.equal(packageAccess({ fullyOwned: true }), 'OWNED');
    assert.equal(packageAccess({ fullyOwned: false }), 'PURCHASABLE');
  });
});

describe('views and actions', () => {
  it('treats a response without view as FULL, and only OWNER as OWNER', () => {
    assert.equal(materialView({}), 'FULL');
    assert.equal(materialView({ view: 'OWNER' }), 'OWNER');
    assert.equal(materialView({ view: 'FULL' }), 'FULL');
  });

  it('full view: read owned and preview, buy only purchasable, nothing for revoked or unavailable', () => {
    assert.deepEqual(partActions('OWNED', 'FULL'), { read: true, preview: false, buy: false });
    assert.deepEqual(partActions('PREVIEW', 'FULL'), { read: true, preview: true, buy: false });
    assert.deepEqual(partActions('PURCHASABLE', 'FULL'), { read: false, preview: false, buy: true });
    assert.deepEqual(partActions('REVOKED', 'FULL'), { read: false, preview: false, buy: false });
    assert.deepEqual(partActions('UNAVAILABLE', 'FULL'), { read: false, preview: false, buy: false });
  });

  it('owner view: only an owned part is actionable, and nothing is ever for sale', () => {
    assert.deepEqual(partActions('OWNED', 'OWNER'), { read: true, preview: false, buy: false });
    assert.deepEqual(partActions('PURCHASABLE', 'OWNER'), { read: false, preview: false, buy: false });
    assert.deepEqual(partActions('PREVIEW', 'OWNER'), { read: false, preview: false, buy: false });
  });

  it('owner view lists owned parts only', () => {
    const parts = [
      { id: 'a', access: 'OWNED' },
      { id: 'b', access: 'PURCHASABLE' },
      { id: 'c', access: 'REVOKED' },
    ];
    assert.deepEqual(visibleParts(parts, 'OWNER').map((p) => p.id), ['a']);
    assert.deepEqual(visibleParts(parts, 'FULL').map((p) => p.id), ['a', 'b', 'c']);
  });
});

describe('myLibraryStatus', () => {
  it('reads status, falling back to available', () => {
    assert.equal(myLibraryStatus({ status: 'WITHDRAWN', available: true }), 'WITHDRAWN');
    assert.equal(myLibraryStatus({ status: 'READABLE' }), 'READABLE');
    assert.equal(myLibraryStatus({ available: false }), 'WITHDRAWN');
    assert.equal(myLibraryStatus({ available: true }), 'READABLE');
  });
});

describe('libraryErrorKey', () => {
  it('names the Library codes the generic mapping does not have', () => {
    assert.equal(libraryErrorKey('LIBRARY_ENTITLEMENT_REVOKED', 403, 'reader'), 'library.errors.revoked');
    // Decision B: a refused preview is about the preview, not the revoked copy.
    assert.equal(libraryErrorKey('LIBRARY_ENTITLEMENT_REVOKED', 403, 'preview'), 'library.errors.previewUnavailable');
    assert.equal(libraryErrorKey('LIBRARY_ENTITLEMENT_REVOKED', 403, 'purchase'), 'library.errors.revoked');
    assert.equal(libraryErrorKey('LIBRARY_NOT_AVAILABLE', 403, 'purchase'), 'library.errors.notAvailable');
  });

  it('says "not available" for every hidden-material 404, never why', () => {
    assert.equal(libraryErrorKey('NOT_FOUND', 404, 'material'), 'library.errors.notAvailable');
    assert.equal(libraryErrorKey(undefined, 404, 'browse'), 'library.errors.notAvailable');
    assert.equal(libraryErrorKey('NOT_FOUND', 404, 'preview'), 'library.errors.previewUnavailable');
  });

  it('replaces the course wording for codes shared with courses', () => {
    assert.equal(libraryErrorKey('PAYMENT_REQUIRED', 402, 'reader'), 'library.errors.notOwned');
    assert.equal(libraryErrorKey('COURSE_ARCHIVED', 410, 'reader'), 'library.errors.withdrawn');
    assert.equal(libraryErrorKey('INVALID_STATE', 409, 'purchase'), 'library.errors.notForSale');
    assert.equal(libraryErrorKey('CONFLICT', 409, 'purchase'), 'library.errors.alreadyOwned');
  });

  it('leaves device, credit and session codes to the generic messages', () => {
    assert.equal(libraryErrorKey('DEVICE_NOT_AUTHORIZED', 403, 'reader'), null);
    assert.equal(libraryErrorKey('INSUFFICIENT_CREDIT', 402, 'purchase'), null);
  });

  it('calls network and server failures retryable, refusals not', () => {
    assert.equal(libraryErrorKey('NETWORK_OFFLINE', 0, 'browse'), 'library.errors.network');
    assert.equal(libraryErrorKey('SERVER_ERROR', 502, 'browse'), 'library.errors.network');
    assert.equal(isRetryableLibraryError('NETWORK_TIMEOUT', 0), true);
    assert.equal(isRetryableLibraryError('SERVER_ERROR', 503), true);
    assert.equal(isRetryableLibraryError('NOT_FOUND', 404), false);
    assert.equal(isRetryableLibraryError('LIBRARY_ENTITLEMENT_REVOKED', 403), false);
  });
});
