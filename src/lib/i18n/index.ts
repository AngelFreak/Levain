// Lightweight in-house i18n — no runtime dependency.
//
// The `en` catalog is the single source of truth: its keys define `TranslationKey`,
// so every `t('...')` call is type-checked and a missing key is a compile error.
// Other locales (e.g. `da`) are `Partial` catalogs that fall back to `en` per key,
// so an untranslated string degrades to English rather than showing a raw key.
//
// Formatting (numbers, temperature, dates) stays metric-first and lives in
// ./format.ts — i18n changes copy, not units.

import { en } from './en';
import { da } from './da';
import type { Language } from '../../types';

export type TranslationKey = keyof typeof en;

/** Per-locale catalogs. `en` is complete; others may be partial (fall back to en). */
const catalogs: Record<Language, Partial<Record<TranslationKey, string>>> = {
  en,
  da,
};

export const LANGUAGES: { value: Language; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'da', label: 'Danish', nativeLabel: 'Dansk' },
];

/** Substitute `{name}` placeholders from a vars map. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match
  );
}

/**
 * Translate a key for a given language, with `{var}` interpolation. Falls back to
 * the English string when the locale lacks the key, and to the raw key only if
 * even English is missing (which the types prevent for real keys).
 */
export function translate(
  language: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const localized = catalogs[language]?.[key];
  const template = localized ?? en[key] ?? key;
  return interpolate(template, vars);
}
