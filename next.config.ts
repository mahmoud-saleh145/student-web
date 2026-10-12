import path from 'node:path';

import type { NextConfig } from 'next';

/**
 * Baseline response headers for every route.
 *
 * Deliberately no Content-Security-Policy beyond `frame-ancestors`: hls.js,
 * pdf.js workers and signed media URLs on the CDN would each need careful
 * allow-listing, and a wrong CSP breaks playback silently. Framing is the
 * concrete risk (clickjacking a signed-in student), so that is what is locked.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/**
 * Eruda - the temporary FairPlay debug console - is a full in-page inspector
 * that exposes storage, cookies and XHR/fetch traffic. It is only ever meant to
 * exist in an explicitly authorised Vercel Preview build.
 *
 * WHY THIS REPLACEMENT EXISTS
 *
 * Leaving the code behind a runtime `if` is NOT sufficient. Next.js compiles an
 * unset `NEXT_PUBLIC_*` variable to a property lookup rather than a literal, so
 * the guard is not a constant and webpack cannot fold the branch. The measured
 * result was that a 485 kB Eruda chunk was emitted into the PRODUCTION output
 * even though no production session could ever fetch it. It is dead weight in
 * every production deploy, and it is a credential-exposing library sitting in
 * a production artifact.
 *
 * So the guard is enforced at BUNDLE time instead: unless
 * `NEXT_PUBLIC_FAIRPLAY_DEBUG=1` is set for the build (a Preview-scoped
 * variable, absent from Production by definition), the `eruda` module is
 * swapped for a no-op stub and zero bytes of Eruda reach the output. The
 * runtime gate in `DebugBoot` remains as defence in depth.
 */
const erudaEnabled = (process.env.NEXT_PUBLIC_FAIRPLAY_DEBUG ?? '').trim() === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config) {
    // The alias below depends on an environment variable that Next does NOT
    // include in its webpack cache version (that version only covers a fixed set
    // of next.config keys). Without this, a warm `.next/cache` - which Vercel
    // restores between builds - kept the old `eruda` resolution: a flag-on
    // build was measured shipping the stub, and the reverse would ship Eruda.
    // A different `cache.version` makes webpack refuse to reuse the cache.
    if (config.cache && typeof config.cache === 'object' && typeof config.cache.version === 'string') {
      config.cache.version = `${config.cache.version}|fairplay-debug:${erudaEnabled ? '1' : '0'}`;
    }
    if (!erudaEnabled) {
      // `resolve.alias` needs no webpack import and applies to both the client
      // and server compilations, which matters: the server module graph pulls
      // the module in as well, so it would otherwise ship in the server bundle
      // even though no client ever requests it.
      config.resolve ??= {};
      config.resolve.alias ??= {};
      config.resolve.alias.eruda = path.join(__dirname, 'src/lib/debug/eruda-stub.js');
    }
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
