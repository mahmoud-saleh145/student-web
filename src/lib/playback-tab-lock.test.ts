import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPlaybackTabLock, type ChannelLike } from './playback-tab-lock.ts';

/** In-memory BroadcastChannel: a message reaches every OTHER member. */
function bus() {
  const members: ChannelLike[] = [];
  const sent: unknown[] = [];
  const make = (): ChannelLike => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage(message) {
        sent.push(message);
        for (const other of members) if (other !== ch) other.onmessage?.({ data: message });
      },
      close() {
        const i = members.indexOf(ch);
        if (i >= 0) members.splice(i, 1);
      },
    };
    members.push(ch);
    return ch;
  };
  return { make, sent };
}

describe('playback tab lock', () => {
  it('stops the older tab when another tab starts playing (last tab wins)', () => {
    const b = bus();
    let aStopped = 0;
    let bStopped = 0;
    const a = createPlaybackTabLock({ channel: b.make(), tabId: 'A', onSuperseded: () => (aStopped += 1) });
    a.claim();
    const second = createPlaybackTabLock({ channel: b.make(), tabId: 'B', onSuperseded: () => (bStopped += 1) });
    second.claim();
    assert.equal(aStopped, 1);
    assert.equal(bStopped, 0);
  });

  it('ignores its own announcement, foreign messages, and anything after close', () => {
    const b = bus();
    let stopped = 0;
    const ch = b.make();
    const a = createPlaybackTabLock({ channel: ch, tabId: 'A', onSuperseded: () => (stopped += 1) });
    ch.onmessage?.({ data: { type: 'edu-playback-claim', tabId: 'A' } });
    ch.onmessage?.({ data: { type: 'something-else', tabId: 'B' } });
    ch.onmessage?.({ data: 'edu-playback-claim' });
    assert.equal(stopped, 0);
    a.close();
    a.close();
    const other = createPlaybackTabLock({ channel: b.make(), tabId: 'B', onSuperseded: () => undefined });
    other.claim();
    assert.equal(stopped, 0);
  });

  it('announces only a random tab id - no user, ticket or URL', () => {
    const b = bus();
    createPlaybackTabLock({ channel: b.make(), tabId: 'tab-123', onSuperseded: () => undefined }).claim();
    assert.deepEqual(b.sent, [{ type: 'edu-playback-claim', tabId: 'tab-123' }]);
  });

  it('works as a no-op where BroadcastChannel is unavailable', () => {
    const lock = createPlaybackTabLock({ channel: null, tabId: 'A', onSuperseded: () => assert.fail('must not fire') });
    lock.claim();
    lock.close();
  });
});
