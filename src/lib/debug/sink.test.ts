import assert from 'node:assert/strict';
import test from 'node:test';

import { debugSinkAttached, emit, setDebugSink } from './sink.ts';

import type { DebugRecord } from './gate.ts';

/**
 * Sink tests.
 *
 * The contract is that the player can call `emit` unconditionally and never
 * worry about it: with no console attached it is a no-op, and a throwing
 * console must not break playback.
 */
test('is detached by default', () => {
  assert.equal(debugSinkAttached(), false);
});

test('emit is a no-op with no sink attached', () => {
  assert.doesNotThrow(() => emit({ k: 'trace', v: 'MANIFEST' }));
  assert.equal(debugSinkAttached(), false);
});

test('emit forwards records once attached', () => {
  const seen: DebugRecord[] = [];
  setDebugSink((r) => seen.push(r));
  emit({ k: 'trace', v: 'MANIFEST', t: 12 });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { k: 'trace', v: 'MANIFEST', t: 12 });
  setDebugSink(null);
});

test('a throwing sink cannot break playback', () => {
  // The whole point: if the debug console ever throws, playback must not.
  setDebugSink(() => {
    throw new Error('console exploded');
  });
  assert.doesNotThrow(() => emit({ k: 'trace', v: 'MEDIA_3' }));
  setDebugSink(null);
});

test('a throwing sink does not get detached, so later records still work', () => {
  let calls = 0;
  setDebugSink(() => {
    calls += 1;
    if (calls === 1) throw new Error('first fails');
  });
  emit({ k: 'trace', v: 'A' });
  emit({ k: 'trace', v: 'B' });
  assert.equal(calls, 2);
  setDebugSink(null);
});

test('detaching stops delivery', () => {
  const seen: DebugRecord[] = [];
  setDebugSink((r) => seen.push(r));
  emit({ k: 'trace', v: 'A' });
  setDebugSink(null);
  emit({ k: 'trace', v: 'B' });
  assert.equal(seen.length, 1);
  assert.equal(debugSinkAttached(), false);
});

test('only one sink is retained at a time', () => {
  const second: DebugRecord[] = [];
  setDebugSink(() => {
    throw new Error('ignored replacement');
  });
  setDebugSink((r) => second.push(r));
  emit({ k: 'trace', v: 'A' });
  assert.equal(second.length, 1);
  setDebugSink(null);
});
