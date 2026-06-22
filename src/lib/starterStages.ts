// Shared sourdough-starter feeding-cycle stage model.
//
// After a feed, a starter moves through recognizable stages. This module is the
// single source of truth for which stage a starter is in, used by BOTH the
// on-device analyzer and the Claude prompt, and surfaced as a badge in the UI.
//
// Sources (June 2026):
//  - The Perfect Loaf, "Sourdough Starter Maintenance Routine" (Maurizio Leo) —
//    room-temp (~23°C) timeline: domed ~4h, ripe/ready ~8-10h, past peak ~12h,
//    over-fermented ~24h.
//  - The Pantry Mama / Acres & Aprons — wait 4-6h minimum after feeding; peak
//    4-12h depending on temperature & flour; collapse → hooch when hungry.
//
// Temperature shifts the WHOLE timeline: warmer kitchens reach peak sooner,
// cooler ones later. We model that by scaling elapsed time before bucketing.

import type { StarterAnalysisContext, StarterStage } from '../types';

// StarterStage (defined in ../types) stages, for reference:
//  just_fed 0-2h equiv — weakest point, not ready
//  rising   2-6h equiv — expanding/doming, not yet
//  peak     6-12h equiv — ripe, best time to bake
//  falling  12-18h equiv — past peak, usable (more sour)
//  hungry   18h+ equiv — collapsed/hooch, feed first
//  unknown  no feed time logged
export type { StarterStage } from '../types';

/** Photo-derived signals the stage model can cross-check against. */
export interface StageSignals {
  /** Fraction of pixels on a strong edge (bubble density proxy). */
  edgeDensity: number;
  /** Luminance std-dev normalised 0-1 (surface texture / doming). */
  roughness: number;
  /** Fraction of very dark pixels (hooch / deflated proxy). */
  darkRatio: number;
}

export interface StageResult {
  stage: StarterStage;
  /** Short human label, e.g. "Peak — bake now". */
  label: string;
  /** One-line advice for this stage. */
  advice: string;
  /** True only at/just-before peak: the starter is genuinely bake-ready. */
  readyToBake: boolean;
  /** Effective (temperature-adjusted) hours since feed used to classify. */
  effectiveHours?: number;
}

// Room-temperature (~23°C) stage boundaries, in hours since feed.
const BASE = { rising: 2, peak: 6, falling: 12, hungry: 18 } as const;
const BASELINE_TEMP_C = 23;

/**
 * Scale real elapsed hours into temperature-adjusted "effective" hours.
 * Fermentation rate roughly doubles per ~9°C, so a warmer starter behaves as if
 * MORE time has passed (reaches peak sooner) and a cooler one as if less.
 */
export function effectiveHoursSinceFeed(hoursSinceFeed: number, ambientTemp?: number): number {
  if (ambientTemp === undefined) return hoursSinceFeed;
  const factor = Math.pow(2, (ambientTemp - BASELINE_TEMP_C) / 9);
  // Clamp the factor so an extreme/wrong temp can't produce absurd results.
  const clamped = Math.max(0.4, Math.min(2.5, factor));
  return hoursSinceFeed * clamped;
}

/**
 * Classify the current feeding-cycle stage from time-since-feed (temperature
 * adjusted), then cross-check against the photo when signals are provided.
 */
export function classifyStage(
  ctx: StarterAnalysisContext,
  signals?: StageSignals
): StageResult {
  const hsf = ctx.hoursSinceFeed;

  // No feed logged → we can still hint from the photo, but won't claim readiness.
  if (hsf === undefined) {
    if (signals && signals.darkRatio > 0.32) {
      return stageResult('hungry', undefined);
    }
    return stageResult('unknown', undefined);
  }

  const eff = effectiveHoursSinceFeed(hsf, ctx.ambientTemp);

  let stage: StarterStage;
  if (eff < BASE.rising) stage = 'just_fed';
  else if (eff < BASE.peak) stage = 'rising';
  else if (eff < BASE.falling) stage = 'peak';
  else if (eff < BASE.hungry) stage = 'falling';
  else stage = 'hungry';

  // --- Photo cross-checks (only nudge, never override the just-fed safety) ---
  if (signals) {
    const { edgeDensity, roughness, darkRatio } = signals;
    // Strong hooch / collapse signal late in the cycle → hungry regardless.
    if (darkRatio > 0.32 && (stage === 'falling' || stage === 'peak')) {
      stage = 'hungry';
    }
    // In the peak window but the surface looks flat & inactive → likely not
    // actually peaked yet (slow ferment / cool spot); demote to rising.
    if (stage === 'peak' && edgeDensity < 0.05 && roughness < 0.18) {
      stage = 'rising';
    }
    // Past-peak window but still strongly domed & bubbly → still at peak.
    if (stage === 'falling' && edgeDensity > 0.14 && roughness > 0.35 && darkRatio < 0.2) {
      stage = 'peak';
    }
  }

  return stageResult(stage, eff);
}

function stageResult(stage: StarterStage, effectiveHours?: number): StageResult {
  switch (stage) {
    case 'just_fed':
      return {
        stage,
        label: 'Just fed',
        advice:
          'Just fed — at its weakest now. Give it a few hours to rise before baking, even if bubbles appear.',
        readyToBake: false,
        effectiveHours,
      };
    case 'rising':
      return {
        stage,
        label: 'Rising',
        advice: 'Actively rising toward peak. Wait until it domes and roughly doubles.',
        readyToBake: false,
        effectiveHours,
      };
    case 'peak':
      return {
        stage,
        label: 'Peak — bake now',
        advice: 'At or near peak — the strongest time to bake. Confirm with a float test.',
        readyToBake: true,
        effectiveHours,
      };
    case 'falling':
      return {
        stage,
        label: 'Past peak',
        advice:
          'Just past peak — still usable and a touch more sour, but use soon or feed for the next rise.',
        readyToBake: false,
        effectiveHours,
      };
    case 'hungry':
      return {
        stage,
        label: 'Hungry — feed it',
        advice: 'Collapsed/hungry (or showing hooch). Feed it and wait for the next peak before baking.',
        readyToBake: false,
        effectiveHours,
      };
    default:
      return {
        stage: 'unknown',
        label: 'Stage unknown',
        advice: 'Log a feeding so the stage (and readiness) can be judged from time since the last feed.',
        readyToBake: false,
        effectiveHours,
      };
  }
}

/** Tailwind color classes for a stage badge (matches app palette). */
export function stageBadgeVariant(stage: StarterStage): 'success' | 'warning' | 'error' | 'default' {
  switch (stage) {
    case 'peak':
      return 'success';
    case 'rising':
    case 'falling':
      return 'warning';
    case 'hungry':
      return 'error';
    default:
      return 'default';
  }
}
