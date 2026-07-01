// Locale-aware FORMATTING — distinct from translation (copy).
//
// Levain is metric-first by design: temperatures stay °C, weights stay grams, and
// switching language must NOT change units. These helpers only localize how dates,
// times and numbers are *rendered* (separators, month names, 12h/24h), never what
// they mean.

import type { Language } from '../../types';

/** Map our app language to a BCP-47 locale for Intl formatting. */
function intlLocale(language: Language): string {
  return language === 'da' ? 'da-DK' : 'en-US';
}

/** Localized date, e.g. "Jun 30" / "30. jun." */
export function formatDate(
  date: Date,
  language: Language,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
): string {
  return date.toLocaleDateString(intlLocale(language), opts);
}

/** Localized time honoring the user's 12h/24h preference. */
export function formatClock(
  date: Date,
  language: Language,
  use24h: boolean
): string {
  return date.toLocaleTimeString(intlLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24h,
  });
}

/** Localized date+time, e.g. for reminder confirmations. */
export function formatDateTime(
  date: Date,
  language: Language,
  use24h: boolean
): string {
  return date.toLocaleString(intlLocale(language), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24h,
  });
}

/** Localized number (decimal separator), metric value unchanged. */
export function formatNumber(
  value: number,
  language: Language,
  opts?: Intl.NumberFormatOptions
): string {
  return value.toLocaleString(intlLocale(language), opts);
}

/**
 * Localized short date for schedule rows: "Today"/"Tomorrow" (translated) or a
 * locale-formatted weekday+date. Replaces the en-US/hardcoded formatDate in
 * lib/fermentation.ts at the display boundary. Takes a `t` so the relative-day
 * words come from the catalog.
 */
export function formatScheduleDate(
  date: Date,
  language: Language,
  t: (key: 'common.today' | 'common.tomorrow') => string
): string {
  const d = new Date(date);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return t('common.today');
  if (d.toDateString() === tomorrow.toDateString()) return t('common.tomorrow');

  return d.toLocaleDateString(intlLocale(language), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
