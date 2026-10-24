import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  gumletEmbedExperimentRequested,
  gumletEmbedSrc,
  isRejectedDeliveryField,
  playbackTicketRequestBody,
} from './gumlet-embed.ts';

describe('playbackTicketRequestBody', () => {
  it('opts in to embed delivery for iOS web only', () => {
    assert.deepEqual(playbackTicketRequestBody('ios'), { platform: 'ios', delivery: 'embed' });
  });

  it('leaves Android and desktop requests exactly as before', () => {
    assert.deepEqual(playbackTicketRequestBody('android'), { platform: 'android' });
    assert.deepEqual(playbackTicketRequestBody('web'), { platform: 'web' });
  });

  it('opts non-iOS platforms in only under the manual preview experiment flag', () => {
    assert.deepEqual(playbackTicketRequestBody('android', { embedExperiment: true }), {
      platform: 'android',
      delivery: 'embed',
    });
    assert.deepEqual(playbackTicketRequestBody('web', { embedExperiment: true }), {
      platform: 'web',
      delivery: 'embed',
    });
    // iOS is identical whether the flag is on or off, and an off flag
    // (or an empty option object) never changes the default body.
    assert.deepEqual(playbackTicketRequestBody('ios', { embedExperiment: true }), {
      platform: 'ios',
      delivery: 'embed',
    });
    assert.deepEqual(playbackTicketRequestBody('android', { embedExperiment: false }), { platform: 'android' });
    assert.deepEqual(playbackTicketRequestBody('web', {}), { platform: 'web' });
  });
});

describe('gumletEmbedExperimentRequested', () => {
  it('is on only for an exact gumletEmbed=1 parameter', () => {
    assert.equal(gumletEmbedExperimentRequested('?gumletEmbed=1'), true);
    assert.equal(gumletEmbedExperimentRequested('gumletEmbed=1'), true);
    assert.equal(gumletEmbedExperimentRequested('?lesson=x&gumletEmbed=1'), true);
  });

  it('is off when absent, differently named or differently valued', () => {
    assert.equal(gumletEmbedExperimentRequested(''), false);
    assert.equal(gumletEmbedExperimentRequested('?lesson=x'), false);
    assert.equal(gumletEmbedExperimentRequested('?gumletEmbed=0'), false);
    assert.equal(gumletEmbedExperimentRequested('?gumletEmbed=true'), false);
    assert.equal(gumletEmbedExperimentRequested('?gumletembed=1'), false);
  });
});

describe('player page wiring (preview experiment)', () => {
  const page = readFileSync(new URL('../app/player/[id]/page.tsx', import.meta.url), 'utf8');

  it('reads the manual flag at request time and forwards it to the ticket body', () => {
    assert.match(page, /gumletEmbedExperimentRequested\(/);
    assert.match(page, /window\.location\.search/);
    assert.match(page, /playbackTicketRequestBody\(platform, \{ embedExperiment \}\)/);
    // The legacy-backend fallback still retries the plain body for any
    // platform whose opt-in the backend refused.
    assert.match(page, /if \(body\.delivery && isRejectedDeliveryField\(e\)\) return requestTicket\(\{ platform \}\)/);
  });

  it('keeps the embed branch gated on the server-issued, validated URL only', () => {
    assert.match(page, /const embedSrc = gumletEmbedSrc\(ticket\)/);
    assert.match(page, /\{embedSrc \? \(/);
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
