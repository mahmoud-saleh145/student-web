import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseConfig } from './config.ts';

describe('parseConfig — development environment', () => {
  test('defaults apiBaseUrl to localhost when unset in dev', () => {
    const config = parseConfig({ NODE_ENV: 'development' });
    assert.equal(config.apiBaseUrl, 'http://localhost:3000/api/v1');
    assert.equal(config.secureCookies, false);
    assert.equal(config.platformTimezone, 'Africa/Cairo');
  });

  test('respects explicit apiBaseUrl and secureCookies', () => {
    const config = parseConfig({
      NODE_ENV: 'development',
      API_BASE_URL: 'https://dev-api.example.com/api/v1',
      SECURE_COOKIES: 'true',
    });
    assert.equal(config.apiBaseUrl, 'https://dev-api.example.com/api/v1');
    assert.equal(config.secureCookies, true);
  });
});

describe('parseConfig — production environment hardening', () => {
  test('throws if API_BASE_URL is missing in production', () => {
    assert.throws(
      () => parseConfig({ NODE_ENV: 'production' }),
      /API_BASE_URL is required in production and must not default to localhost/
    );
  });

  test('throws if API_BASE_URL is empty string in production', () => {
    assert.throws(
      () => parseConfig({ NODE_ENV: 'production', API_BASE_URL: '   ' }),
      /API_BASE_URL is required in production and must not default to localhost/
    );
  });

  test('throws if API_BASE_URL points to localhost in production', () => {
    assert.throws(
      () => parseConfig({ NODE_ENV: 'production', API_BASE_URL: 'http://localhost:3000/api/v1' }),
      /API_BASE_URL points to localhost/
    );
  });

  test('throws if API_BASE_URL points to 127.0.0.1 in production', () => {
    assert.throws(
      () => parseConfig({ NODE_ENV: 'production', API_BASE_URL: 'http://127.0.0.1:3000/api/v1' }),
      /API_BASE_URL points to localhost/
    );
  });

  test('accepts valid production HTTPS URL and defaults secureCookies to true', () => {
    const config = parseConfig({
      NODE_ENV: 'production',
      API_BASE_URL: 'https://api.studentcenter.app/api/v1',
    });
    assert.equal(config.apiBaseUrl, 'https://api.studentcenter.app/api/v1');
    assert.equal(config.secureCookies, true);
  });

  test('allows overriding secureCookies in production if explicitly needed', () => {
    const config = parseConfig({
      NODE_ENV: 'production',
      API_BASE_URL: 'https://api.studentcenter.app/api/v1',
      SECURE_COOKIES: 'false',
    });
    assert.equal(config.secureCookies, false);
  });
});
