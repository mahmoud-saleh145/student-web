/**
 * Which paths the session middleware leaves alone.
 *
 * The middleware redirects a visitor with no session cookie to /login. That is
 * a routing decision, and it must not fire on anything that is not a page -
 * static files are served by the platform itself and carry no user data.
 *
 * THE GAP THIS EXISTS TO CLOSE
 * ---------------------------
 * pdf.js fetches its standard-font metrics and CMaps at runtime from
 * `/pdfjs/**`. Those files end in `.pfb` and `.bcmap`, and NEITHER was listed
 * here, so every fetch ran through the middleware. Verified against the deployed
 * app: `GET /pdfjs/standard_fonts/FoxitSerif.pfb` answered `307` to
 * `/login?next=...`, and following that returned a 15 KB HTML login page where
 * pdf.js expected binary font data. The fetch "succeeded" with the wrong bytes,
 * the font never loaded, and pdf.js fell back to whatever the device's own font
 * stack supplied - which is why the same document looked correct on one device
 * and overlapped on others.
 *
 * The middleware's own comment already said "static assets need no session";
 * the list simply did not cover these two extensions.
 *
 * Nothing here is confidential. CMaps and the standard-14 font programs are
 * generic tables shipped by pdf.js, byte-identical for every user and every
 * document. No PDF, no signed URL and no authorization material is involved.
 */

/** Extensions served as static files, which never need a session. */
export const PUBLIC_ASSET_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'woff',
  'woff2',
  'txt',
  'xml',
  'webmanifest',
  // pdf.js runtime data. Without these the viewer's font/CMap fetches are
  // answered with the login page instead of the file.
  'pfb',
  'bcmap',
  'ttf',
] as const;

/**
 * Next's middleware matcher. Built from the list above so the two cannot drift:
 * an extension added here is automatically exempt from the session redirect.
 */
export const MIDDLEWARE_MATCHER = [
  `/((?!api/|_next/|favicon\\.ico|.*\\.(?:${PUBLIC_ASSET_EXTENSIONS.join('|')})$).*)`,
];