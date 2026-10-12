import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Pins the BUNDLING guarantees behind the Eruda debug console, because those
 * guarantees are what actually keep it out of Production.
 *
 * The runtime gate in `DebugBoot.tsx` alone is NOT sufficient, and that is not
 * a theoretical concern: leaving the `await import('eruda')` behind a plain
 * `if` was measured to emit a 485 kB Eruda chunk into the PRODUCTION output.
 * Next.js compiles an UNSET `NEXT_PUBLIC_*` variable to a member lookup
 * (`process.env.NEXT_PUBLIC_FAIRPLAY_DEBUG`) rather than a literal, so the
 * branch is never statically dead and webpack happily bundles the library.
 *
 * `next.config.ts` therefore swaps `eruda` for a no-op stub in every build that
 * does not opt in with `NEXT_PUBLIC_FAIRPLAY_DEBUG=1`. These tests read the
 * config and the stub rather than model them, in the same spirit as
 * fairplay-init-data-placement.test.ts.
 *
 * If this file ever fails, do not "fix" it by relaxing the assertion. Either the
 * opt-in flag or the stub replacement has been removed, and the correct fix is
 * to restore it - and then re-run the bundle check described in the report.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');

describe('eruda is kept out of production bundles at BUILD time', () => {
  it('aliases the `eruda` module to a no-op stub', () => {
    const config = read('next.config.ts');
    assert.match(config, /config\.resolve\.alias\.eruda\s*=/, 'the eruda alias must still be configured');
    assert.match(config, /eruda-stub\.js/, 'it must point at the stub, not at a runtime check');
  });

  it('gates that alias on the opt-in flag, so Preview builds keep the real library', () => {
    const config = read('next.config.ts');
    // The alias must be conditional. An unconditional swap would break the
    // authorised Preview deployment, which is the entire point of the flag.
    assert.match(config, /if\s*\(\s*!erudaEnabled\s*\)/, 'the stub must only be used when disabled');
    assert.match(
      config,
      /NEXT_PUBLIC_FAIRPLAY_DEBUG.*trim\(\)\s*===\s*'1'/s,
      'the flag must still be compared to the exact literal "1"',
    );
  });

  it('does not treat a missing flag as enabled', () => {
    const config = read('next.config.ts');
    // A nullish default must be present, otherwise `undefined` flows into
    // `.trim()` and the check crashes rather than failing closed.
    assert.match(
      config,
      /process\.env\.NEXT_PUBLIC_FAIRPLAY_DEBUG\s*\?\?\s*''/,
      'missing flag must default to disabled',
    );
  });

  it('provides a stub whose surface matches what the player calls', () => {
    const stub = read('src/lib/debug/eruda-stub.js');
    for (const method of ['init', 'get', 'show', 'position', 'destroy']) {
      assert.ok(stub.includes(method), `the stub must expose ${method}()`);
    }
    // Comments are stripped first: the explanatory text legitimately names
    // console.info and document, so only the EXECUTABLE body is checked.
    const code = stub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /console\.|document\.|window\.|localStorage|fetch\(|cookie/, 'stub body must not observe anything');
  });

  it('loads eruda through a dynamic import, not a static one', () => {
    // A static import would put eruda in the initial bundle of EVERY page
    // regardless of the flag, so the dynamic import is load-bearing.
    const boot = read('src/components/debug/DebugBoot.tsx');
    assert.match(boot, /await import\('eruda'\)/, 'eruda must be dynamically imported');
    assert.doesNotMatch(boot, /^import eruda/m, 'eruda must not be statically imported');
  });

  it('enables only the console tool, never the network tool', () => {
    // Eruda's Network panel renders full headers and bodies, which for this app
    // means the signed licence URL and the SPC payload verbatim.
    const boot = read('src/components/debug/DebugBoot.tsx');
    const m = /tool:\s*\[([^\]]*)\]/.exec(boot);
    assert.ok(m, 'the tool list must be explicit');
    const tools = (m[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    assert.deepEqual(tools, ['console']);
  });

  it('renders the visible banner only after the gate has passed', () => {
    // No banner on a device must mean "gate refused"; a banner must mean the
    // build flag AND the preview host both passed. So the only path that sets a
    // status is after the `!gate.allowed` early return, and a null status
    // renders nothing at all.
    const boot = read('src/components/debug/DebugBoot.tsx');
    const refuse = boot.indexOf('if (!gate.allowed) return;');
    const firstStatus = boot.indexOf("setStatus({ state: 'loading' })");
    assert.ok(refuse > -1, 'the gate refusal must return early');
    assert.ok(firstStatus > refuse, 'the banner state must only be set after the gate passed');
    assert.match(boot, /if \(!status\) return null;/, 'no status, no output');
    assert.match(boot, /FAIRPLAY DEBUG ENABLED/);
    // The banner shows fixed tokens only: never the host, URL or a raw message.
    const jsx = boot.slice(boot.indexOf('if (!status) return null;'));
    assert.doesNotMatch(jsx, /window\.location|hostname|\.message/);
    assert.match(boot, /error: debugErrorToken\(error\)/, 'failures are reduced to a class name');
  });

  it('opens the console from the banner, not only via the floating button', () => {
    const boot = read('src/components/debug/DebugBoot.tsx');
    // No argument: in eruda 3.4.3 `show(name)` only switches tools and leaves
    // the panel closed; `show()` is what opens it.
    assert.match(boot, /erudaRef\.current\?\.show\(\)/);
    assert.doesNotMatch(boot, /\.show\('console'\)/);
    assert.match(boot, /eruda\.position\(\{ x: 8, y: BANNER_HEIGHT_PX \+ 8 \}\)/);
  });

  it('never sends the hostname to the console as a log argument', () => {
    // Only the fixed gate reason is printed; the hostname can carry an
    // identifying label in a preview subdomain.
    const boot = read('src/components/debug/DebugBoot.tsx');
    const logs = boot.match(/console\.(info|warn|error)\(([^;]*)\)/g) ?? [];
    assert.ok(logs.length > 0, 'there should be log calls to inspect');
    for (const line of logs) {
      assert.doesNotMatch(line, /window\.location/, 'never log the full location');
      assert.doesNotMatch(line, /hostname/, 'never log the hostname');
    }
  });
});
