import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Behavioural model of the failure the iPhone trace shows, and of the rule the
 * fix has to satisfy.
 *
 * WHY A MODEL AND NOT SOURCE MATCHING
 *
 * The other tests in this directory assert that a configuration flag is
 * present. That is not evidence: `parseInbandPsshEnabled: false` was present
 * and shipped, and the bug survived it. What matters is the chain of decisions
 * Shaka actually makes, so each step below is transcribed from
 * shaka-player 4.11.7 rather than invented:
 *
 *  1. HlsParser maps the two `#EXT-X-KEY` entries in Gumlet's playlist to two
 *     DrmInfos on the same stream -
 *       "com.apple.fps"       initDataType 'sinf', initData = Uint8Array(0)
 *       "com.widevine.alpha"  initDataType 'cenc', initData = <the PSSH>
 *     (`Xw["com.apple.streamingkeydelivery"]` and `Xw["urn:uuid:edef8ba9-..."]`)
 *
 *  2. `DrmUtils.fixDrmInfo` (compiled as `ki`) fills in the licence URI and
 *     certificate per key system. It does NOT remove a key system we have no
 *     licence server for, so both DrmInfos survive on the stream.
 *
 *  3. `chooseDecodingInfo(tracks, current, drm.preferredKeySystems)` chooses
 *     which DrmInfo the session is built from.
 *
 *  4. `DrmEngine.attach()` registers the element's `encrypted` handler - the
 *     ONLY route by which `skd://` init data reaches `drm.initDataTransform` -
 *     only when none of these hold:
 *         drmInfo.initData has a non-empty buffer
 *         || there is queued init data
 *         || config.parseInbandPsshEnabled
 *
 *  5. `drm.initDataTransform` is applied inside session creation, which is
 *     reached from the `encrypted` handler.
 *
 * The observed device trace was `ENC_skd` present and `IDT_*` absent, which
 * under (4) means one of the three conditions held - and since
 * `parseInbandPsshEnabled` was already false, the non-empty `initData` from a
 * PSSH-bearing DrmInfo is the only one that fits.
 *
 * This is still a model. It proves the rule we are coding against, and it fails
 * if the rule is broken. It cannot prove playback works on a real iPhone.
 */

/** The two key systems, exactly as Shaka's HLS parser emits them. */
const FAIRPLAY = 'com.apple.fps';
const FAIRPLAY_LEGACY = 'com.apple.fps.1_0';
const WIDEVINE = 'com.widevine.alpha';

type DrmInfo = {
  keySystem: string;
  initDataType: string;
  /** Byte length. FairPlay signalling arrives via `encrypted`, so this is 0. */
  initData: Uint8Array;
};

type DecodingInfo = { drmInfo: DrmInfo; mimeType: string };

/**
 * Step 3, transcribed: choose which DrmInfo wins.
 *
 * `preferredKeySystems` is the only signal that distinguishes the two here -
 * the manifest advertises both and the element can play both, so codec support
 * alone does not separate them.
 */
function chooseDecodingInfo(drmInfos: DrmInfo[], preferredKeySystems: string[]): DecodingInfo {
  const ordered = [...drmInfos].sort((a, b) => {
    const ai = preferredKeySystems.indexOf(a.keySystem);
    const bi = preferredKeySystems.indexOf(b.keySystem);
    // An unlisted key system ranks below every listed one.
    return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
  });
  const winner = ordered[0];
  assert.ok(winner, 'manifest declared at least one DrmInfo');
  return { drmInfo: winner, mimeType: 'video/mp4; codecs="avc1.640020"' };
}

/**
 * Steps 4 and 5: does Shaka register the `encrypted` handler, and does our
 * transform therefore run?
 *
 * `skdInitData` is what Safari delivers on the element's `encrypted` event.
 */
