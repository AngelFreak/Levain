// Feeding-derived starter statistics.
//
// The SINGLE source of truth for turning a starter's logged feedings into
// activity metrics: average time-to-peak (temperature-normalized), feeding
// cadence, and a behavioral "activity" score. Kept separate from the
// photo-analysis healthScore so the two writers never clobber each other.

import type { Feeding, StarterFeedingStats } from '../types';
import { getTemperatureMultiplier } from './fermentation';

/** Minimum peak samples before we trust an average time-to-peak. */
const MIN_PEAK_SAMPLES = 1;

/**
 * Hours from feeding to peak for a feeding that recorded a peak, normalized to
 * the reference temperature so values are comparable across warm/cold sessions.
 *
 * getTemperatureMultiplier(T) is how fast fermentation runs at T relative to the
 * reference (warmer → <1, i.e. faster → shorter observed time). To express an
 * observed time as "what it would be at the reference temp", divide by that
 * multiplier: warm-and-fast observations scale UP, cold-and-slow scale DOWN.
 */
function normalizedPeakHours(feeding: Feeding): number | null {
  if (!feeding.peakTime) return null;
  const ms = new Date(feeding.peakTime).getTime() - new Date(feeding.timestamp).getTime();
  if (!(ms > 0)) return null; // guard against bad/zero/negative data
  const observedHours = ms / (1000 * 60 * 60);
  const temp = feeding.ambientTemp;
  if (typeof temp !== 'number') return observedHours; // no temp → use as-is
  const mult = getTemperatureMultiplier(temp);
  return mult > 0 ? observedHours / mult : observedHours;
}

/**
 * Chronological series of normalized time-to-peak (hours) for feedings that
 * recorded a peak, oldest→newest. For the StarterDetail sparkline.
 */
export function computeNormalizedPeakSeries(feedings: Feeding[]): Array<{ hours: number }> {
  return [...feedings]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((f) => {
      const h = normalizedPeakHours(f);
      return h === null ? null : { hours: Math.round(h * 10) / 10 };
    })
    .filter((p): p is { hours: number } => p !== null);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Days between consecutive feedings (sorted oldest→newest). */
function intervalDays(feedings: Feeding[]): number[] {
  const times = feedings
    .map((f) => new Date(f.timestamp).getTime())
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push((times[i] - times[i - 1]) / (1000 * 60 * 60 * 24));
  }
  return gaps;
}

/**
 * A 0–100 behavioral activity score from three signals:
 *  - recency: fed recently relative to its own cadence → higher
 *  - consistency: regular intervals (low spread) → higher
 *  - peak reliability: more feedings reached a recorded peak → higher
 * Missing inputs are simply skipped so a sparse history still yields a fair,
 * if lower-confidence, number.
 */
function activityScore(
  feedings: Feeding[],
  intervals: number[],
  peakSamples: number,
  nowMs: number
): number | undefined {
  if (feedings.length === 0) return undefined;

  const parts: number[] = [];

  // Recency: hours since last feed vs. typical cadence (fallback 24h).
  const lastFedMs = Math.max(...feedings.map((f) => new Date(f.timestamp).getTime()));
  const hoursSince = (nowMs - lastFedMs) / (1000 * 60 * 60);
  const cadenceHours = intervals.length ? median(intervals) * 24 : 24;
  // 0 overdue → 100; at 2× the cadence overdue → ~0.
  const recency = Math.max(0, Math.min(100, 100 * (1 - hoursSince / (2 * cadenceHours))));
  parts.push(recency);

  // Consistency: coefficient of variation of intervals → lower spread is better.
  if (intervals.length >= 2) {
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (mean > 0) {
      const variance =
        intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
      const cv = Math.sqrt(variance) / mean;
      parts.push(Math.max(0, Math.min(100, 100 * (1 - cv))));
    }
  }

  // Peak reliability: share of feedings that recorded a peak.
  parts.push(Math.max(0, Math.min(100, (peakSamples / feedings.length) * 100)));

  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/**
 * Compute all feeding-derived stats for a starter. `now` is injectable for
 * deterministic tests; defaults to the current time.
 */
export function computeStarterStats(
  feedings: Feeding[],
  now: Date = new Date()
): StarterFeedingStats {
  const nowMs = now.getTime();

  const peakHours = feedings
    .map(normalizedPeakHours)
    .filter((h): h is number => h !== null);

  const averagePeakHours =
    peakHours.length >= MIN_PEAK_SAMPLES
      ? Math.round((peakHours.reduce((a, b) => a + b, 0) / peakHours.length) * 10) / 10
      : undefined;

  const intervals = intervalDays(feedings);
  const medianIntervalDays =
    intervals.length >= 1 ? Math.round(median(intervals) * 10) / 10 : undefined;

  return {
    feedingCount: feedings.length,
    peakSampleCount: peakHours.length,
    averagePeakHours,
    medianIntervalDays,
    activityScore: activityScore(feedings, intervals, peakHours.length, nowMs),
  };
}

/**
 * The fields to persist on the Starter record after computing stats. Keeps the
 * write in one place so callers don't diverge. `averagePeakTime` mirrors
 * `averagePeakHours` for the existing top-level field.
 */
export function statsToStarterUpdate(stats: StarterFeedingStats): {
  feedingStats: StarterFeedingStats;
  averagePeakTime?: number;
} {
  return {
    feedingStats: stats,
    averagePeakTime: stats.averagePeakHours,
  };
}
