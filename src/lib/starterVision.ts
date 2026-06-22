// On-device heuristic computer-vision analysis of a sourdough starter photo.
//
// This is the FREE, OFFLINE default analyzer. It uses plain Canvas pixel
// processing — no ML model, no download, no API key — so it works for every
// user instantly. It produces a rough "quick estimate" of fermentation
// activity and health from the photo's bubble/texture characteristics.
//
// It is deliberately honest about its limits: confidence is always 'low' and
// the summary is labelled an estimate. For richer, natural-language reasoning,
// the Claude path (src/lib/claude.ts) remains available as an opt-in upgrade.

import type { PhotoBase64 } from './photos';
import type { StarterAnalysis, StarterAnalysisContext } from '../types';

/** Raw image signals extracted from the photo. */
interface ImageSignals {
  /** Fraction of pixels on a strong edge (0-1) — proxy for bubble density. */
  edgeDensity: number;
  /** Std-dev of luminance (0-1) — proxy for surface texture / doming. */
  roughness: number;
  /** Fraction of very dark pixels (0-1) — possible hooch / deflated gaps. */
  darkRatio: number;
  /** Mean luminance (0-1). */
  brightness: number;
}

const RATINGS = [1, 2, 3, 4, 5] as const;
type Rating = (typeof RATINGS)[number];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Map a 0-100 score to the 1-5 Rating scale used by AIAnalysis.scores. */
function toRating(score: number): Rating {
  const idx = clamp(Math.floor(clamp(score, 0, 100) / 20), 0, 4);
  return RATINGS[idx];
}

/**
 * Decode the photo and extract luminance-based signals via an offscreen canvas.
 * Downscales to a small working size so it's fast even on a phone.
 */
async function extractSignals(photo: PhotoBase64): Promise<ImageSignals> {
  const dataUrl = `data:${photo.mediaType};base64,${photo.data}`;
  const img = await loadImage(dataUrl);

  // Downscale to a bounded working size (keeps aspect ratio).
  const MAX = 256;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for image analysis.');
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Build a luminance map (0-255).
  const lum = new Float32Array(w * h);
  let sum = 0;
  let darkCount = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec. 601 luma.
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[p] = l;
    sum += l;
    if (l < 40) darkCount++;
  }
  const mean = sum / lum.length;

  // Variance / std-dev of luminance.
  let varSum = 0;
  for (let p = 0; p < lum.length; p++) {
    const d = lum[p] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / lum.length);

  // Edge density via a simple Sobel gradient magnitude.
  let edgeCount = 0;
  const total = (w - 2) * (h - 2);
  const EDGE_THRESHOLD = 36; // gradient magnitude above which a pixel is an "edge"
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = lum[i - w - 1], t = lum[i - w], tr = lum[i - w + 1];
      const l = lum[i - 1], r = lum[i + 1];
      const bl = lum[i + w - 1], b = lum[i + w], br = lum[i + w + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > EDGE_THRESHOLD) edgeCount++;
    }
  }

  return {
    edgeDensity: total > 0 ? edgeCount / total : 0,
    roughness: clamp(std / 128, 0, 1), // normalise std (0-128 typical) to 0-1
    darkRatio: darkCount / lum.length,
    brightness: mean / 255,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the photo for analysis.'));
    img.src = src;
  });
}

/**
 * Analyze a starter photo entirely on-device. Returns a StarterAnalysis tagged
 * source:'on-device' with confidence:'low'. Never throws for missing keys — it
 * needs none. May throw only if the image can't be decoded.
 */