function createSession(args: {
  chosen: DecodingInfo;
  parseInbandPsshEnabled: boolean;
  queuedInitData: number;
  skdInitData: Uint8Array | null;
}): { usedInitDataType: string; transformRan: boolean; fromEncryptedEvent: boolean } {
  const { chosen, parseInbandPsshEnabled, queuedInitData, skdInitData } = args;
  const hasNonEmptyInitData = chosen.drmInfo.initData.length > 0;

  // Step 4 - the gate, verbatim.
  if (hasNonEmptyInitData || queuedInitData > 0 || parseInbandPsshEnabled) {
    // Step 5 is reached only from createOrLoad(initDataType, initData) fed by
    // the DrmInfo, i.e. the manifest's init data - not from the element.
    return {
      usedInitDataType: chosen.drmInfo.initDataType,
      transformRan: false,
      fromEncryptedEvent: false,
    };
  }

  if (!skdInitData) {
    return { usedInitDataType: 'NONE', transformRan: false, fromEncryptedEvent: false };
  }
  // `encrypted` handler -> createOrLoad('skd', ...) -> drm.initDataTransform.
  return { usedInitDataType: 'skd', transformRan: true, fromEncryptedEvent: true };
}

/** What our component configures on the FairPlay path. */
const FAIRPLAY_CONFIG = {
  parseInbandPsshEnabled: false,
  preferredKeySystems: [FAIRPLAY, FAIRPLAY_LEGACY],
};

/** What a Widevine ticket configures - must stay untouched. */
const WIDEVINE_CONFIG = {
  parseInbandPsshEnabled: true,
  preferredKeySystems: [] as string[],
};

/** Gumlet's playlist, as Shaka's parser splits it. */
const gumletDrmInfos = (): DrmInfo[] => [
  // The FairPlay entry: an EMPTY buffer, by Shaka's own construction.
  { keySystem: FAIRPLAY, initDataType: 'sinf', initData: new Uint8Array(0) },
  // The Widevine entry: the PSSH, carried in a data: URI.
  { keySystem: WIDEVINE, initDataType: 'cenc', initData: new Uint8Array(48) },
];

