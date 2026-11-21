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

interface ClaimMessage {
  type: 'edu-playback-claim';
  tabId: string;
}

function isClaim(data: unknown): data is ClaimMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === 'edu-playback-claim' &&
    typeof (data as { tabId?: unknown }).tabId === 'string'
  );
}

export function createPlaybackTabLock(options: {
  channel: ChannelLike | null;
  tabId: string;
  onSuperseded: () => void;
}): PlaybackTabLock {
  const { channel, tabId, onSuperseded } = options;
  let closed = false;
  if (channel) {
    channel.onmessage = (event) => {
      if (closed || !isClaim(event.data) || event.data.tabId === tabId) return;
      onSuperseded();
    };
  }
  return {
    claim() {
      if (closed || !channel) return;
      const message: ClaimMessage = { type: 'edu-playback-claim', tabId };
      try {
        channel.postMessage(message);
      } catch {
        /* channel unavailable: the server limits still apply */
      }
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
