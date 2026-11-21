import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { broadcastPlaybackReleased, createPlaybackTabLock, type ChannelLike } from './playback-tab-lock.ts';

/** In-memory BroadcastChannel: a message reaches every OTHER open member. */
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
  return { make, sent, members };
}

describe('M1 - release broadcast between tabs', () => {
  it('a release in one tab makes the playing tab re-assert, without stopping it', () => {
    const b = bus();
    let reasserted = 0;
    let stopped = 0;
    createPlaybackTabLock({
      channel: b.make(),
      tabId: 'playing',
      onSuperseded: () => (stopped += 1),
      onPeerReleased: () => (reasserted += 1),
    });
    broadcastPlaybackReleased('leaving', b.make);
    assert.equal(reasserted, 1);
    assert.equal(stopped, 0, 'a release is not a claim');
  });

  it('the one-shot broadcast works while the sender has already closed its own lock, and leaves no channel open', () => {
    const b = bus();
    let reasserted = 0;
    createPlaybackTabLock({ channel: b.make(), tabId: 'B', onSuperseded: () => undefined, onPeerReleased: () => (reasserted += 1) });
    const a = createPlaybackTabLock({ channel: b.make(), tabId: 'A', onSuperseded: () => undefined });
    a.close();
    const before = b.members.length;
    broadcastPlaybackReleased('A', b.make);
    assert.equal(reasserted, 1);
    assert.equal(b.members.length, before, 'the one-shot channel was closed again');
  });

  it("a tab ignores its own release announcement, and claims still stop the older tab as before", () => {
    const b = bus();
    let reasserted = 0;
    let stopped = 0;
    createPlaybackTabLock({ channel: b.make(), tabId: 'A', onSuperseded: () => (stopped += 1), onPeerReleased: () => (reasserted += 1) });
    broadcastPlaybackReleased('A', b.make);
    assert.equal(reasserted, 0);
    createPlaybackTabLock({ channel: b.make(), tabId: 'B', onSuperseded: () => undefined }).claim();
    assert.equal(stopped, 1);
  });

  it('carries only a random tab id - no user, ticket or URL', () => {
    const b = bus();
    broadcastPlaybackReleased('tab-9', b.make);
    assert.deepEqual(b.sent, [{ type: 'edu-playback-released', tabId: 'tab-9' }]);
  });

  it('is a no-op where BroadcastChannel is unavailable', () => {
    broadcastPlaybackReleased('A', () => null);
  });
});
