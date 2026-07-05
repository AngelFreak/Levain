// Display-time localization for engine-generated schedule steps.
//
// The fermentation engine (lib/fermentation.ts) is a pure logic module and can't
// use React hooks, so it emits English `step`/`description`/`tips` (the canonical,
// persisted, string-matched values) PLUS optional translation keys + params. This
// helper resolves the display text: it prefers the keyed translation when a key is
// present, and falls back to the English field otherwise — so untranslated or
// legacy (pre-key) steps still render, just in English.

import type { ScheduleStep, TimelineStep } from '../../types';
import { translate, type TranslationKey } from './index';
import type { Language } from '../../types';

/** A step-like object carrying the optional i18n metadata createStep() adds. */
type LocalizableStep = Pick<ScheduleStep, 'step' | 'description' | 'tips'> & {
  nameKey?: string;
  descKey?: string;
  tipsKey?: string;
  i18nParams?: Record<string, string | number>;
};

function tk(
  language: Language,
  key: string | undefined,
  fallback: string,
  params?: Record<string, string | number>
): string {
  if (!key) return fallback;
  // Keys from the engine are plain strings; translate() is typed to TranslationKey.
  // A missing key still falls back to English inside translate(), so this is safe.
  return translate(language, key as TranslationKey, params);
}

export interface LocalizedStepText {
  name: string;
  description: string;
  tips?: string;
}

/** Resolve the localized name/description/tips for a schedule or timeline step. */
export function localizeScheduleStep(
  step: LocalizableStep,
  language: Language
): LocalizedStepText {
  return {
    name: tk(language, step.nameKey, step.step, step.i18nParams),
    description: tk(language, step.descKey, step.description, step.i18nParams),
    tips: step.tips ? tk(language, step.tipsKey, step.tips, step.i18nParams) : undefined,
  };
}

/** TimelineStep persists the same fields; localize its display text the same way. */
export function localizeTimelineStep(
  step: TimelineStep,
  language: Language
): LocalizedStepText {
  return localizeScheduleStep(step as unknown as LocalizableStep, language);
}
