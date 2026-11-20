import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activationDictionaries } from '../i18n.ts';
import { activationErrorKey, cardCodeProblem, isDefiniteRefusal, normalizeCardCode, wrongPlaceFor } from './errors.ts';

describe('activationErrorKey', () => {
  it('words a refused course code for the course screen', () => {
    assert.equal(activationErrorKey('INVALID_CODE', 400, 'course-code'), 'act.err.invalidCourseCode');
    assert.equal(activationErrorKey('CODE_ALREADY_USED', 409, 'course-code'), 'act.err.codeUsed');
    assert.equal(activationErrorKey('ALREADY_ENROLLED', 409, 'course-code'), 'act.err.alreadyOwned');
    assert.equal(activationErrorKey('INVALID_STATE', 409, 'course-code'), 'act.err.partUnavailable');
    assert.equal(activationErrorKey('FORBIDDEN', 403, 'course-code'), 'act.course.codesNotAccepted');
    assert.equal(activationErrorKey('COURSE_NOT_AVAILABLE', 404, 'course-code'), 'act.course.notOnOffer');
  });

  it('reads CODE_NOT_RECHARGEABLE by where the card was entered', () => {
    assert.equal(activationErrorKey('CODE_NOT_RECHARGEABLE', 400, 'course-code'), 'act.err.rechargeOnCourse');
    assert.equal(activationErrorKey('CODE_NOT_RECHARGEABLE', 400, 'recharge'), 'act.err.courseOnWallet');
    assert.equal(wrongPlaceFor('CODE_NOT_RECHARGEABLE', 'course-code'), 'wallet');
    assert.equal(wrongPlaceFor('CODE_NOT_RECHARGEABLE', 'recharge'), 'courses');
    assert.equal(wrongPlaceFor('INVALID_CODE', 'recharge'), null);
  });

  it('reports rate limiting the same way everywhere', () => {
    for (const context of ['course-code', 'recharge', 'general'] as const) {
      assert.equal(activationErrorKey('RATE_LIMITED', 429, context), 'act.err.rateLimited');
    }
  });

  it('leaves everything else to the platform mapping', () => {
    assert.equal(activationErrorKey('COURSE_NOT_TARGETED', 403, 'course-code'), null);
    assert.equal(activationErrorKey('INSUFFICIENT_CREDIT', 402, 'general'), null);
    assert.equal(activationErrorKey('SERVER_ERROR', 500, 'recharge'), null);
    assert.equal(activationErrorKey(undefined, undefined, 'general'), null);
  });

  it('only ever names keys the portal dictionary has, in both languages', () => {
    const codes = ['RATE_LIMITED', 'CODE_NOT_RECHARGEABLE', 'INVALID_CODE', 'CODE_ALREADY_USED', 'INVALID_STATE', 'ALREADY_ENROLLED', 'FORBIDDEN', 'NOT_FOUND'];
    for (const context of ['course-code', 'recharge', 'general'] as const) {
      for (const code of codes) {
        const key = activationErrorKey(code, 400, context);
        if (key === null) continue;
        assert.ok(key in activationDictionaries.en, `${key} (en)`);
        assert.ok(key in activationDictionaries.ar, `${key} (ar)`);
      }
    }
  });
});

describe('card codes', () => {
  it('normalises the way the backend does', () => {
    assert.equal(normalizeCardCode('  abcd-1234 efgh '), 'ABCD-1234EFGH');
  });

  it('accepts a well-formed code and refuses the rest before a request is spent', () => {
    assert.equal(cardCodeProblem('ABCD-1234-EFGH'), null);
    assert.equal(cardCodeProblem(''), 'required');
    assert.equal(cardCodeProblem('AB'), 'format');
    assert.equal(cardCodeProblem('ABCD_1234'), 'format');
    assert.equal(cardCodeProblem('كود1234'), 'format');
    assert.equal(cardCodeProblem('A'.repeat(41)), 'format');
  });
});

describe('portal dictionary', () => {
  it('has the same keys in English and Arabic, none empty', () => {
    const en = Object.keys(activationDictionaries.en).sort();
    const ar = Object.keys(activationDictionaries.ar).sort();
    assert.deepEqual(ar, en);
    for (const lang of ['en', 'ar'] as const) {
      for (const [key, value] of Object.entries(activationDictionaries[lang])) {
        assert.ok(value.trim().length > 0, `${lang} ${key}`);
      }
    }
  });

  it('defines the keys the portal builds at run time', () => {
    // Keys assembled from data never appear as a literal `t('…')`, so the
    // source scan in `i18n/dictionaries.test.ts` cannot see them.
    const built = [
      ...['step1', 'step2', 'step3'].flatMap((s) => [`act.home.${s}.title`, `act.home.${s}.body`]),
      ...['courses', 'library', 'activations', 'wallet', 'account'].map((c) => `act.home.${c}.body`),
      ...['activate', 'library', 'app'].map((p) => `act.login.point.${p}`),
      ...['CREDIT_RECHARGE', 'PURCHASE', 'REFUND', 'ADMIN_ADJUSTMENT', 'REVERSAL'].map((x) => `act.wallet.tx.${x}`),
      ...['video', 'document', 'quiz', 'live'].map((k) => `act.course.${k}`),
      ...['COURSE', 'PART', 'SECTION', 'TEACHER'].map((c) => `act.code.card.${c}`),
      'act.code.required',
      'act.code.format',
      'act.code.blockAllParts',
      'act.code.blockWhole',
      'act.err.goToWallet',
      'act.err.goToCourses',
    ];
    for (const key of built) assert.ok(key in activationDictionaries.en, key);
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (text: string) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',');
    for (const [key, value] of Object.entries(activationDictionaries.en)) {
      assert.equal(
        placeholders((activationDictionaries.ar as Record<string, string>)[key] ?? ''),
        placeholders(value),
        key,
      );
    }
  });
});

describe('isDefiniteRefusal', () => {
  it('is true only for an answer the backend actually gave: a 4xx', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) assert.equal(isDefiniteRefusal(status), true, String(status));
  });

  it('is false when nothing came back, or a gateway gave up', () => {
    for (const status of [0, 500, 502, 503, 504, undefined]) assert.equal(isDefiniteRefusal(status), false, String(status));
  });
});