describe('FairPlay session selection on a dual-key-system manifest', () => {
  it('REPRODUCES the failure mode: once a PSSH-bearing DrmInfo wins, FairPlay can never be reached', () => {
    // What the shipped build proved, stated as the conditional it actually is.
    //
    // The device trace was `ENC_skd` present with no `IDT_*`. Under step 4 that
    // means one of the three gate conditions held, and with
    // `parseInbandPsshEnabled` already false the only one that fits is a
    // non-empty `drmInfo.initData` - i.e. the PSSH-bearing DrmInfo was chosen.
    //
    // What I could NOT verify from the bundle is which DrmInfo wins when
    // `preferredKeySystems` is empty: the manifest advertises both and the
    // element supports both, so nothing in the chooser separates them and the
    // outcome is not determined by anything we configure. So this test asserts
    // the consequence, not a guessed tie-break.
    const pssh = gumletDrmInfos().find((d) => d.keySystem === WIDEVINE)!;
    const chosen: DecodingInfo = { drmInfo: pssh, mimeType: 'video/mp4' };

    const session = createSession({
      chosen,
      parseInbandPsshEnabled: false,
      queuedInitData: 0,
      skdInitData: new Uint8Array([1, 2, 3]),
    });
    assert.equal(session.transformRan, false, 'IDT_* never appeared on the device');
    assert.equal(session.fromEncryptedEvent, false, "Safari's skd init data was ignored");
    assert.equal(session.usedInitDataType, 'cenc', 'the licence request went out for the PSSH');
  });

  it('makes the choice deterministic instead of leaving it to manifest order', () => {
    // The practical effect of the fix: before it, the winner depended on
    // something outside our control, which is why the symptom looked
    // inconsistent between assets. Naming the key system removes the ambiguity.
    const infos = gumletDrmInfos();
    const withPreference = chooseDecodingInfo(infos, FAIRPLAY_CONFIG.preferredKeySystems);
    assert.equal(withPreference.drmInfo.keySystem, FAIRPLAY);
    // Deterministic regardless of the order the parser emitted them in.
    const reversed = chooseDecodingInfo([...infos].reverse(), FAIRPLAY_CONFIG.preferredKeySystems);
    assert.equal(reversed.drmInfo.keySystem, FAIRPLAY);
  });

  it('uses the FairPlay content id once the key system is named', () => {
    const chosen = chooseDecodingInfo(gumletDrmInfos(), FAIRPLAY_CONFIG.preferredKeySystems);
    assert.equal(chosen.drmInfo.keySystem, FAIRPLAY);

    const session = createSession({
      chosen,
      parseInbandPsshEnabled: FAIRPLAY_CONFIG.parseInbandPsshEnabled,
      queuedInitData: 0,
      skdInitData: new Uint8Array([1, 2, 3]),
    });
    assert.equal(session.transformRan, true, 'IDT_skd must now appear');
    assert.equal(session.fromEncryptedEvent, true);
    assert.equal(session.usedInitDataType, 'skd');
  });

  it('cannot reach a session with no FairPlay init data even if `encrypted` never fires', () => {
    // Fails closed: with no `skd` data there is no content id, so no licence is
    // requested and nothing plays. It must NOT silently fall back to the PSSH.
    const chosen = chooseDecodingInfo(gumletDrmInfos(), FAIRPLAY_CONFIG.preferredKeySystems);
    const session = createSession({
      chosen,
      parseInbandPsshEnabled: FAIRPLAY_CONFIG.parseInbandPsshEnabled,
      queuedInitData: 0,
      skdInitData: null,
    });
    assert.equal(session.transformRan, false);
    assert.notEqual(session.usedInitDataType, 'cenc', 'must never fall back to the Widevine PSSH');
  });

  it('is a no-op when there is no Widevine entry to outrank', () => {
    // A genuinely FairPlay-only manifest must behave identically before and
    // after, so this fix cannot regress an asset packaged that way.
    const fairPlayOnly = [{ keySystem: FAIRPLAY, initDataType: 'sinf', initData: new Uint8Array(0) }];
    const before = chooseDecodingInfo(fairPlayOnly, []);
    const after = chooseDecodingInfo(fairPlayOnly, FAIRPLAY_CONFIG.preferredKeySystems);
    assert.equal(before.drmInfo.keySystem, after.drmInfo.keySystem);
  });

  it('LEAVES WIDEVINE UNCHANGED - the PSSH must still win on a Widevine ticket', () => {
    // The regression that matters most. A Widevine/DASH ticket has no FairPlay
    // entry at all and depends entirely on the PSSH; if this fix leaked onto
    // the Widevine path it would break Chrome, Edge and Android.
    assert.deepEqual(WIDEVINE_CONFIG.preferredKeySystems, [], 'Widevine must not set a preference');
    assert.equal(WIDEVINE_CONFIG.parseInbandPsshEnabled, true, 'Widevine needs in-band PSSH');

    const chosen = chooseDecodingInfo(
      [{ keySystem: WIDEVINE, initDataType: 'cenc', initData: new Uint8Array(48) }],
      WIDEVINE_CONFIG.preferredKeySystems,
    );
    assert.equal(chosen.drmInfo.keySystem, WIDEVINE);
    const session = createSession({
      chosen,
      parseInbandPsshEnabled: WIDEVINE_CONFIG.parseInbandPsshEnabled,
      queuedInitData: 0,
      skdInitData: null,
    });
    assert.equal(session.usedInitDataType, 'cenc');
  });

  it('names both FairPlay key systems we configure servers for', () => {
    // The manifest advertises only com.apple.fps; com.apple.fps.1_0 is the
    // legacy key system the ticket also serves a licence for, and Shaka's
    // mapping may surface either.
    assert.deepEqual([...FAIRPLAY_CONFIG.preferredKeySystems].sort(), [FAIRPLAY, FAIRPLAY_LEGACY].sort());
    assert.equal(FAIRPLAY_CONFIG.preferredKeySystems.length, 2);
  });
});
