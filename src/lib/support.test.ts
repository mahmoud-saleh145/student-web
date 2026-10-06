import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mailtoUrl, readSupportConfig, telUrl, whatsappUrl } from './support.ts';

const cfg = readSupportConfig({
  NEXT_PUBLIC_SUPPORT_WHATSAPP: '+20 100 000 0000',
  NEXT_PUBLIC_SUPPORT_PHONE: '+20 100 000 0000',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'help@school.test',
});

describe('support links', () => {
  it('builds a wa.me link with only digits and a pre-filled message', () => {
    const url = whatsappUrl(cfg, { reason: 'password', fullName: 'Ali Omar Hassan' });
    assert.ok(url?.startsWith('https://wa.me/201000000000?text='));
    assert.ok(decodeURIComponent(url ?? '').includes('Reason: password'));
  });

  it('offers nothing when a channel is not configured', () => {
    const empty = readSupportConfig({});
    assert.equal(whatsappUrl(empty, { reason: 'general' }), null);
    assert.equal(telUrl(empty), null);
    assert.equal(mailtoUrl(empty, { reason: 'general' }), null);
  });

  it('builds tel and mailto links', () => {
    assert.equal(telUrl(cfg), 'tel:+201000000000');
    assert.equal(mailtoUrl(cfg, { reason: 'device' }), 'mailto:help@school.test?subject=Support%20request%20%E2%80%94%20device');
  });
});
