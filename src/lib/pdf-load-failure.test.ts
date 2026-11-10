import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyPdfLoadError, failureReference, kindForStatus } from './pdf-load-failure.ts';

/**
 * The error shapes below are the ones pdfjs-dist 4.10 actually produces in the
 * browser: exceptions are re-created on the main thread from what the worker
 * posts, so they are plain objects with `name`, `message` and, depending on the
 * class, `status` or `details`.
 */
const unexpected = (status: number) => ({
  name: 'UnexpectedResponseException',
  message: `Unexpected server response (${status}) while retrieving PDF "https://gate/x.pdf".`,
  status,
});
const unknown = (details: string) => ({ name: 'UnknownErrorException', message: details.replace(/^\w+: /, ''), details });

describe('classifyPdfLoadError — answers from the media gate', () => {
  it('keeps the HTTP status whenever pdf.js carries one', () => {
    assert.deepEqual(classifyPdfLoadError(unexpected(403), 'load'), { kind: 'refused', status: 403 });
    assert.deepEqual(classifyPdfLoadError(unexpected(401), 'load'), { kind: 'refused', status: 401 });
    assert.deepEqual(classifyPdfLoadError(unexpected(410), 'load'), { kind: 'refused', status: 410 });
    assert.deepEqual(classifyPdfLoadError(unexpected(503), 'load'), { kind: 'unverifiable', status: 503 });
    assert.deepEqual(classifyPdfLoadError(unexpected(500), 'load'), { kind: 'server', status: 500 });
    assert.deepEqual(classifyPdfLoadError(unexpected(416), 'load'), { kind: 'server', status: 416 });
  });

  it('reads a 404 as a missing file even though pdf.js drops its status', () => {
    const missing = { name: 'MissingPDFException', message: 'Missing PDF "https://gate/x.pdf".' };
    assert.deepEqual(classifyPdfLoadError(missing, 'load'), { kind: 'missing', status: 404 });
    // pdf.js 5 reports it as a ResponseException instead.
    const v5 = { name: 'ResponseException', message: 'Unexpected server response (404) while retrieving PDF' };
    assert.equal(classifyPdfLoadError(v5, 'load').kind, 'missing');
  });

  it('maps every status family', () => {
    assert.equal(kindForStatus(503), 'unverifiable');
    assert.equal(kindForStatus(403), 'refused');
    assert.equal(kindForStatus(404), 'missing');
    assert.equal(kindForStatus(0), 'network');
    assert.equal(kindForStatus(502), 'server');
  });
});

describe('classifyPdfLoadError — failures with no status are NOT refusals', () => {
  it('a download that never completed is a network failure, in every engine', () => {
    for (const details of [
      'TypeError: Failed to fetch', // Chromium
      'TypeError: network error', // Chromium, body interrupted
      'TypeError: Load failed', // WebKit
      'TypeError: NetworkError when attempting to fetch resource.', // Gecko
      'TypeError: The network connection was lost.', // WebKit, body interrupted
    ]) {
      assert.deepEqual(classifyPdfLoadError(unknown(details), 'load'), { kind: 'network' }, details);
    }
    assert.deepEqual(classifyPdfLoadError(new TypeError('Failed to fetch'), 'load'), { kind: 'network' });
  });

  it('a browser that cannot start pdf.js is a client failure — nothing was requested', () => {
    // Exactly what Safari < 17.4 and Chrome < 119 threw with the default build.
    const old = new TypeError('Promise.withResolvers is not a function');
    assert.deepEqual(classifyPdfLoadError(old, 'setup'), { kind: 'client' });
    assert.deepEqual(classifyPdfLoadError(new ReferenceError('structuredClone is not defined'), 'setup'), {
      kind: 'client',
    });
    const fakeWorker = unknown('Error: Setting up fake worker failed: "Cannot load script"');
    assert.deepEqual(classifyPdfLoadError(fakeWorker, 'load'), { kind: 'client' });
  });

  it('a damaged file is invalid, whatever the phase', () => {
    const invalid = { name: 'InvalidPDFException', message: 'Invalid PDF structure.' };
    assert.deepEqual(classifyPdfLoadError(invalid, 'load'), { kind: 'invalid' });
  });

  it('a page that fails to draw after the document opened is a render failure', () => {
    assert.deepEqual(classifyPdfLoadError(new Error('Canvas area exceeds the maximum limit'), 'render'), {
      kind: 'render',
    });
  });

  it('anything else is unknown — never "expired"', () => {
    assert.deepEqual(classifyPdfLoadError(new Error('something odd'), 'load'), { kind: 'unknown' });
    assert.deepEqual(classifyPdfLoadError(null, 'load'), { kind: 'unknown' });
    assert.deepEqual(classifyPdfLoadError('a string', 'load'), { kind: 'unknown' });
  });
});

describe('classifyPdfLoadError — the viewer code itself not arriving', () => {
  it('is a network failure, not an unsupported browser', () => {
    const chunk = Object.assign(new Error('Loading chunk 2084 failed. (timeout: /_next/static/chunks/x.js)'), {
      name: 'ChunkLoadError',
    });
    assert.deepEqual(classifyPdfLoadError(chunk, 'setup'), { kind: 'network' });
    assert.deepEqual(
      classifyPdfLoadError(new TypeError('Failed to fetch dynamically imported module: /x.mjs'), 'setup'),
      { kind: 'network' },
    );
    assert.deepEqual(classifyPdfLoadError(new TypeError('Importing a module script failed.'), 'setup'), {
      kind: 'network',
    });
  });
});

describe('failureReference', () => {
  it('is short, stable and carries the status when there is one', () => {
    assert.equal(failureReference({ kind: 'refused', status: 403 }), 'PDF-REFUSED-403');
    assert.equal(failureReference({ kind: 'network' }), 'PDF-NETWORK');
    assert.equal(failureReference({ kind: 'missing', status: 404 }), 'PDF-MISSING-404');
  });
});
