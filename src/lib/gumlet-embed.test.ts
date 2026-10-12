import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { gumletEmbedSrc, isRejectedDeliveryField, playbackTicketRequestBody } from './gumlet-embed.ts';

describe('playbackTicketRequestBody', () => {
  it('opts in to embed delivery for iOS web only', () => {
    assert.deepEqual(playbackTicketRequestBody('ios'), { platform: 'ios', delivery: 'embed' });
  });

  it('leaves Android and desktop requests exactly as before', () => {
    assert.deepEqual(playbackTicketRequestBody('android'), { platform: 'android' });
    assert.deepEqual(playbackTicketRequestBody('web'), { platform: 'web' });
  });
});

describe('isRejectedDeliveryField', () => {
  it('detects an older backend refusing the delivery field', () => {
    assert.equal(
      isRejectedDeliveryField({
        code: 'VALIDATION_ERROR',
        errors: { delivery: ['property delivery should not exist'] },
      }),
      true,
    );
  });

  it('does not swallow any other error', () => {
    assert.equal(isRejectedDeliveryField(null), false);
    assert.equal(isRejectedDeliveryField(new Error('x')), false);
    assert.equal(isRejectedDeliveryField({ code: 'VALIDATION_ERROR' }), false);
    assert.equal(isRejectedDeliveryField({ code: 'VALIDATION_ERROR', errors: { platform: ['bad'] } }), false);
    assert.equal(isRejectedDeliveryField({ code: 'PLAYBACK_DENIED', errors: { delivery: ['x'] } }), false);
    assert.equal(isRejectedDeliveryField({ code: 'DEVICE_NOT_AUTHORIZED' }), false);
  });
});

const OK = 'https://play.gumlet.io/embed/64bfb0913ed6e5096d66dc1e?token=abc123&expires=1760000000000';

describe('gumletEmbedSrc', () => {
  it('accepts a signed Gumlet embed URL', () => {
    assert.equal(gumletEmbedSrc({ embedUrl: OK }), OK);
  });

  it('is off when the backend sends nothing', () => {
    assert.equal(gumletEmbedSrc(null), null);
    assert.equal(gumletEmbedSrc(undefined), null);
    assert.equal(gumletEmbedSrc({}), null);
    assert.equal(gumletEmbedSrc({ embedUrl: null }), null);
    assert.equal(gumletEmbedSrc({ embedUrl: '' }), null);
  });

  it('rejects any other host, scheme or path', () => {
    for (const embedUrl of [
      'http://play.gumlet.io/embed/abc?token=t&expires=1',
      'https://evil.example/embed/abc?token=t&expires=1',
      'https://play.gumlet.io.evil.example/embed/abc?token=t&expires=1',
      'https://play.gumlet.io:8443/embed/abc?token=t&expires=1',
      'https://user:pw@play.gumlet.io/embed/abc?token=t&expires=1',
      'https://play.gumlet.io/watch/abc?token=t&expires=1',
      'https://play.gumlet.io/embed/abc/extra?token=t&expires=1',
      'https://play.gumlet.io/embed/?token=t&expires=1',
      'javascript:alert(1)',
      'not a url',
    ]) {
      assert.equal(gumletEmbedSrc({ embedUrl }), null, embedUrl);
    }
  });

  it('rejects an embed URL without its DRM token or expiry', () => {
    assert.equal(gumletEmbedSrc({ embedUrl: 'https://play.gumlet.io/embed/abc' }), null);
    assert.equal(gumletEmbedSrc({ embedUrl: 'https://play.gumlet.io/embed/abc?token=t' }), null);
    assert.equal(gumletEmbedSrc({ embedUrl: 'https://play.gumlet.io/embed/abc?expires=1' }), null);
  });
});
