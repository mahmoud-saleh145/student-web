/**
 * The content language the backend should answer in.
 *
 * The backend localises notification titles, announcement bodies and similar
 * content from `Accept-Language`, defaulting to English. The mobile client
 * sends the app's chosen language on every request; the web proxy sent
 * nothing, so an Arabic-language student on the web read English
 * announcements the phone showed in Arabic.
 *
 * The browser's own `Accept-Language` describes the browser, not the app's
 * language setting, so the web client sets the header explicitly and the proxy
 * forwards only the two values the platform supports.
 */
export type ContentLocale = 'en' | 'ar';

export function contentLocale(header: string | null | undefined): ContentLocale | null {
  if (!header) return null;
  const first = header.split(',')[0]?.trim().toLowerCase() ?? '';
  const primary = first.split(/[-;]/)[0] ?? '';
  return primary === 'ar' || primary === 'en' ? primary : null;
}
