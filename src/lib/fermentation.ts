// Fermentation Calculations for Levain
// Based on research from The Sourdough Journey, bwraith's models, and scientific papers

import type {
  ReverseCalculatorInput,
  ReverseCalculatorOutput,
  ScheduleStep,
  AlternativeSchedule,
  FlourType,
  StarterStrength,
} from '../types';

// ============================================================================
// Constants - Based on Research Data
// ============================================================================

/**
 * Base bulk fermentation times at 23°C (74°F) for different inoculation percentages
 * Times are in hours to reach ~75% rise (ready to shape)
 */
const BASE_BULK_TIMES: Record<number, number> = {
  5: 14.0,
  10: 12.5,
  15: 10.5,
  20: 8.5,
  25: 7.5,
  30: 6.5,
};

/**
 * Starter feeding ratios and their approximate peak times at 24°C
 * Format: ratio string -> hours to peak
 */
export const STARTER_PEAK_TIMES: Record<string, number> = {
  '1:0.5:0.5': 2, // Very quick refresh
  '1:1:1': 3, // Quick feed - adjusted down from 4
  '1:2:2': 4, // Standard feed - adjusted down from 6
  '1:3:3': 6, // Adjusted down from 8
  '1:5:5': 8, // Adjusted down from 12
};

/**
 * Flour type speed multipliers for fermentation
 * < 1.0 = faster fermentation
 * > 1.0 = slower fermentation
 */
const FLOUR_MULTIPLIERS: Record<FlourType, number> = {
  bread: 1.0,
  allpurpose: 1.15,
  wholewheat: 0.8,
  rye: 0.7,
  mixed: 0.9,
};

/**
 * Starter strength multipliers
 * < 1.0 = faster (stronger starter)
 * > 1.0 = slower (weaker starter)
 */
const STRENGTH_MULTIPLIERS: Record<StarterStrength, number> = {
  weak: 1.4,
  developing: 1.2,
  normal: 1.0,
  strong: 0.85,
  vigorous: 0.7,
};

/**
 * Reference temperature for calculations (in Celsius)
 */
const REFERENCE_TEMP = 23;

/**
 * Temperature coefficient: fermentation roughly doubles for every 8°C increase
 */
const TEMP_DOUBLING_DEGREES = 8;

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Calculate temperature adjustment factor
 * Based on Q10 principle adapted for fermentation
 */
export function getTemperatureMultiplier(tempC: number): number {
  const tempDiff = tempC - REFERENCE_TEMP;
  // Fermentation speed doubles/halves every 8°C
  return Math.pow(2, -tempDiff / TEMP_DOUBLING_DEGREES);
}

/**
 * Get flour type multiplier, accounting for whole grain percentage
 */
export function getFlourMultiplier(
  flourType: FlourType,
  wholeGrainPercent: number
): number {
  const baseMultiplier = FLOUR_MULTIPLIERS[flourType];
  // Whole grains speed up fermentation
  const wholeGrainAdjustment = 1 - (wholeGrainPercent / 100) * 0.2;
  return baseMultiplier * wholeGrainAdjustment;
}

/**
 * Calculate bulk fermentation time for given parameters
 */
export function calculateBulkTime(
  inoculation: number,
  tempC: number,
  flourType: FlourType,
  wholeGrainPercent: number,
  starterStrength: StarterStrength
): number {
  // Find closest inoculation percentage in table
  const inoculations = Object.keys(BASE_BULK_TIMES).map(Number);
  const closestInoculation = inoculations.reduce((prev, curr) =>
    Math.abs(curr - inoculation) < Math.abs(prev - inoculation) ? curr : prev
  );

  // Interpolate if between values
  let baseTime: number;
  if (inoculation === closestInoculation) {
    baseTime = BASE_BULK_TIMES[closestInoculation];
  } else {
    const lower = inoculations
      .filter((i) => i <= inoculation)
      .sort((a, b) => b - a)[0] || 5;
    const upper = inoculations
      .filter((i) => i >= inoculation)
      .sort((a, b) => a - b)[0] || 30;
    const ratio = (inoculation - lower) / (upper - lower);
    baseTime =
      BASE_BULK_TIMES[lower] + ratio * (BASE_BULK_TIMES[upper] - BASE_BULK_TIMES[lower]);
  }

  // Apply multipliers
  const tempMultiplier = getTemperatureMultiplier(tempC);
  const flourMultiplier = getFlourMultiplier(flourType, wholeGrainPercent);
  const strengthMultiplier = STRENGTH_MULTIPLIERS[starterStrength];

  return baseTime * tempMultiplier * flourMultiplier * strengthMultiplier;
}

