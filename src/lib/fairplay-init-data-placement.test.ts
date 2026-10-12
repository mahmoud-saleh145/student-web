import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Pins the facts about the SHIPPED shaka-player 4.11.7 that the FairPlay
 * init-data handling in DrmVideo.tsx / lib/fairplay.ts depends on.
 *
 * These read the vendor artefacts directly rather than modelling them. An
 * earlier version of this file used a hand-written `FakeDrmEngine` that handed
 * the transform a DrmInfo carrying an `skd://` entry in `keySystemUris`. The
 * real native-HLS (`src=`) route never sets that field, so the model passed
 * while every FairPlay play on a real iPhone failed with ERR_FP_NO_SKD_URI
 * before any licence request (trace of 2026-10-12).
 *
 * If a Shaka upgrade changes any of these, the FairPlay path must be
 * re-verified on a real device before the assertion is updated.
 */

const here = dirname(fileURLToPath(import.meta.url));
const shakaRoot = resolve(here, '../../node_modules/shaka-player');
const read = (p: string) => readFileSync(resolve(shakaRoot, p), 'utf8');

const compiled = read('dist/shaka-player.compiled.js');
const typings = read('dist/shaka-player.compiled.d.ts');

describe('shaka-player 4.11.7 FairPlay init-data facts', () => {
  it('is the pinned version', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    assert.equal(pkg.version, '4.11.7');
  });

  it('reads initDataTransform only at the drm level, never from `advanced`', () => {
    const adv = typings.slice(typings.indexOf('type AdvancedDrmConfiguration'));
    assert.ok(adv.startsWith('type AdvancedDrmConfiguration'));
    assert.doesNotMatch(adv.slice(0, adv.indexOf('} ;')), /initDataTransform/);
    const drm = typings.slice(typings.indexOf('type DrmConfiguration'));
    assert.match(drm.slice(0, drm.indexOf('} ;')), /initDataTransform \? : shaka\.extern\.InitDataTransform/);
  });

  it('default transform rebuilds skd only when a media-keys polyfill is installed', () => {
    // initDataTransform:function(m,n,p){Ac()&&"skd"==n&&(...);return m}
    // function Ac(a){return a?a===window.shakaMediaKeysPolyfill:!!window.shakaMediaKeysPolyfill}
    const def = /initDataTransform:function\((\w+),(\w+),(\w+)\)\{(\w+)\(\)&&"skd"==\2&&\([^)]*\([^)]*\)[^)]*\([^)]*\)\);return \1\}/.exec(
      compiled,
    );
    assert.ok(def, 'default transform shape changed');
    const gate = new RegExp(
      `function ${def[4]}\\(\\w+\\)\\{return \\w+\\?\\w+===window\\.shakaMediaKeysPolyfill:!!window\\.shakaMediaKeysPolyfill\\}`,
    );
    assert.match(compiled, gate, 'the gate must be "any media-keys polyfill installed"');
  });

  it('never installs the legacy Apple media-keys polyfill through installAll()', () => {
    // Only registered polyfills run in shaka.polyfill.installAll(). Apple's is
    // install-on-request only, and this app never requests it, so iPhone Safari
    // stays on Modern EME and Shaka's default passes skd init data through.
    assert.doesNotMatch(read('lib/polyfill/patchedmediakeys_apple.js'), /shaka\.polyfill\.register\(/);
    assert.match(read('lib/polyfill/patchedmediakeys_webkit.js'), /shaka\.polyfill\.register\(/);
    assert.match(read('lib/polyfill/patchedmediakeys_nop.js'), /shaka\.polyfill\.register\(/);
  });

  it('builds the native src= DrmInfo from drm.servers with no keySystemUris', () => {
    // DrmEngine.replaceDrmInfo_: one DrmInfo per configured server, and nothing
    // else. keySystemUris is only ever set by the manifest parsers, which the
    // native route does not run.
    assert.match(
      compiled,
      /\{keySystem:\w+,licenseServerUri:\w+,distinctiveIdentifierRequired:!1,persistentStateRequired:!1,audioRobustness:"",videoRobustness:"",serverCertificate:null,serverCertificateUri:"",initData:\[\],keyIds:new Set\}/,
    );
    const src = read('lib/media/drm_engine.js');
    const start = src.indexOf('static replaceDrmInfo_(');
    assert.ok(start > -1);
    const body = src.slice(start, src.indexOf('\n  }\n', start));
    assert.doesNotMatch(body, /keySystemUris/);
  });

  it('aborts before generateRequest when the transform throws', () => {
    // try{c=a.h.initDataTransform(c,b,a.g)}catch(f){...new T(2,6,6016,f);a.o(b);return}
    assert.match(
      compiled,
      /try\{\w+=\w+\.\w+\.initDataTransform\(\w+,\w+,\w+\.\w+\)\}catch\(\w+\)\{[^}]*6016[^}]*return\}/,
    );
  });

  it("exposes the effective drm config, functions included, through getConfiguration()", () => {
    // DrmVideo reads Shaka's default transform from getConfiguration() before
    // installing its wrapper; the config merge copies function values as-is.
    assert.match(typings, /getConfiguration \( \) : shaka\.extern\.PlayerConfiguration/);
    const merge = read('lib/util/config_utils.js');
    assert.match(merge, /typeof template\[k\] == 'function' &&[\s\S]{0,200}destination\[k\] = source\[k\];/);
  });
});
