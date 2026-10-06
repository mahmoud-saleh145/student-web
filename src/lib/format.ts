export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US').format(value);
}

/**
 * A percentage for display. CSS widths must keep Latin digits and are built
 * separately — `width: ٨٠%` is not a length.
 */
export function formatPercent(value: number, locale: string): string {
  return `${formatNumber(Math.round(value), locale)}%`;
}

export function formatMoney(money: { amount: number; currency: string }, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: money.currency,
      maximumFractionDigits: 2,
    }).format(money.amount);
  } catch {
    return `${money.amount} ${money.currency}`;
  }
}

export function formatDuration(totalSeconds: number, locale: string): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Interpolating the numbers directly printed Western digits, while every
  // other figure on the page went through Intl and printed Arabic-Indic ones —
  // so a single row of stats read "٣ دروس" next to "6 د". Durations are counts
  // like any other and follow the locale's digits.
  //
  // `formatTimecode` deliberately does not: a player's position is a fixed-width
  // readout that stays in Western digits on both platforms.
  const n = (value: number) => formatNumber(value, locale);

  if (hours > 0) {
    return locale === 'ar' ? `${n(hours)} س ${n(minutes)} د` : `${n(hours)}h ${n(minutes)}m`;
  }
  return locale === 'ar' ? `${n(minutes)} د` : `${n(minutes)}m`;
}

export function formatCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string, locale: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { numeric: 'auto' });

  if (diffSec < 60) return rtf.format(-diffSec, 'second');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHr < 24) return rtf.format(-diffHr, 'hour');
  if (diffDay < 7) return rtf.format(-diffDay, 'day');
  return formatDate(iso, locale);
}

export function formatTimecode(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-2)}`;
}

export function localizedName(
  entity: { name: string; nameAr?: string | null } | null | undefined,
  locale: string
): string {
  if (!entity) return '—';
  if (locale === 'ar' && entity.nameAr) return entity.nameAr;
  return entity.name;
}