/**
 * Find optimal starter ratio for target peak time
 */
export function getStarterRatioForPeakTime(targetHours: number): string {
  const ratios = Object.entries(STARTER_PEAK_TIMES);
  let best = ratios[0];

  for (const [ratio, peakTime] of ratios) {
    if (Math.abs(peakTime - targetHours) < Math.abs(best[1] - targetHours)) {
      best = [ratio, peakTime];
    }
  }

  return best[0];
}

/**
 * Calculate how many hours until desired ready time
 */
export function getHoursUntilReady(desiredReadyTime: Date): number {
  const now = new Date();
  return (desiredReadyTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/**
 * Check if a time falls within night hours (when people are sleeping)
 */
export function isNightHour(date: Date, nightStart = 23, nightEnd = 7): boolean {
  const hour = date.getHours();
  if (nightStart > nightEnd) {
    // Night spans midnight (e.g., 23:00 - 07:00)
    return hour >= nightStart || hour < nightEnd;
  } else {
    // Night doesn't span midnight (unusual but handle it)
    return hour >= nightStart && hour < nightEnd;
  }
}

/**
 * Find the next "awake" time after a given date
 */
export function getNextAwakeTime(date: Date, nightStart = 23, nightEnd = 7): Date {
  const result = new Date(date);
  const hour = result.getHours();

  if (isNightHour(result, nightStart, nightEnd)) {
    // Move to the end of night hours
    if (hour >= nightStart) {
      // After nightStart, move to next day's nightEnd
      result.setDate(result.getDate() + 1);
    }
    result.setHours(nightEnd, 0, 0, 0);
  }

  return result;
}

// ============================================================================
// Schedule Generation
// ============================================================================

/**
 * Standard baking step durations (in minutes)
 */
const STEP_DURATIONS = {
  feedStarter: 10,
  autolyse: 30, // Reduced from 45 - 30 min is sufficient
  mixDough: 15,
  fold: 2,
  preshape: 5,
  benchRest: 15, // Reduced from 20
  finalShape: 10,
  proofWarm: 45, // Reduced from 60 - can be shorter at room temp
  proofCold: 240, // 4-24 hours, using 4 as base (reduced from 8)
  preheatOven: 45, // Reduced from 60 - most ovens don't need full hour
  bakeCovered: 20,
  bakeUncovered: 20, // Reduced from 25
  cool: 45, // Reduced from 60 - can cut into sooner
};

/**
 * Generate a unique step ID
 */
function generateStepId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Create schedule step
 */
function createStep(
  step: string,
  time: Date,
  duration: number,
  description: string,
  tips?: string,
  notifyBefore?: number,
  photoPrompt?: string
): ScheduleStep {
  return {
    id: generateStepId(),
    step,
    time: new Date(time),
    duration,
    description,
    tips,
    notifyBefore,
    photoPrompt,
  };
}

/**
 * Main reverse time calculator function
 */
export function calculateReverseSchedule(
  input: ReverseCalculatorInput
): ReverseCalculatorOutput {
  const hoursAvailable = getHoursUntilReady(input.desiredReadyTime);
  const schedule: ScheduleStep[] = [];
  const warnings: string[] = [];

  // Calculate minimum and maximum possible times
  const minBulkTime = calculateBulkTime(
    30,
    input.ambientTemperature,
    input.flourType,
    input.wholeGrainPercentage,
    input.starterStrength
  );

  const maxBulkTime = calculateBulkTime(
    5,
    input.ambientTemperature,
    input.flourType,
    input.wholeGrainPercentage,
    input.starterStrength
  );

  // Calculate total process time components
  const starterPrepTime = 3; // Hours for starter to peak (1:1:1 quick feed)
  const autolyseTime = input.includeAutolyse ? STEP_DURATIONS.autolyse : 0;
  const mixingTime = (autolyseTime + STEP_DURATIONS.mixDough) / 60;
  const shapingTime = (STEP_DURATIONS.preshape + STEP_DURATIONS.benchRest + STEP_DURATIONS.finalShape) / 60;
  const bakingTime = (STEP_DURATIONS.preheatOven + STEP_DURATIONS.bakeCovered + STEP_DURATIONS.bakeUncovered) / 60;
  const coolingTime = STEP_DURATIONS.cool / 60;

  // For cold retard schedules with night avoidance:
  // Ideal overnight workflow (based on Danish sourdough roll recipes):
  // - Afternoon (~15:00-16:00): Feed starter
  // - Late afternoon/evening: Mix, autolyse, bulk ferment with folds
  // - Evening (~21:00-22:00): Bulk dough into fridge (NO shaping yet!)
  // - Overnight: Cold proof in fridge (sleep!)
  // - Morning: Pull from fridge, preheat oven, shape cold dough, bake
  // - Morning (~09:00-10:00): Fresh bake ready!
  let proofTime: number;
  let coldProofStartTime: Date | null = null;
  let targetFridgeTime: Date | null = null; // When bulk dough goes into fridge
  let shapeInMorning = false; // Flag for morning shaping workflow

  if (input.includeColdRetard && input.avoidNightHours) {
    // Calculate when baking needs to start (work backwards from ready time)
    const bakeStartTime = new Date(input.desiredReadyTime.getTime() - (bakingTime + coolingTime) * 60 * 60 * 1000);

    // For rolls: shape in the morning (cold dough is easier to handle)
    // For bread: shape in evening, cold proof shaped loaf
    // User can override with bakeType input
    const isMorningBake = bakeStartTime.getHours() < 14; // Before 2pm counts as "morning bake"
    shapeInMorning = input.bakeType === 'rolls' || (input.bakeType !== 'bread' && isMorningBake);

    // Target time to put bulk dough in fridge: ~21:00-22:00 the evening before
    targetFridgeTime = new Date(bakeStartTime);
    targetFridgeTime.setDate(targetFridgeTime.getDate() - 1);
    targetFridgeTime.setHours(21, 0, 0, 0); // Bulk into fridge at 21:00

    // Cold proof starts when bulk goes into fridge
    coldProofStartTime = new Date(targetFridgeTime);

    // For morning bakes: pull from fridge, shape while oven preheats
    // Shaping cold dough + preheat happens together in the morning
    const pullFromFridgeTime = new Date(bakeStartTime.getTime() - (STEP_DURATIONS.preheatOven / 60) * 60 * 60 * 1000);

    const coldProofMs = pullFromFridgeTime.getTime() - coldProofStartTime.getTime();
    proofTime = Math.max(4, coldProofMs / (1000 * 60 * 60)); // At least 4 hours

    // Validate - cold proof shouldn't exceed 24 hours
    if (proofTime > 24) {
      warnings.push(
        `Cold proof would be ${Math.round(proofTime)} hours. Consider adjusting your bake time.`
      );
      proofTime = Math.min(24, proofTime);
    }

    // For very short cold proofs, warn
    if (proofTime < 6) {
      warnings.push(
        `Short cold proof (${Math.round(proofTime)} hours). For best flavor, aim for 8-12 hours overnight.`
      );
    }
  } else if (input.includeColdRetard) {
    // Cold retard without night avoidance - use specified duration
    proofTime = input.coldRetardDuration || 8;
  } else {
    // Warm proof
    proofTime = STEP_DURATIONS.proofWarm / 60;
  }

  // Calculate minimum total time (with shortest bulk)
  const minTotalTime = starterPrepTime + mixingTime + minBulkTime + shapingTime + proofTime + bakingTime + coolingTime;

  // Check feasibility - for overnight schedules, check against targetFridgeTime
  let feasible: boolean;
  let availableTimeForBulk: number;

  if (targetFridgeTime && input.avoidNightHours && input.includeColdRetard) {
    // For overnight schedules: we need enough time before putting bulk dough in fridge
    // For buns/rolls (shapeInMorning=true): dough goes in fridge as BULK, not shaped
    // Minimum time needed = starter prep + mixing + minimum bulk
    const hoursBeforeFridge = (targetFridgeTime.getTime() - Date.now()) / (1000 * 60 * 60);
    const minTimeBeforeFridge = starterPrepTime + mixingTime + minBulkTime;
    feasible = hoursBeforeFridge >= minTimeBeforeFridge;
    availableTimeForBulk = hoursBeforeFridge - starterPrepTime - mixingTime;

    if (!feasible) {
      warnings.push(
        `Not enough time before fridge at ${formatTime(targetFridgeTime)}. Need ${Math.ceil(minTimeBeforeFridge)} hours, have ${Math.round(hoursBeforeFridge)} hours.`
      );
    }
  } else {
    // Standard feasibility check
    feasible = hoursAvailable >= minTotalTime;
    availableTimeForBulk = hoursAvailable - starterPrepTime - mixingTime - shapingTime - proofTime - bakingTime - coolingTime;

    if (!feasible) {
      warnings.push(
        `Not enough time. Need at least ${Math.ceil(minTotalTime)} hours, but only ${Math.round(hoursAvailable)} hours available.`
      );
    }
  }

  // Determine optimal inoculation percentage
  // For overnight: bulk should fit in the afternoon/evening before fridge
  // Target: start around 15:00-16:00, dough into fridge at 21:00, so ~5-6 hours for bulk
  let targetBulkTime: number;
  if (targetFridgeTime && input.avoidNightHours && input.includeColdRetard) {
    // Use available time but cap at reasonable evening bulk (5-6 hours max)
    const maxBulkForEvening = 6;
    targetBulkTime = Math.min(availableTimeForBulk, maxBulkForEvening);
  } else {
    targetBulkTime = availableTimeForBulk;
  }
  targetBulkTime = Math.max(minBulkTime, Math.min(maxBulkTime, targetBulkTime));

  // Find inoculation that gives us the target bulk time
  let bestInoculation = 20; // Default
  let bestDiff = Infinity;

  for (let inoc = 5; inoc <= 30; inoc++) {
    const bulkTime = calculateBulkTime(
      inoc,
      input.ambientTemperature,
      input.flourType,
      input.wholeGrainPercentage,
      input.starterStrength
    );
    const diff = Math.abs(bulkTime - targetBulkTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestInoculation = inoc;
    }
  }

  const actualBulkTime = calculateBulkTime(
    bestInoculation,
    input.ambientTemperature,
    input.flourType,
    input.wholeGrainPercentage,
    input.starterStrength
  );

  // Calculate actual total time
  const actualTotalTime = starterPrepTime + mixingTime + actualBulkTime + shapingTime + proofTime + bakingTime + coolingTime;

  // Determine starter ratio
  const recommendedStarterRatio = getStarterRatioForPeakTime(starterPrepTime);

  // Build the schedule working backwards from ready time
  let currentTime = new Date(input.desiredReadyTime);

  // Cooling
  currentTime = new Date(currentTime.getTime() - coolingTime * 60 * 60 * 1000);
  schedule.unshift(
    createStep(
      'Cool',
      currentTime,
      STEP_DURATIONS.cool,
      'Let cool completely before cutting. The crumb is still setting!',
      "Patience pays off - cutting too early releases steam and affects texture.",
      undefined,
      'Take a photo of your finished bake!'
    )
  );

  // Bake steps - different for bread vs rolls
  const isRolls = input.bakeType === 'rolls' || shapeInMorning;

  if (isRolls) {
    // Rolls: single bake step, no Dutch oven needed
    currentTime = new Date(currentTime.getTime() - ((STEP_DURATIONS.bakeCovered + STEP_DURATIONS.bakeUncovered) / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Bake Rolls',
        currentTime,
        STEP_DURATIONS.bakeCovered + STEP_DURATIONS.bakeUncovered,
        'Bake until golden brown and internal temp reaches 190°F (88°C).',
        'Rotate tray halfway through for even browning.',
        15,
        'Photo of your golden rolls!'
      )
    );

    // Preheat oven for rolls (lower temp, no Dutch oven)
    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.preheatOven / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Preheat Oven',
        currentTime,
        STEP_DURATIONS.preheatOven,
        'Preheat oven to 400°F (200°C). Place baking stone or sheet inside.',
        'Steam is optional for rolls - it creates a crustier finish.',
        15
      )
    );
  } else {
    // Bread: covered then uncovered in Dutch oven
    // Bake uncovered
    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.bakeUncovered / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Bake (Uncovered)',
        currentTime,
        STEP_DURATIONS.bakeUncovered,
        'Remove lid and continue baking until deep golden brown.',
        'Internal temperature should reach 205-210°F (96-99°C).'
      )
    );

    // Bake covered
    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.bakeCovered / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Score & Bake (Covered)',
        currentTime,
        STEP_DURATIONS.bakeCovered,
        'Score the dough with a sharp blade and bake covered in Dutch oven.',
        'Score with confidence - a swift, angled cut creates the best ear.',
        15,
        'Capture your scoring pattern!'
      )
    );

    // Preheat oven for bread
    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.preheatOven / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Preheat Oven',
        currentTime,
        STEP_DURATIONS.preheatOven,
        'Preheat oven to 500°F (260°C) with Dutch oven inside.',
        'A fully preheated Dutch oven is crucial for oven spring.',
        15
      )
    );
  }

  // For morning shaping workflow (buns/rolls): add shaping steps BEFORE baking
  // Pull from fridge → Shape cold dough → Bake (while oven preheats)
  if (shapeInMorning && input.includeColdRetard && input.avoidNightHours) {
    // Shape cold dough in the morning - this happens during oven preheat
    // Working backwards from preheat time
    const shapeTime = new Date(currentTime.getTime() + 15 * 60 * 1000); // 15 min into preheat

    schedule.unshift(
      createStep(
        'Shape (Cold Dough)',
        shapeTime,
        STEP_DURATIONS.finalShape,
        'Divide and shape the cold dough. Cold dough is easier to handle!',
        'Work quickly - cold dough holds its shape better. Rolls can go straight to baking sheet.',
        undefined,
        'Photo of shaped rolls'
      )
    );

    schedule.unshift(
      createStep(
        'Pull from Fridge',
        new Date(currentTime.getTime()),
        5,
        'Remove dough from refrigerator. Start preheating oven immediately.',
        'Cold dough bakes beautifully - no need to warm up for rolls.'
      )
    );
  }

  // Proof / Cold retard
  if (input.includeColdRetard) {
    const coldProofHours = Math.round(proofTime);

    // Check if this is an overnight schedule
    const isOvernight = input.avoidNightHours && coldProofStartTime;

    // For overnight schedules, cold proof starts at pre-calculated time
    // For regular schedules, work backwards from preheat time
    if (isOvernight && coldProofStartTime) {
      currentTime = new Date(coldProofStartTime);
    } else {
      currentTime = new Date(currentTime.getTime() - coldProofHours * 60 * 60 * 1000);
    }

    // Different descriptions for morning shaping vs evening shaping
    const stepName = shapeInMorning
      ? 'Cold Bulk (Overnight)'
      : isOvernight
      ? 'Cold Proof (Overnight)'
      : 'Cold Proof';

    const description = shapeInMorning
      ? `Place BULK dough in refrigerator. Sleep well! (~${coldProofHours} hours). Shape in the morning.`
      : isOvernight
      ? `Place shaped dough in refrigerator. Sleep well! (~${coldProofHours} hours)`
      : `Place shaped dough in refrigerator for ${coldProofHours} hours.`;

    const tips = shapeInMorning
      ? 'Cold bulk develops flavor. Shape cold dough in the morning - it\'s easier to handle!'
      : isOvernight
      ? 'Cold retard develops flavor and makes scoring easier. Bake straight from fridge in the morning.'
      : 'Cold retard develops flavor and makes scoring easier. Can extend up to 48 hours.';

    const photoPrompt = shapeInMorning ? 'Photo of bulk dough before fridge' : 'Photo of shaped dough before fridge';

    schedule.unshift(
      createStep(
        stepName,
        currentTime,
        coldProofHours * 60,
        description,
        tips,
        undefined,
        photoPrompt
      )
    );
  } else {
    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.proofWarm / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Final Proof',
        currentTime,
        STEP_DURATIONS.proofWarm,
        'Let dough proof at room temperature until it passes the poke test.',
        'When you poke it, the indentation should slowly spring back but not fully.',
        15
      )
    );
  }

  // Shaping steps - different workflows:
  // 1. Morning shaping (buns/rolls): Skip evening shaping, dough goes to fridge as bulk
  // 2. Evening shaping (bread): Pre-Shape → Bench Rest → Final Shape → Cold Proof
  if (shapeInMorning && input.includeColdRetard && input.avoidNightHours) {
    // Morning shaping workflow: No evening shaping steps needed
    // Bulk dough goes directly to fridge at targetFridgeTime
    // Shaping happens in the morning (already added above near preheat)
    currentTime = new Date(targetFridgeTime!);
  } else if (targetFridgeTime && input.avoidNightHours && input.includeColdRetard) {
    // Evening shaping workflow for bread
    // Pre-shape starts ~30 min before fridge time
    const preshapeTime = new Date(targetFridgeTime.getTime() - 30 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Pre-Shape',
        preshapeTime,
        STEP_DURATIONS.preshape,
        'Gently shape the dough into a round, building light tension.',
        'Use minimal flour - a slightly tacky surface helps build tension.'
      )
    );

    // Bench rest after pre-shape
    const benchRestTime = new Date(preshapeTime.getTime() + STEP_DURATIONS.preshape * 60 * 1000);
    schedule.unshift(
      createStep(
        'Bench Rest',
        benchRestTime,
        STEP_DURATIONS.benchRest,
        'Let pre-shaped dough rest, covered, on the counter.',
        'This relaxes the gluten for easier final shaping.'
      )
    );

    // Final shape after bench rest
    const finalShapeTime = new Date(benchRestTime.getTime() + STEP_DURATIONS.benchRest * 60 * 1000);
    schedule.unshift(
      createStep(
        'Final Shape',
        finalShapeTime,
        STEP_DURATIONS.finalShape,
        'Shape the dough into final form and place in proofing basket.',
        'Create tension on the surface for good oven spring.',
        undefined,
        'Photo of your shaped dough'
      )
    );

    // Set currentTime to before Pre-Shape for the bulk fermentation calculation
    currentTime = new Date(preshapeTime);
  } else {
    // Regular backwards calculation
    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.finalShape / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Final Shape',
        currentTime,
        STEP_DURATIONS.finalShape,
        'Shape the dough into final form and place in proofing basket.',
        'Create tension on the surface for good oven spring.',
        undefined,
        'Photo of your shaped dough'
      )
    );

    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.benchRest / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Bench Rest',
        currentTime,
        STEP_DURATIONS.benchRest,
        'Let pre-shaped dough rest, covered, on the counter.',
        'This relaxes the gluten for easier final shaping.'
      )
    );

    currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.preshape / 60) * 60 * 60 * 1000);
    schedule.unshift(
      createStep(
        'Pre-Shape',
        currentTime,
        STEP_DURATIONS.preshape,
        'Gently shape the dough into a round, building light tension.',
        'Use minimal flour - a slightly tacky surface helps build tension.'
      )
    );
  }

  // Bulk fermentation with folds
  const bulkMinutes = actualBulkTime * 60;
  currentTime = new Date(currentTime.getTime() - bulkMinutes * 60 * 1000);
  const bulkStartTime = new Date(currentTime);

  // For cold-proofed recipes, use shorter fold intervals (20 min)
  // For same-day bakes, use standard intervals (30 min)
  const foldInterval = input.includeColdRetard ? 20 : 30;

  schedule.unshift(
    createStep(
      'Bulk Fermentation',
      currentTime,
      bulkMinutes,
      `Let dough ferment at ${input.ambientTemperature}°C. Perform 4 sets of stretch & folds, every ${foldInterval} minutes.`,
      input.includeColdRetard
        ? 'Dough should increase by 20-40% before going in the fridge.'
        : 'Dough should increase by 50-75% and show good bubbles on sides.',
      undefined,
      'Photo at start and after last fold'
    )
  );

  // Add fold reminders during bulk
  for (let i = 1; i <= 4; i++) {
    const foldTime = new Date(bulkStartTime.getTime() + (i * foldInterval) * 60 * 1000);
    if (foldTime < new Date(bulkStartTime.getTime() + bulkMinutes * 60 * 1000)) {
      schedule.splice(
        schedule.findIndex((s) => s.step === 'Pre-Shape'),
        0,
        createStep(
          `Fold ${i}`,
          foldTime,
          STEP_DURATIONS.fold,
          `Perform set ${i} of stretch and folds.`,
          i === 1
            ? 'Wet hands, stretch one side up and over, rotate 90°, repeat 4x.'
            : undefined,
          5
        )
      );
    }
  }

  // Mix final dough
  currentTime = new Date(currentTime.getTime() - (STEP_DURATIONS.mixDough / 60) * 60 * 60 * 1000);
  schedule.unshift(
    createStep(
      'Mix Final Dough',
      currentTime,
      STEP_DURATIONS.mixDough,
      'Add levain and salt to autolysed dough. Mix until incorporated.',
      'Use slap and fold or Rubaud mixing to develop gluten.'
    )
  );

  // Autolyse (if enabled)
  if (input.includeAutolyse) {
    currentTime = new Date(currentTime.getTime() - STEP_DURATIONS.autolyse * 60 * 1000);
    schedule.unshift(
      createStep(
        'Autolyse',
        currentTime,
        STEP_DURATIONS.autolyse,
        'Mix flour and water (no salt, no levain). Let rest covered.',
        'This hydrates the flour and begins gluten development passively.'
      )
    );
  }

  // Feed starter
  currentTime = new Date(currentTime.getTime() - starterPrepTime * 60 * 60 * 1000);
  schedule.unshift(
    createStep(
      'Feed Starter',
      currentTime,
      STEP_DURATIONS.feedStarter,
      `Feed your starter at ${recommendedStarterRatio} ratio. It will be ready in ~${starterPrepTime} hours.`,
      'Use room temperature water for predictable timing.',
      undefined,
      'Photo of fed starter'
    )
  );

  // Add warnings based on conditions
  if (input.ambientTemperature > 28) {
    warnings.push(
      'High temperature! Fermentation will be fast. Watch closely for over-proofing.'
    );
  }
  if (input.ambientTemperature < 18) {
    warnings.push(
      'Cool temperature. Fermentation will be slow. Consider using a warmer spot.'
    );
  }
  if (input.starterStrength === 'weak' || input.starterStrength === 'developing') {
    warnings.push('Starter may need extra time. Use the float test to confirm readiness.');
  }

  // Check for night hour conflicts if avoidNightHours is enabled
  if (input.avoidNightHours) {
    const nightStart = input.nightStartHour ?? 23;
    const nightEnd = input.nightEndHour ?? 7;

    // Find active tasks that fall during night hours
    // Exclude: Cold Proof (passive overnight), Cool (passive), Preheat Oven (expected right after waking)
    const activeSteps = schedule.filter(
      (step) => !step.step.includes('Cold Proof') &&
                !step.step.includes('Cool') &&
                !step.step.includes('Preheat Oven')
    );

    const nightTasks = activeSteps.filter((step) => isNightHour(step.time, nightStart, nightEnd));

    if (nightTasks.length > 0) {
      const nightTaskNames = nightTasks.map((t) => t.step).slice(0, 3).join(', ');
      if (input.includeColdRetard) {
        warnings.push(
          `Some tasks fall during sleep hours (${nightTaskNames}). Adjust cold retard duration or target time.`
        );
      } else {
        warnings.push(
          `Tasks scheduled during night: ${nightTaskNames}. Enable cold retard to shift overnight work to the fridge.`
        );
      }
    }
  }

  // Generate alternatives
  const alternatives: AlternativeSchedule[] = [];

  // Higher inoculation (faster) alternative
  if (bestInoculation < 30) {
    const altInoculation = Math.min(30, bestInoculation + 10);
    const altBulkTime = calculateBulkTime(
      altInoculation,
      input.ambientTemperature,
      input.flourType,
      input.wholeGrainPercentage,
      input.starterStrength
    );
    const altTotalTime = starterPrepTime + mixingTime + altBulkTime + shapingTime + proofTime + bakingTime + coolingTime;
    alternatives.push({
      description: 'Faster option with higher starter percentage',
      inoculation: altInoculation,
      totalHours: altTotalTime,
      startTime: new Date(input.desiredReadyTime.getTime() - altTotalTime * 60 * 60 * 1000),
    });
  }

  // Lower inoculation (slower, more flavor) alternative
  if (bestInoculation > 5) {
    const altInoculation = Math.max(5, bestInoculation - 10);
    const altBulkTime = calculateBulkTime(
      altInoculation,
      input.ambientTemperature,
      input.flourType,
      input.wholeGrainPercentage,
      input.starterStrength
    );
    const altTotalTime = starterPrepTime + mixingTime + altBulkTime + shapingTime + proofTime + bakingTime + coolingTime;
    alternatives.push({
      description: 'Slower option for more flavor development',
      inoculation: altInoculation,
      totalHours: altTotalTime,
      startTime: new Date(input.desiredReadyTime.getTime() - altTotalTime * 60 * 60 * 1000),
    });
  }

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (warnings.length > 0) confidence = 'medium';
  if (warnings.length > 2 || !feasible) confidence = 'low';

  // Sort schedule chronologically
  schedule.sort((a, b) => a.time.getTime() - b.time.getTime());

  return {
    feasible,
    recommendedInoculation: bestInoculation,
    recommendedStarterRatio,
    schedule,
    totalHours: actualTotalTime,
    warnings,
    alternatives,
    confidence,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format duration as human-readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Format time as string (24-hour or 12-hour based on format parameter)
 */
export function formatTime(date: Date, format: '12h' | '24h' = '24h'): string {
  if (format === '12h') {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format date as short string
 */
export function formatDate(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get starter readiness description based on hours since fed
 */
export function getStarterReadiness(hoursSinceFed: number, peakTime: number): string {
  const ratio = hoursSinceFed / peakTime;

  if (ratio < 0.5) return 'Rising';
  if (ratio < 0.8) return 'Almost ready';
  if (ratio < 1.2) return 'At peak - ready!';
  if (ratio < 1.5) return 'Just past peak';
  return 'Needs feeding';
}
