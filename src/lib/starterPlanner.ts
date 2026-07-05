// Starter feed planner: "feed so it peaks by time T".
//
// Reuses the app's ratio→peak table and Q10 temperature model (fermentation.ts)
// and, when available, the starter's measured average time-to-peak (Stage 2) to
// personalize the recommendation. Produces a feeding ratio and the exact time to
// feed so the starter is at peak by the target.

import { STARTER_PEAK_TIMES, getTemperatureMultiplier } from './fermentation';

export interface FeedPlan {
  /** Recommended feeding ratio, e.g. "1:5:5". */
  ratio: string;
  /** Temperature-adjusted hours from feeding to peak for that ratio. */
  peakHours: number;
  /** When to feed so it peaks by the target. */
  feedAt: Date;
  /** The target peak time echoed back. */
  targetPeak: Date;
  /**
   * 'ok'         — feed in the future, comfortably.
   * 'feed_now'   — the ideal feed time is already at/just past now; feed asap.
   * 'too_soon'   — even the fastest ratio peaks after the target; not reachable.
   * 'past'       — the target is in the past.
   */
  status: 'ok' | 'feed_now' | 'too_soon' | 'past';
  /** Whether the plan used the starter's measured peak vs the generic table. */
  personalized: boolean;
}

/**
 * Adjust a reference (≈24°C) peak time to the given ambient temperature.
 * Warmer → faster (shorter); cooler → slower (longer).
 */
function adjustPeakForTemp(referenceHours: number, ambientTemp: number): number {
  return referenceHours * getTemperatureMultiplier(ambientTemp);
}

/**
 * Plan a feed so the starter peaks by `targetPeak`.
 *
 * @param targetPeak    When you want the starter at peak (ready to bake).
 * @param ambientTemp   Kitchen temperature in °C.
 * @param avgPeakHours  The starter's measured, temp-normalized average peak
 *                      (Starter.averagePeakTime), if known — personalizes the plan.
 * @param now           Injectable current time for deterministic tests.
 */
export function planStarterFeed(
  targetPeak: Date,
  ambientTemp: number,
  avgPeakHours?: number,
  now: Date = new Date()
): FeedPlan {
  const hoursAvailable = (targetPeak.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursAvailable <= 0) {
    return {
      ratio: '1:1:1',
      peakHours: adjustPeakForTemp(STARTER_PEAK_TIMES['1:1:1'], ambientTemp),
      feedAt: now,
      targetPeak,
      status: 'past',
      personalized: false,
    };
  }

  // Candidate ratios with their temperature-adjusted peak times. When the
  // starter has a measured average peak, blend it in: scale every ratio's table
  // peak by the ratio of (measured / its-own-table-peak at the measured anchor).
  // Simpler and robust: if measured is known, anchor the standard "1:5:5"
  // maintenance feed to it and scale the others proportionally to the table.
  const personalized = typeof avgPeakHours === 'number' && avgPeakHours > 0;
  const anchorRatio = '1:5:5';
  const anchorTablePeak = STARTER_PEAK_TIMES[anchorRatio];
  const scale = personalized ? (avgPeakHours as number) / anchorTablePeak : 1;

  const candidates = Object.entries(STARTER_PEAK_TIMES)
    .map(([ratio, tablePeak]) => ({
      ratio,
      peakHours: adjustPeakForTemp(tablePeak * scale, ambientTemp),
    }))
    // Slowest first, so we prefer the gentlest feed that still fits.
    .sort((a, b) => b.peakHours - a.peakHours);

  // Prefer the slowest ratio that still peaks by the target (gentlest feed that
  // fits the available time). If none fit, fall back to the fastest.
  const fitting = candidates.filter((c) => c.peakHours <= hoursAvailable);
  const chosen = fitting[0] ?? candidates[candidates.length - 1];

  const feedAtMs = targetPeak.getTime() - chosen.peakHours * 60 * 60 * 1000;
  const feedAt = new Date(feedAtMs);

  let status: FeedPlan['status'] = 'ok';
  if (!fitting.length) {
    status = 'too_soon'; // even the quickest feed can't peak in time
  } else if (feedAtMs <= now.getTime() + 5 * 60 * 1000) {
    status = 'feed_now'; // ideal feed time is essentially now
  }

  return {
    ratio: chosen.ratio,
    peakHours: Math.round(chosen.peakHours * 10) / 10,
    feedAt,
    targetPeak,
    status,
    personalized,
  };
}

/** Approximate peak-window label for a ratio (from the table, at reference temp). */
export function ratioPeakLabel(ratio: string): string {
  const h = STARTER_PEAK_TIMES[ratio];
  return h ? `~${h}h at 24°C` : '';
}