export async function analyzeStarterLocal(
  photo: PhotoBase64,
  ctx: StarterAnalysisContext
): Promise<{ analysis: StarterAnalysis; healthScore: number }> {
  const sig = await extractSignals(photo);

  // --- Map signals to a 0-100 activity score ---------------------------------
  // Bubble/edge density is the strongest activity cue; surface roughness
  // (doming/texture) reinforces it. Both are normalised so typical active
  // starters land high. These thresholds are deliberately gentle — this is an
  // estimate, not a measurement.
  const activityRaw =
    clamp(sig.edgeDensity / 0.18, 0, 1) * 65 + // edge density dominates
    clamp(sig.roughness / 0.45, 0, 1) * 35; // texture/doming contributes
  let activity = clamp(Math.round(activityRaw), 0, 100);

  // A lot of large dark uniform area suggests settling / hooch — dampen activity.
  if (sig.darkRatio > 0.25) {
    activity = clamp(activity - Math.round((sig.darkRatio - 0.25) * 120), 0, 100);
  }

  // --- Health -----------------------------------------------------------------
  // Health tracks activity but is penalised by signs of neglect (heavy hooch)
  // or an over-old culture with no recent feeding signal.
  let health = activity;
  if (sig.darkRatio > 0.3) health = clamp(health - 15, 0, 100);
  if (ctx.hoursSinceFeed !== undefined && ctx.hoursSinceFeed > 36) {
    health = clamp(health - 10, 0, 100);
  }

  // --- Readiness --------------------------------------------------------------
  // Readiness needs activity AND a sensible feed window. Freshly fed (<3h) or
  // long-unfed (>24h) starters aren't "ready to bake" even if bubbly.
  let readiness = activity;
  const hsf = ctx.hoursSinceFeed;
  if (hsf !== undefined) {
    if (hsf < 3) readiness = clamp(readiness - 35, 0, 100); // too soon after feed
    else if (hsf > 24) readiness = clamp(readiness - 30, 0, 100); // likely past peak / hungry
    else if (hsf >= 4 && hsf <= 12) readiness = clamp(readiness + 10, 0, 100); // sweet spot
  }
  // A very young starter (first ~7 days) is rarely bake-ready regardless.
  if (ctx.ageDays < 7) readiness = clamp(readiness - 25, 0, 100);

  const readyToBake = readiness >= 60;

  // --- Observations & suggestions --------------------------------------------
  const observations: string[] = [];
  if (sig.edgeDensity > 0.12) observations.push('Plenty of bubble activity visible across the surface.');
  else if (sig.edgeDensity > 0.05) observations.push('Some bubbling visible, but not heavily active.');
  else observations.push('Surface looks fairly smooth with little visible bubbling.');

  if (sig.roughness > 0.35) observations.push('Textured, domed surface — consistent with a rising culture.');
  else if (sig.roughness < 0.18) observations.push('Flat, even surface — the starter may have settled.');

  if (sig.darkRatio > 0.3) observations.push('Noticeable dark/uniform areas — possibly hooch or a deflated top.');
  if (sig.brightness < 0.2) observations.push('Photo is quite dark — brighter lighting would improve this estimate.');

  const suggestions: string[] = [];
  if (hsf !== undefined && hsf < 3) {
    suggestions.push('Recently fed — give it a few more hours to develop before baking.');
  }
  if (hsf !== undefined && hsf > 24) {
    suggestions.push('It has been a while since the last feed — feed it and wait for it to peak.');
  }
  if (sig.darkRatio > 0.3) {
    suggestions.push('If you see liquid (hooch), stir it in or pour it off, then feed.');
  }
  if (readyToBake) {
    suggestions.push('Looks active — a float test will confirm it is ready to bake.');
  } else if (activity < 40) {
    suggestions.push('Low activity — feed on a regular schedule and keep it warm (24-26°C).');
  }
  if (suggestions.length === 0) {
    suggestions.push('Keep up a consistent feeding routine and watch for it to roughly double.');
  }

  const summary = readyToBake
    ? 'Quick estimate: the starter looks active and may be ready to bake. Confirm with a float test.'
    : activity >= 45
      ? 'Quick estimate: moderate activity — developing but give it more time or another feed.'
      : 'Quick estimate: low visible activity — likely needs feeding and a warm spot.';

  const analysis: StarterAnalysis = {
    timestamp: new Date(),
    type: 'starter',
    source: 'on-device',
    summary,
    scores: {
      activity: toRating(activity),
      health: toRating(health),
      readiness: toRating(readiness),
    },
    estimatedHoursSinceFeed:
      hsf !== undefined ? `~${Math.round(hsf)} hours (from your log)` : 'unknown',
    readyToBake,
    observations,
    suggestions,
    confidence: 'low',
  };

  return { analysis, healthScore: health };
}
