import { useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { translate, type TranslationKey } from './index';
import type { Language } from '../../types';

/**
 * Hook returning a memoized `t(key, vars)` bound to the current language setting.
 * Components re-render when the language changes because they subscribe to the
 * `language` slice of the settings store.
 */
export function useTranslation(): {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  language: Language;
} {
  const language = useSettingsStore((s) => s.settings.language);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language]
  );

  return { t, language };
}
