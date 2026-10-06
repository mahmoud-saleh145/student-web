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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
