// On-device heuristic analysis of a bread CRUMB photo.
//
// The FREE, OFFLINE crumb analyzer — the counterpart to starterVision.ts for
// finished bakes. Plain Canvas pixel processing maps simple image signals to a
// rough read on crumb openness, evenness, fermentation, and gluten, plus an
// under/good/over proofing guess. Like the starter version it is deliberately
// honest: confidence is always 'low' and the summary is labelled an estimate.
// The Claude path (analyzeCrumb in claude.ts) is the opt-in upgrade.

import type { PhotoBase64 } from './photos';
import type { CrumbAnalysis } from '../types';
import { extractSignals } from './starterVision';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Map a 0-100 score to the 1-5 scale used by CrumbAnalysis.scores. */
function toRating(score: number): number {
  return clamp(Math.floor(clamp(score, 0, 100) / 20), 0, 4) + 1;
}

/**
 * Analyze a crumb photo entirely on-device. Returns a CrumbAnalysis tagged
 * source:'on-device' with confidence:'low'. Needs no API key; throws only if
 * the image can't be decoded.
 */
export async function analyzeCrumbLocal(photo: PhotoBase64): Promise<CrumbAnalysis> {
  const sig = await extractSignals(photo);

  // --- Map signals to crumb scores (0-100) -----------------------------------
  // Edge density tracks the number of hole boundaries → openness. Dark ratio
  // captures large holes/shadowed cavities, which also reads as openness.
  const opennessRaw = clamp(sig.edgeDensity * 220 + sig.darkRatio * 120, 0, 100);

  // Evenness: a very rough crumb has high luminance spread. We invert roughness
  // so a uniform crumb (low spread) scores higher on evenness.
  const evennessRaw = clamp(100 - sig.roughness * 90, 0, 100);

  // Fermentation: open + reasonably even crumb suggests good fermentation.
  const fermentationRaw = clamp(opennessRaw * 0.6 + evennessRaw * 0.4, 0, 100);

  // Gluten development: structure that holds open holes with intact walls reads
  // as more edges relative to dark area. Penalize when dark (collapsed) ratio is
  // high relative to edges.
  const glutenRaw = clamp(sig.edgeDensity * 200 - sig.darkRatio * 60 + 30, 0, 100);

  // --- Proofing verdict ------------------------------------------------------
  // Tight, dense crumb (low openness) → likely under-proofed. Very open with
  // big dark cavities and uneven structure → likely over-proofed. Otherwise good.
  let proofingAssessment: CrumbAnalysis['proofingAssessment'] = 'good';
  if (opennessRaw < 35) proofingAssessment = 'under';
  else if (opennessRaw > 80 && evennessRaw < 45) proofingAssessment = 'over';

  const observations: string[] = [];
  observations.push(
    opennessRaw > 65
      ? 'Open crumb with sizeable holes visible.'
      : opennessRaw > 40
        ? 'Moderately open crumb.'
        : 'Tight, dense crumb with small holes.'
  );
  observations.push(
    evennessRaw > 60
      ? 'Holes are fairly evenly distributed.'
      : 'Uneven hole distribution — some large gaps next to dense areas.'
  );

  const suggestions: string[] = [];
  if (proofingAssessment === 'under') {
    suggestions.push('Crumb looks tight — try a longer bulk or final proof, or a warmer spot.');
    suggestions.push('Make sure the starter is at peak when you mix.');
  } else if (proofingAssessment === 'over') {
    suggestions.push('Large irregular holes can mean over-proofing — shorten the proof a touch.');
    suggestions.push('Shape with a bit more tension to even out the crumb.');
  } else {
    suggestions.push('Nicely balanced crumb — keep doing what you did here.');
  }

  return {
    timestamp: new Date(),
    type: 'crumb',
    source: 'on-device',
    summary:
      'Quick estimate: a rough on-device read of crumb structure from the photo. For richer feedback, add a Claude API key in Settings.',
    scores: {
      openness: toRating(opennessRaw),
      evenness: toRating(evennessRaw),
      fermentation: toRating(fermentationRaw),
      gluten: toRating(glutenRaw),
    },
    proofingAssessment,
    observations,
    suggestions,
    confidence: 'low',
  };
}
