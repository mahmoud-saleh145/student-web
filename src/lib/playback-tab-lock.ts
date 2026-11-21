/**
 * One playing lesson per browser.
 *
 * The server's single-stream slot is keyed by the signed-in session, and every
 * tab of one browser shares that session - so two tabs of the same browser are
 * one "stream" to the server and both may play. This closes that gap on the
 * client: when a player starts a session it announces itself, and any other
 * tab of this site that is playing stops (last tab wins, as streaming services
 * do). Devices and other browsers are still limited by the server.
 *
 * The announcement carries only a random tab id - never a user, ticket or URL.
 */

export const PLAYBACK_CHANNEL_NAME = 'edu-web-playback';

export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface PlaybackTabLock {
  /** Announce that this tab is now the one playing. */
  claim(): void;
  /** Stop listening (on leaving the player). Idempotent. */
  close(): void;
}

type LockMessage = { type: 'edu-playback-claim' | 'edu-playback-released'; tabId: string };

function asLockMessage(data: unknown): LockMessage | null {
  if (!data || typeof data !== 'object') return null;
  const { type, tabId } = data as { type?: unknown; tabId?: unknown };
  if (typeof tabId !== 'string') return null;
  if (type !== 'edu-playback-claim' && type !== 'edu-playback-released') return null;
  return { type, tabId };
}

export function createPlaybackTabLock(options: {
  channel: ChannelLike | null;
  tabId: string;
  onSuperseded: () => void;
  onPeerReleased?: () => void;
}): PlaybackTabLock {
  const { channel, tabId, onSuperseded, onPeerReleased } = options;
  let closed = false;
  if (channel) {
    channel.onmessage = (event) => {
      const message = asLockMessage(event.data);
      if (closed || !message || message.tabId === tabId) return;
      if (message.type === 'edu-playback-claim') onSuperseded();
      else onPeerReleased?.();
    };
  }
  const post = (type: LockMessage['type']) => {
    if (closed || !channel) return;
    const message: LockMessage = { type, tabId };
    try {
      channel.postMessage(message);
    } catch {
      /* channel unavailable: the server limits still apply */
    }
  };
  return {
    claim() {
      post('edu-playback-claim');
    },
    close() {
      if (closed) return;
      closed = true;
      if (channel) {
        channel.onmessage = null;
        try {
          channel.close();
        } catch {
          /* already closed */
        }
      }
    },
  };
}

/** A BroadcastChannel where the browser has one; null elsewhere (old Safari, SSR). */
export function openPlaybackChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(PLAYBACK_CHANNEL_NAME) as unknown as ChannelLike;
  } catch {
    return null;
  }
}

/**
 * Tell every other tab of this browser that this tab just handed a playback
 * ticket back. The server's single-stream slot is shared by all tabs of the
 * browser session, so that release removed it for the tab still playing; on
 * this message that tab re-asserts it at once (`onPeerReleased`).
 *
 * One-shot on its own channel, because a release often happens while the
 * sending player is being torn down and its lock is already closed - and on
 * `pagehide`, where nothing asynchronous may be awaited.
 */
export function broadcastPlaybackReleased(
  tabId: string,
  open: () => ChannelLike | null = openPlaybackChannel,
): void {
  const channel = open();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'edu-playback-released', tabId });
  } catch {
    /* channel unavailable: the server limits still apply */
  } finally {
    try {
      channel.close();
    } catch {
      /* already closed */
    }
  }
}
