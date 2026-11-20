import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LAST_ACTIVATION_KEY,
  LAST_ACTIVATION_TTL_MS,
  clearLastActivation,
  parseReceipt,
  readLastActivation,
  saveLastActivation,
  type ActivationReceipt,
} from './last-activation.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const course: ActivationReceipt = {
  kind: 'course',
  courseId: 'c1',
  courseTitle: 'Mechanics',
  outcome: 'unlocked',
  wholeCourse: false,
  parts: [{ title: 'Before Midterm', titleAr: 'قبل الميدترم' }],
  sections: [],
  teacherName: null,
};

describe('last activation receipt', () => {
  it('round-trips for the account that made it', () => {
    const storage = memoryStorage();
    saveLastActivation(storage, 'u1', course, 1_000);
    assert.deepEqual(readLastActivation(storage, 'u1', 2_000), course);
  });

  it('is not shown to another account on the same browser', () => {
    const storage = memoryStorage();
    saveLastActivation(storage, 'u1', course, 1_000);
    assert.equal(readLastActivation(storage, 'u2', 2_000), null);
  });

  it('expires', () => {
    const storage = memoryStorage();
    saveLastActivation(storage, 'u1', course, 1_000);
    assert.equal(readLastActivation(storage, 'u1', 1_000 + LAST_ACTIVATION_TTL_MS + 1), null);
  });

  it('never stores a code or a token, even if one is handed to it', () => {
    const storage = memoryStorage();
    const withSecrets = {
      ...course,
      code: 'ABCD-1234-EFGH',
      accessToken: 'eyJhbGciOi...',
      parts: [{ title: 'Before Midterm', code: 'ABCD-1234-EFGH' }],
    } as unknown as ActivationReceipt;
    saveLastActivation(storage, 'u1', withSecrets, 1_000);
    const raw = storage.map.get(LAST_ACTIVATION_KEY) ?? '';
    assert.ok(raw.length > 0);
    assert.equal(raw.includes('ABCD-1234-EFGH'), false);
    assert.equal(raw.includes('eyJhbGciOi'), false);
    assert.equal(raw.includes('accessToken'), false);
  });

  it('ignores malformed or forged storage instead of rendering it', () => {
    const storage = memoryStorage();
    for (const raw of [
      'not json',
      '{}',
      JSON.stringify({ userId: 'u1', at: 1_000, receipt: { kind: 'course', courseId: 'c1' } }),
      JSON.stringify({ userId: 'u1', at: 1_000, receipt: { kind: 'recharge', credited: 'lots', balance: 1, currency: 'EGP' } }),
      JSON.stringify({ userId: 'u1', at: 1_000, receipt: { ...course, outcome: 'owns-everything' } }),
      JSON.stringify({ userId: 'u1', at: 9_999_999_999_999, receipt: course }),
    ]) {
      storage.setItem(LAST_ACTIVATION_KEY, raw);
      assert.equal(readLastActivation(storage, 'u1', 2_000), null, raw);
    }
  });

  it('keeps recharge and library receipts', () => {
    assert.deepEqual(parseReceipt({ kind: 'recharge', credited: 100, balance: 250, currency: 'EGP' }), {
      kind: 'recharge',
      credited: 100,
      balance: 250,
      currency: 'EGP',
    });
    const library = parseReceipt({
      kind: 'library',
      materialId: 'm1',
      title: 'Mechanics notes',
      partsGranted: 2,
      pricePaid: 80,
      balanceAfter: 20,
      currency: 'EGP',
      alreadyPurchased: false,
    });
    assert.equal(library?.kind, 'library');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    assert.doesNotThrow(() => saveLastActivation(broken, 'u1', course));
    assert.equal(readLastActivation(broken, 'u1'), null);
    assert.doesNotThrow(() => clearLastActivation(broken));
  });
});
