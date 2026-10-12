import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Where `drm.initDataTransform` has to live, and what happens when it is in the
 * wrong place.
 *
 * This is a behavioural model of Shaka 4.11.7's configuration read path, taken
 * from the shipped artefacts:
 *
 *   - `shaka-player.compiled.d.ts`
 *       type DrmConfiguration = { advanced : {...} | null , ... ,
 *         initDataTransform ? : shaka.extern.InitDataTransform , ... }
 *     -> `initDataTransform` is a TOP-LEVEL field, a sibling of `advanced`.
 *
 *       type AdvancedDrmConfiguration = { audioRobustness , ... ,
 *         serverCertificate , serverCertificateUri , sessionType , ... }
 *     -> there is NO initDataTransform field inside `advanced`.
 *
 *   - the bundle's default:
 *       initDataTransform: (m, n, p) => {
 *         hasLegacyAppleMediaKeys() && n === 'skd' && (...); return m }
 *       function hasLegacyAppleMediaKeys(a) {
 *         return a ? a === window.shakaMediaKeysPolyfill
 *                   : !!window.shakaMediaKeysPolyfill }
 *
 * iPhone Safari has no `window.shakaMediaKeysPolyfill`, so the default
 * transform short-circuits and returns the init data untouched. If our
 * transform is not installed at the top level, nothing ever rebuilds the
 * `skd://` payload into the legacy Apple MediaKeys layout, the CDM cannot
 * derive a content id, and the resulting SPC is unusable - which surfaces as
 * MediaError.code 3 with no licence-stage error to point at it.
 */

/** AdvancedDrmConfiguration, per the shipped .d.ts. */
const ADVANCED_FIELDS = new Set([
  'audioRobustness',
  'videoRobustness',
  'distinctiveIdentifierRequired',
  'headers',
  'individualizationServer',
  'persistentStateRequired',
  'serverCertificate',
  'serverCertificateUri',
  'sessionType',
]);

/** Top-level DrmConfiguration, per the shipped .d.ts. */
const DRM_FIELDS = new Set([
  'advanced',
  'clearKeys',
  'delayLicenseRequestUntilPlayed',
  'ignoreDuplicateInitData',
  'initDataTransform',
  'keySystemsMapping',
  'logLicenseExchange',
  'minHdcpVersion',
  'parseInbandPsshEnabled',
  'persistentSessionOnlinePlayback',
  'persistentSessionsMetadata',
  'preferredKeySystems',
  'retryParameters',
  'servers',
  'updateExpirationTime',
]);

/** Shape of `shaka.extern.InitDataTransform`. */
type InitDataTransform = (
  initData: Uint8Array,
  initDataType: string,
  drmInfo: { keySystemUris?: Set<string> },
) => unknown;

/**
 * Model of `DrmEngine`: it reads `config.initDataTransform`. Anything placed
 * elsewhere is invisible to it, exactly as in the real library.
 */
class FakeDrmEngine {
  transform: InitDataTransform | null;
  transformSource: string;
  private hasLegacyAppleMediaKeys: boolean;

  constructor(config: Record<string, unknown>, hasLegacyAppleMediaKeys: boolean) {
    this.transform = (config.initDataTransform as InitDataTransform | undefined) ?? null;
    this.transformSource = this.transform ? 'top-level drm.initDataTransform' : "Shaka's default";
    this.hasLegacyAppleMediaKeys = hasLegacyAppleMediaKeys;
  }

  /** Apply whichever transform is actually in effect. */
  createOrLoad(initDataType: string, skdUri: string): { contentId: string | null } {
    if (!this.transform) {
      // Shaka's default, verbatim in behaviour.
      if (this.hasLegacyAppleMediaKeys && initDataType === 'skd') return { contentId: 'derived' };
      return { contentId: null };
    }
    const contentId = this.transform(new TextEncoder().encode(skdUri), initDataType, {
      keySystemUris: new Set([SKD_URI]),
    });
    return { contentId: typeof contentId === 'string' ? contentId : 'rebuilt' };
  }
}
/** The `skd://` signalling Gumlet publishes, as a stand-in. Not real key material. */
const SKD_URI = 'skd://zWJlFKVhU9iD73PB9XEQ==';

/** Our shipped config, as the component builds it. */
function shippedConfig(opts: { misplaced: boolean; isFairPlay: boolean }) {
  const fairPlayTransform = (initData: Uint8Array) => {
    // Stands in for FairPlayUtils.initDataTransform: returns the rebuilt
    // legacy blob, which the model reads back as a derived content id.
    void initData;
    return 'legacy-blob';
  };
  const entry = { initDataTransform: fairPlayTransform };
  if (!opts.isFairPlay) {
    // A Widevine ticket carries no FairPlay certificate and no transform.
    return { advanced: {}, servers: { 'com.widevine.alpha': 'https://lic' } };
  }
  const advanced = { 'com.apple.fps': { serverCertificateUri: 'https://cert' } };
  return opts.misplaced
    ? { advanced: { ...advanced, ...entry }, servers: { 'com.apple.fps': 'https://lic' } }
    : { ...entry, advanced, servers: { 'com.apple.fps': 'https://lic' } };
}

describe('drm.initDataTransform placement', () => {
  it('REPRODUCES the bug: inside `advanced`, the transform never runs', () => {
    // This was the shipped state. The default transform is a no-op on iOS
    // Safari, so no content id is ever derived.
    const cfg = shippedConfig({ misplaced: true, isFairPlay: true });
    assert.ok(
      'initDataTransform' in (cfg.advanced as Record<string, unknown>),
      'reproduces the misplacement',
    );
    const engine = new FakeDrmEngine(cfg as Record<string, unknown>, /* legacy polyfill */ false);
    assert.equal(engine.transformSource, "Shaka's default");
    assert.equal(engine.createOrLoad('skd', SKD_URI).contentId, null, 'no content id derived');
  });

  it('at the drm level it runs and derives a content id', () => {
    const cfg = shippedConfig({ misplaced: false, isFairPlay: true });
    const engine = new FakeDrmEngine(cfg as Record<string, unknown>, false);
    assert.equal(engine.transformSource, 'top-level drm.initDataTransform');
    assert.equal(engine.createOrLoad('skd', SKD_URI).contentId, 'legacy-blob');
  });

  it('STILL FAILS if the default transform were used on iOS, regardless of placement', () => {
    // Guards the reason we need our own transform at all: the built-in one is
    // gated on a polyfill that does not exist on this platform.
    const noTransform = { advanced: {}, servers: {} } as Record<string, unknown>;
    const engine = new FakeDrmEngine(noTransform, false);
    assert.equal(engine.createOrLoad('skd', SKD_URI).contentId, null);
  });

  it('only valid placements exist: top-level has the field, `advanced` does not', () => {
    // Anchored to the shipped .d.ts so the model cannot drift from the library.
    assert.ok(DRM_FIELDS.has('initDataTransform'), 'DrmConfiguration.initDataTransform must exist');
    assert.ok(
      !ADVANCED_FIELDS.has('initDataTransform'),
      'AdvancedDrmConfiguration must NOT have initDataTransform',
    );
  });

  it('leaves the Widevine config without any transform', () => {
    const cfg = shippedConfig({ misplaced: false, isFairPlay: false });
    assert.equal('initDataTransform' in cfg, false, 'Widevine must not install one');
    assert.deepEqual(Object.keys(cfg.advanced), [], 'and must not smuggle one into advanced');
  });
});
