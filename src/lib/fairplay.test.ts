import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFairPlayLicenseRequest,
  fromBase64,
  parseFairPlayLicenseResponse,
  toBase64,
} from './fairplay.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

/**
 * These lock the wire format to Gumlet's documented contract, taken from
 * Gumlet's own browser reference implementation (`gumlet/drm-react-js`,
 * `src/App.js`):
 *
 *   request : {"spc": "<standard base64 of the SPC>"}
 *   response: {"ckc": "<base64 of the CKC>"}
 *
 * Shaka's generic FairPlay contract (form-encoded `spc=`, `<ckc>` XML wrapper)
 * is deliberately NOT what we implement - using it against Gumlet would leave
 * the response undecoded.
 */
describe('FairPlay SPC/CKC wire format', () => {
  it('encodes base64 exactly like btoa, including padding', () => {
    // Known vectors: "", "f", "fo", "foo", "foob", "fooba", "foobar".
    assert.equal(toBase64(bytes()), '');
    assert.equal(toBase64(bytes(0x66)), 'Zg==');
    assert.equal(toBase64(bytes(0x66, 0x6f)), 'Zm8=');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f)), 'Zm9v');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f, 0x62)), 'Zm9vYg==');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f, 0x62, 0x61)), 'Zm9vYmE=');
    assert.equal(toBase64(bytes(0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72)), 'Zm9vYmFy');
  });

  it('round-trips binary through base64', () => {
    const original = new Uint8Array(512);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7 + 3) & 0xff;
    assert.deepEqual(fromBase64(toBase64(original)), original);
  });

  it('decodes to an exact-length buffer, never an oversized view', () => {
    // A subarray would share a larger backing buffer and `response.data =
    // bytes.buffer` would then hand the CDM trailing zero bytes.
    const decoded = fromBase64('Zm9vYmFy');
    assert.equal(decoded.byteLength, 6);
    assert.equal(decoded.buffer.byteLength, 6);
    assert.deepEqual(decoded, bytes(0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72));
  });

  it('builds the SPC request as Gumlet JSON', () => {
    const spc = bytes(0x01, 0x02, 0x03, 0x04);
    const body = buildFairPlayLicenseRequest(spc);
    const text = new TextDecoder().decode(body);

    assert.deepEqual(JSON.parse(text), { spc: 'AQIDBA==' });
    assert.deepEqual(fromBase64((JSON.parse(text) as { spc: string }).spc), spc);
  });

  it('refuses to build a request with no SPC message', () => {
    assert.throws(() => buildFairPlayLicenseRequest(null), /no SPC message/);
  });

  it('parses the CKC response into raw bytes', () => {
    const ckc = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]);
    const response = new TextEncoder().encode(JSON.stringify({ ckc: toBase64(ckc) })).buffer;

    const parsed = parseFairPlayLicenseResponse(response);
    assert.equal(parsed.byteLength, ckc.byteLength);
    assert.deepEqual(new Uint8Array(parsed), ckc);
  });

  it('rejects a response that is not JSON', () => {
    const response = new TextEncoder().encode('<ckc>3q2+7w==</ckc>').buffer;
    // Shaka's default shape would arrive here; it must not be silently accepted.
    assert.throws(() => parseFairPlayLicenseResponse(response), /not valid JSON/);
  });

  it('rejects a JSON response with no ckc field', () => {
    const response = new TextEncoder().encode('{"error":"invalid token"}').buffer;
    assert.throws(() => parseFairPlayLicenseResponse(response), /no ckc field/);
  });

  it('rejects an empty response', () => {
    assert.throws(() => parseFairPlayLicenseResponse(null), /was empty/);
  });
});