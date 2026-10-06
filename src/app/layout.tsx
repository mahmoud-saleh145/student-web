import type { Metadata, Viewport } from 'next';
import { Cairo, Inter } from 'next/font/google';

import { getSessionUser } from '@/lib/session';

import './globals.css';
import { Providers } from './providers';

/**
 * The student app's two typefaces, self-hosted by next/font.
 *
 * These are the faces the mobile app bundles, and they were already named in
 * `--font-sans` — but nothing loaded them, so every visitor fell back to
 * whatever their system happened to have and the web looked like a different
 * product from the phone. Latin and Arabic are loaded separately because the
 * Arabic face has to carry the Arabic UI on its own.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-cairo',
});

export const metadata: Metadata = {
  title: 'Student Center',
  description: 'Student learning platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

/**
 * Theme and writing direction are applied before the first paint.
 *
 * Both were previously set in an effect, which runs after hydration: a dark-mode
 * visitor got a full-screen white flash, and an English visitor watched the
 * whole page start right-aligned and then jump. The stores persist through
 * zustand, so the values are read from the same localStorage entries the app
 * writes — a mismatch here would be worse than the flash, because the document
 * would disagree with the store until something re-rendered.
 */
const BOOT_SCRIPT = `
(function () {
  function read(key, field) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var value = parsed && parsed.state ? parsed.state[field] : null;
      return typeof value === 'string' ? value : null;
    } catch (e) {
      return null;
    }
  }
  var root = document.documentElement;
  try {
    var pref = read('edu-web-theme', 'preference');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', pref === 'light' || pref === 'dark' ? pref : system);
  } catch (e) {
    root.setAttribute('data-theme', 'light');
  }
  var lang = read('edu-web-language', 'language');
  if (lang !== 'en' && lang !== 'ar') lang = 'ar';
  root.setAttribute('lang', lang);
  root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="ar" dir="rtl" className={`${inter.variable} ${cairo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers initialUser={user}>{children}</Providers>
      </body>
    </html>
  );
}
