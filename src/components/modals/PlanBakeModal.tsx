import { useState, useEffect, useMemo } from 'react';
import { ChefHat, Clock, Droplets, Moon, Play, Snowflake, Sun, Wheat, Zap } from 'lucide-react';
import { Button, BottomSheet, Slider } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  createStepNotifications,
  scheduleTimelineNotifications,
  showPersistentBakeNotification,
} from '../../lib/notifications';
import {
  isNightHour,
  getNextAwakeTime,
  formatTime,
  formatDate,
} from '../../lib/fermentation';
import type { Recipe, ActiveTimeline, TimelineStep } from '../../types';

interface PlanBakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: Recipe | null;
}

type PlanMode = 'end-time' | 'bake-now';

interface ScaledIngredients {
  flour: number;
  water: number;
  starter: number;
  salt: number;
  flourBreakdown: { type: string; grams: number }[];
  additions: { name: string; grams: number; addAt?: string }[];
}

// Step durations in minutes
const STEP_DURATIONS = {
  feedStarter: 5,
  autolyse: 30,
  mixDough: 10,
  addStarterSalt: 5,
  fold: 2,
  bulkRest: 30,
  preshape: 5,
  benchRest: 15,
  finalShape: 10,
  coldProof: 480, // 8 hours default
  warmProof: 60,
  preheatOven: 45,
  bake: 25,
  cool: 45,
};

export function PlanBakeModal({ isOpen, onClose, recipe }: PlanBakeModalProps) {
  const { showToast, setActiveTab } = useAppStore();
  const { settings } = useSettingsStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Planning mode
  const [planMode, setPlanMode] = useState<PlanMode>('end-time');

  // Planning inputs - default to tomorrow morning 9:00
  const [readyTime, setReadyTime] = useState('09:00');
  const [readyDate, setReadyDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [avoidNightHours, setAvoidNightHours] = useState(true);
  const [useOvernightProof, setUseOvernightProof] = useState(true);

  // Reset form when recipe changes
  useEffect(() => {
    if (recipe) {
      setScaleFactor(1);
      setPlanMode('end-time');
      // Default overnight based on recipe (check if recipe has cold proof in method)
      const methodText = recipe.method.map((m) => m.step + ' ' + m.description).join(' ').toLowerCase();
      const hasColdProof = methodText.includes('cold') || methodText.includes('refrigerat') || methodText.includes('overnight') || methodText.includes('fridge');
      setUseOvernightProof(hasColdProof);
    }
  }, [recipe?.uuid]);

  // Calculate scaled ingredients
  const scaledIngredients = useMemo((): ScaledIngredients | null => {
    if (!recipe) return null;

    const flour = Math.round(recipe.totalFlour * scaleFactor);
    const water = Math.round(recipe.totalFlour * (recipe.hydration / 100) * scaleFactor);
    const starter = Math.round(recipe.totalFlour * (recipe.starterPercent / 100) * scaleFactor);
    const salt = Math.round(recipe.totalFlour * (recipe.saltPercent / 100) * scaleFactor);

    const flourBreakdown = recipe.flourBreakdown.map((f) => ({
      type: f.type,
      grams: Math.round(flour * (f.percent / 100)),
    }));

    const additions = recipe.additions.map((a) => ({
      name: a.name,
      grams: a.percent > 0 ? Math.round(flour * (a.percent / 100)) : 0,
      addAt: a.addAt,
    }));

    return { flour, water, starter, salt, flourBreakdown, additions };
  }, [recipe, scaleFactor]);

  // Helper to create a step
  const createStep = (
    name: string,
    time: Date,
    duration: number,
    description: string,
    notes?: string,
    photoPrompt?: string
  ): TimelineStep => ({
    id: crypto.randomUUID(),
    name,
    description,
    scheduledTime: new Date(time),
    duration,
    status: 'pending',
    notes,
    photoPrompt,
  });

  // Helper to format ingredient list
  const formatIngredients = (scaled: ScaledIngredients, includeStarterSalt: boolean): string => {
    const flourList = scaled.flourBreakdown.map((f) => `• ${f.type}: ${f.grams}g`).join('\n');
    let result = `${flourList}\n• Water: ${scaled.water}g`;
    if (includeStarterSalt) {
      result += `\n• Starter: ${scaled.starter}g\n• Salt: ${scaled.salt}g`;
    }
    // Add mixing additions
    const mixAdditions = scaled.additions.filter(
      (a) => a.grams > 0 && (!a.addAt || a.addAt.toLowerCase().includes('mix'))
    );
    mixAdditions.forEach((a) => {
      result += `\n• ${a.name}: ${a.grams}g`;
    });
    return result;
  };

  // Generate detailed fragmented steps (like Calculator does)
  const generateDetailedSteps = (
    recipe: Recipe,
    startTime: Date,
    scaled: ScaledIngredients,
    respectNightHours: boolean,
    overnightProof: boolean
  ): TimelineStep[] => {
    const steps: TimelineStep[] = [];
    let currentTime = new Date(startTime);

    // Helper to advance time and respect night hours
    const advanceTime = (minutes: number, canBeOvernight = false): Date => {
      currentTime = new Date(currentTime.getTime() + minutes * 60 * 1000);
      if (respectNightHours && !canBeOvernight && isNightHour(currentTime)) {
        currentTime = getNextAwakeTime(currentTime);
      }
      return new Date(currentTime);
    };

    // Check if this is a short/test recipe (total time < 30 minutes)
    // If so, use the recipe's method steps directly instead of generating standard bake steps
    const totalRecipeTime = recipe.method.reduce((sum, step) => sum + step.duration + step.waitTime, 0);
    if (totalRecipeTime <= 30 && recipe.method.length > 0) {
      // Use recipe method steps directly for short/test recipes
      for (const methodStep of recipe.method) {
        steps.push(createStep(
          methodStep.step,
          new Date(currentTime),
          methodStep.duration,
          methodStep.description,
          methodStep.tips
        ));
        advanceTime(methodStep.duration + methodStep.waitTime);
      }
      return steps;
    }

    // Analyze recipe to determine workflow
    const methodText = recipe.method.map((m) => m.step + ' ' + m.description).join(' ').toLowerCase();
    const hasAutolyse = methodText.includes('autolyse') || methodText.includes('rest') && methodText.includes('flour');
    const hasColdProof = overnightProof; // Use user's preference instead of auto-detecting
    const isBunsOrRolls = recipe.category === 'buns' || methodText.includes('roll') || methodText.includes('bun');

    // Determine number of folds from recipe
    let numFolds = 4; // Default
    const foldMatch = methodText.match(/(\d+)\s*(?:sets?\s*of\s*)?(?:stretch|fold)/);
    if (foldMatch) {
      numFolds = parseInt(foldMatch[1], 10);
    }

    // Determine fold interval based on recipe type
    // Cold-proofed recipes (Cathrine Brandt style): 20 minutes between folds
    // Same-day bakes: 30 minutes between folds
    let foldInterval = hasColdProof ? 20 : 30;

    // Only override if recipe explicitly says "fold every hour" or "hourly folds"
    if (methodText.includes('fold every hour') || methodText.includes('hourly fold')) {
      foldInterval = 60;
    } else if (methodText.includes('30-45') || methodText.includes('every 30-45')) {
      foldInterval = 45;
    }

    // Calculate bulk fermentation time from recipe method steps
    // Look for steps mentioning bulk fermentation and use their timing
    let bulkTime = 240; // Default: 4 hours for same-day bakes
    for (const step of recipe.method) {
      const stepLower = (step.step + ' ' + step.description).toLowerCase();
      if (stepLower.includes('bulk') || stepLower.includes('ferment')) {
        const extractedTime = step.duration + step.waitTime;
        if (extractedTime > 0) {
          bulkTime = extractedTime;
        }
        break;
      }
    }

    // For cold-proofed recipes without explicit bulk time, use a shorter default
    // since the cold proof continues the fermentation
    if (hasColdProof && bulkTime === 240) {
      bulkTime = 180; // 3 hours default for cold-proof if not specified
    }

    // Calculate cold proof time
    let coldProofTime = STEP_DURATIONS.coldProof;
    for (const step of recipe.method) {
      const stepLower = (step.step + ' ' + step.description).toLowerCase();
      if (stepLower.includes('cold') || stepLower.includes('overnight') || stepLower.includes('refrigerat')) {
        coldProofTime = step.waitTime || STEP_DURATIONS.coldProof;
        break;
      }
    }

    // Get baking details from recipe
    let bakeTemp = '230°C';
    let bakeTime = 20;
    for (const step of recipe.method) {
      const stepLower = (step.step + ' ' + step.description).toLowerCase();
      if (stepLower.includes('bake')) {
        const tempMatch = step.description.match(/(\d+)\s*°?\s*C/i);
        if (tempMatch) bakeTemp = `${tempMatch[1]}°C`;
        const timeMatch = step.description.match(/(\d+)[-–]?(\d+)?\s*min/i);
        if (timeMatch) bakeTime = parseInt(timeMatch[2] || timeMatch[1], 10);
        break;
      }
    }

    // Get toppings
    const toppings = scaled.additions.filter(
      (a) => a.addAt?.toLowerCase().includes('before baking') || a.addAt?.toLowerCase().includes('topping')
    );
    const toppingsText = toppings.length > 0
      ? '\n\n🎨 Toppings:\n' + toppings.map((t) => `• ${t.name}${t.grams > 0 ? `: ${t.grams}g` : ''}`).join('\n')
      : '';

    // === BUILD STEPS ===

    // 1. Feed Starter (if starting from scratch)
    steps.push(createStep(
      'Feed Starter',
      new Date(currentTime),
      STEP_DURATIONS.feedStarter,
      `Feed your starter at 1:1:1 ratio so it's ready in ~3-4 hours.\n\nYou'll need ${scaled.starter}g active starter for this recipe.`,
      'Use room temperature water for predictable timing.',
      'Photo of fed starter'
    ));
    advanceTime(180); // 3 hours for starter to peak

    // 2. Autolyse (if recipe uses it)
    if (hasAutolyse) {
      steps.push(createStep(
        'Autolyse',
        new Date(currentTime),
        STEP_DURATIONS.autolyse,
        `Mix flour and water only (no starter, no salt). Let rest.\n\n📋 Ingredients:\n${formatIngredients(scaled, false)}`,
        'This hydrates the flour and begins gluten development passively.'
      ));
      advanceTime(STEP_DURATIONS.autolyse);

      // 3. Add Starter & Salt
      steps.push(createStep(
        'Add Starter & Salt',
        new Date(currentTime),
        STEP_DURATIONS.addStarterSalt,
        `Add active starter and salt to the autolysed dough. Mix until fully incorporated.\n\n📋 Add:\n• Starter: ${scaled.starter}g\n• Salt: ${scaled.salt}g`,
        'Use pinching and folding to incorporate. Dough will feel shaggy at first.'
      ));
      advanceTime(STEP_DURATIONS.addStarterSalt);
    } else {
      // Mix everything at once
      steps.push(createStep(
        'Mix Dough',
        new Date(currentTime),
        STEP_DURATIONS.mixDough,
        `Mix all ingredients until no dry flour remains.\n\n📋 Ingredients:\n${formatIngredients(scaled, true)}`,
        'The dough will be sticky - that\'s normal!'
      ));
      advanceTime(STEP_DURATIONS.mixDough);

      // Short rest after mixing
      steps.push(createStep(
        'Rest',
        new Date(currentTime),
        20,
        'Let dough rest covered for 20 minutes.',
        'This allows the flour to hydrate and gluten to relax.'
      ));
      advanceTime(20);
    }

    // 4. Bulk Fermentation with individual folds
    // Calculate time for folds phase: first fold happens after foldInterval, subsequent folds spaced by foldInterval
    const foldPhaseTime = foldInterval * numFolds; // Time from start to last fold
    const remainingBulkAfterFolds = Math.max(bulkTime - foldPhaseTime, 30); // Rest after last fold

    const totalBulkHours = Math.round(bulkTime / 60 * 10) / 10;
    steps.push(createStep(
      'Bulk Fermentation Start',
      new Date(currentTime),
      5,
      `Begin bulk fermentation at room temperature (~${totalBulkHours} hours total). You'll do ${numFolds} stretch & folds, spaced ${foldInterval} minutes apart.`,
      hasColdProof
        ? 'Dough should increase by 20-40% before going in the fridge.'
        : 'Dough should increase by 50-75% and show good bubbles.',
      'Photo at start of bulk'
    ));
    advanceTime(foldInterval);

    // Add individual fold steps
    for (let i = 1; i <= numFolds; i++) {
      steps.push(createStep(
        `Stretch & Fold ${i}`,
        new Date(currentTime),
        STEP_DURATIONS.fold,
        `Perform stretch and fold set ${i} of ${numFolds}.\n\nWet your hands, stretch one side of the dough up and over to the center. Rotate bowl 90° and repeat 4 times.`,
        i === 1
          ? 'Be gentle but thorough. The dough will become smoother with each set.'
          : i === numFolds
          ? 'Last fold! Dough should be noticeably smoother and hold its shape better.'
          : undefined
      ));

      if (i < numFolds) {
        advanceTime(foldInterval);
      } else {
        // Rest after last fold before next step
        advanceTime(remainingBulkAfterFolds);
      }
    }

    // Check bulk progress
    steps.push(createStep(
      'Check Bulk Progress',
      new Date(currentTime),
      5,
      hasColdProof
        ? 'Check if dough has risen 20-40% and shows some bubbles. Ready for the fridge!'
        : 'Check if bulk fermentation is complete. Dough should have increased 50-75%, feel airy, and show bubbles on the surface and sides.',
      hasColdProof
        ? 'The cold proof will continue fermentation slowly overnight.'
        : 'If not ready, let it continue for another 30 minutes.',
      'Photo of bulk fermentation progress'
    ));

    // 5. Cold Proof workflow (for overnight recipes)
    if (hasColdProof) {
      if (isBunsOrRolls) {
        // Buns/rolls: put bulk dough in fridge, shape in morning
        steps.push(createStep(
          'Transfer to Fridge',
          new Date(currentTime),
          5,
          `Transfer bulk dough to a covered container and refrigerate overnight (~${Math.round(coldProofTime / 60)} hours).\n\nDo NOT shape yet - you'll shape cold dough in the morning.`,
          'Cold bulk develops flavor. Cold dough is easier to shape!',
          'Photo of dough before fridge'
        ));
        advanceTime(coldProofTime, true); // Overnight is OK

        // Push to morning if we're still in night hours
        if (respectNightHours && isNightHour(currentTime)) {
          currentTime = getNextAwakeTime(currentTime);
        }

        // Morning: pull from fridge
        steps.push(createStep(
          'Pull from Fridge',
          new Date(currentTime),
          5,
          'Remove cold dough from refrigerator. Start preheating oven.',
          'Cold dough handles beautifully - work quickly to maintain the chill.'
        ));
        advanceTime(5);

        // Preheat (while shaping)
        steps.push(createStep(
          'Preheat Oven',
          new Date(currentTime),
          STEP_DURATIONS.preheatOven,
          `Preheat oven to ${bakeTemp}. Place baking sheet or stone inside.`,
          'A fully preheated oven is crucial for good rise.'
        ));

        // Shape during preheat
        const shapeTime = new Date(currentTime.getTime() + 10 * 60 * 1000);
        steps.push(createStep(
          'Divide & Shape',
          shapeTime,
          15,
          `Divide cold dough into portions. Shape into rounds or desired form.${toppingsText}`,
          'Work on a lightly floured surface. Cold dough holds its shape well.',
          'Photo of shaped rolls'
        ));
        advanceTime(STEP_DURATIONS.preheatOven);

      } else {
        // Bread loaf: pre-shape, final shape, then cold proof shaped
        steps.push(createStep(
          'Pre-Shape',
          new Date(currentTime),
          STEP_DURATIONS.preshape,
          'Gently turn dough onto work surface. Shape into a rough round, building light tension.',
          'Use minimal flour - a slightly tacky surface helps build tension.'
        ));
        advanceTime(STEP_DURATIONS.preshape);

        steps.push(createStep(
          'Bench Rest',
          new Date(currentTime),
          STEP_DURATIONS.benchRest,
          'Cover the pre-shaped dough and let it rest on the counter.',
          'This relaxes the gluten for easier final shaping.'
        ));
        advanceTime(STEP_DURATIONS.benchRest);

        steps.push(createStep(
          'Final Shape',
          new Date(currentTime),
          STEP_DURATIONS.finalShape,
          'Shape the dough into final form (batard, boule, etc.). Place seam-side up in floured proofing basket.',
          'Create good surface tension for oven spring.',
          'Photo of shaped dough'
        ));
        advanceTime(STEP_DURATIONS.finalShape);

        steps.push(createStep(
          'Cold Proof (Overnight)',
          new Date(currentTime),
          coldProofTime,
          `Cover and refrigerate shaped dough overnight (~${Math.round(coldProofTime / 60)} hours).\n\nSleep well! The cold develops flavor and makes scoring easier.`,
          'Can extend up to 48 hours for more sour flavor.',
          'Photo of dough before fridge'
        ));
        advanceTime(coldProofTime, true);

        // Push to morning if we're still in night hours
        if (respectNightHours && isNightHour(currentTime)) {
          currentTime = getNextAwakeTime(currentTime);
        }

        steps.push(createStep(
          'Preheat Oven',
          new Date(currentTime),
          STEP_DURATIONS.preheatOven,
          `Preheat oven to ${bakeTemp} with Dutch oven inside.`,
          'A fully preheated Dutch oven is crucial for oven spring.'
        ));
        advanceTime(STEP_DURATIONS.preheatOven);
      }
    } else {
      // Warm proof workflow
      steps.push(createStep(
        'Pre-Shape',
        new Date(currentTime),
        STEP_DURATIONS.preshape,
        'Gently turn dough onto work surface. Shape into a rough round.',
        'Use minimal flour - a slightly tacky surface helps build tension.'
      ));
      advanceTime(STEP_DURATIONS.preshape);

      steps.push(createStep(
        'Bench Rest',
        new Date(currentTime),
        STEP_DURATIONS.benchRest,
        'Cover and let the dough rest.',
        'This relaxes the gluten for easier final shaping.'
      ));
      advanceTime(STEP_DURATIONS.benchRest);

      steps.push(createStep(
        'Final Shape',
        new Date(currentTime),
        STEP_DURATIONS.finalShape,
        `Shape into final form.${toppingsText}`,
        'Create good surface tension.',
        'Photo of shaped dough'
      ));
      advanceTime(STEP_DURATIONS.finalShape);

      steps.push(createStep(
        'Final Proof',
        new Date(currentTime),
        STEP_DURATIONS.warmProof,
        'Proof at room temperature until the poke test passes.',
        'When poked, dough should slowly spring back but not fully.'
      ));
      advanceTime(STEP_DURATIONS.warmProof);

      steps.push(createStep(
        'Preheat Oven',
        new Date(currentTime),
        STEP_DURATIONS.preheatOven,
        `Preheat oven to ${bakeTemp}.`,
        'Start preheating while dough finishes proofing.'
      ));
      advanceTime(STEP_DURATIONS.preheatOven);
    }

    // 6. Score & Bake
    if (isBunsOrRolls) {
      steps.push(createStep(
        'Bake',
        new Date(currentTime),
        bakeTime,
        `Bake at ${bakeTemp} for ${bakeTime} minutes until golden brown.`,
        'Rotate pan halfway through for even browning.',
        'Capture your fresh bake!'
      ));
    } else {
      steps.push(createStep(
        'Score & Bake (Covered)',
        new Date(currentTime),
        20,
        'Score the dough with a sharp blade. Place in preheated Dutch oven, cover with lid.',
        'Score with confidence - a swift, angled cut creates the best ear.',
        'Capture your scoring pattern!'
      ));
      advanceTime(20);

      steps.push(createStep(
        'Bake (Uncovered)',
        new Date(currentTime),
        15,
        'Remove lid and continue baking until deep golden brown.',
        'Internal temperature should reach 96-99°C (205-210°F).'
      ));
      advanceTime(15);
    }
    advanceTime(bakeTime);

    // 7. Cool
    steps.push(createStep(
      'Cool',
      new Date(currentTime),
      STEP_DURATIONS.cool,
      'Let cool completely before cutting. The crumb is still setting inside!',
      'Patience pays off - cutting too early releases steam and affects texture.',
      'Photo of your finished bake!'
    ));

    return steps;
  };

  // Calculate total time from generated steps
  const calculateTotalMinutes = (steps: TimelineStep[]): number => {
    if (steps.length < 2) return 0;
    const first = steps[0].scheduledTime.getTime();
    const last = steps[steps.length - 1].scheduledTime.getTime();
    return Math.round((last - first) / (60 * 1000)) + (steps[steps.length - 1].duration || 0);
  };

  // Calculate schedule working backwards from desired ready time
  const calculateSchedule = (): { startTime: Date; steps: TimelineStep[]; totalMinutes: number } | null => {
    if (!recipe || !scaledIngredients) return null;

    if (planMode === 'bake-now') {
      const startTime = new Date();
      const steps = generateDetailedSteps(recipe, startTime, scaledIngredients, false, useOvernightProof);
      return { startTime, steps, totalMinutes: calculateTotalMinutes(steps) };
    }

    // Parse desired ready time
    const [hours, minutes] = readyTime.split(':').map(Number);
    const desiredReadyTime = new Date(readyDate);
    desiredReadyTime.setHours(hours, minutes, 0, 0);

    // Generate steps starting from a temporary time to calculate duration
    const tempSteps = generateDetailedSteps(recipe, new Date(), scaledIngredients, avoidNightHours, useOvernightProof);
    const totalMins = calculateTotalMinutes(tempSteps);

    // Calculate actual start time by working backwards
    const startTime = new Date(desiredReadyTime.getTime() - totalMins * 60 * 1000);

    // Check if start time is in the past
    if (startTime.getTime() < Date.now()) {
      return null;
    }

    // Generate final steps from calculated start time
    const steps = generateDetailedSteps(recipe, startTime, scaledIngredients, avoidNightHours, useOvernightProof);

    return { startTime, steps, totalMinutes: totalMins };
  };

  const schedule = useMemo(() => calculateSchedule(), [
    recipe,
    scaledIngredients,
    planMode,
    readyTime,
    readyDate,
    avoidNightHours,
    useOvernightProof,
  ]);

  // Check if schedule is feasible
  const isFeasible = useMemo(() => {
    if (planMode === 'bake-now') return true;
    return schedule !== null;
  }, [schedule, planMode]);

  const handleStartBake = async () => {
    if (!recipe || !schedule || !scaledIngredients) return;

    setIsSubmitting(true);
    try {
      const baseNotificationId = Date.now();
      const notifications = createStepNotifications(schedule.steps, baseNotificationId);

      const timeline: ActiveTimeline = {
        uuid: crypto.randomUUID(),
        name: recipe.name,
        recipeId: recipe.uuid,
        startTime: schedule.startTime,
        steps: schedule.steps,
        currentStepIndex: 0,
        status: 'active',
        notifications,
        notificationBaseId: baseNotificationId,
        photos: [],
        notes: `Scaled to ${scaledIngredients.flour}g flour (${scaleFactor}x)`,
      };

      await db.activeTimelines.add(timeline);

      // Show persistent notification for the active bake
      if (settings.notificationsEnabled) {
        await showPersistentBakeNotification(recipe.name);
      }

      if (recipe.id) {
        await db.recipes.update(recipe.id, {
          timesUsed: recipe.timesUsed + 1,
          lastUsed: new Date(),
        });
      }

      if (settings.notificationsEnabled) {
        const notificationResult = await scheduleTimelineNotifications(notifications, baseNotificationId);
        if (notificationResult.permissionDenied) {
          showToast('Bake planned! Enable notifications for reminders.', 'warning');
        } else {
          showToast(`${recipe.name} planned! You'll be notified for each step.`, 'success');
        }
      } else {
        showToast(`${recipe.name} planned!`, 'success');
      }

      handleClose();
      setActiveTab('home');
    } catch (error) {
      console.error('Failed to plan bake:', error);
      showToast('Failed to plan bake', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setReadyTime('09:00');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setReadyDate(tomorrow.toISOString().split('T')[0]);
    setScaleFactor(1);
    setPlanMode('end-time');
    setAvoidNightHours(true);
    onClose();
  };

  if (!recipe || !scaledIngredients) return null;

  const totalHours = schedule ? Math.round(schedule.totalMinutes / 60) : 0;

  const footerContent = (
    <div className="flex gap-3">
      <Button variant="ghost" onClick={handleClose} className="flex-1">
        Cancel
      </Button>
      <Button
        onClick={handleStartBake}
        disabled={isSubmitting || !isFeasible}
        isLoading={isSubmitting}
        leftIcon={<Play className="w-4 h-4" />}
        className="flex-1"
      >
        {planMode === 'bake-now' ? 'Start Now' : 'Plan Bake'}
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Plan Bake" footer={footerContent}>
      <div className="space-y-5">
        {/* Recipe Header */}
        <div className="flex items-center gap-3 p-3 bg-surface2 dark:bg-surfaceDark2 rounded-xl">
          <div className="p-2 bg-crust-100 dark:bg-crust-700 rounded-lg">
            <ChefHat className="w-6 h-6 text-crust-600 dark:text-crumb-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-crust-800 dark:text-crumb-100 truncate">
              {recipe.name}
            </h3>
            <p className="text-xs text-crust-500 dark:text-crumb-500">
              ~{totalHours} hours total • {schedule?.steps.length || 0} steps
            </p>
          </div>
        </div>

        {/* Plan Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setPlanMode('end-time')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
              planMode === 'end-time'
                ? 'bg-crust-600 dark:bg-crust-500 text-white border-transparent'
                : 'bg-white dark:bg-crust-900 text-crust-700 dark:text-crumb-300 border-crumb-300 dark:border-crust-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Schedule</span>
          </button>
          <button
            onClick={() => setPlanMode('bake-now')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
              planMode === 'bake-now'
                ? 'bg-crust-600 dark:bg-crust-500 text-white border-transparent'
                : 'bg-white dark:bg-crust-900 text-crust-700 dark:text-crumb-300 border-crumb-300 dark:border-crust-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">Bake Now</span>
          </button>
        </div>

        {/* Schedule Options */}
        {planMode === 'end-time' && (
          <>
            <div>
              <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
                When do you want bread ready?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={readyDate}
                  onChange={(e) => setReadyDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-crust-900 border border-crumb-300 dark:border-crust-700 rounded-xl text-crust-900 dark:text-crumb-100 focus:outline-none focus:ring-2 focus:ring-crust-500/20"
                />
                <input
                  type="time"
                  value={readyTime}
                  onChange={(e) => setReadyTime(e.target.value)}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-crust-900 border border-crumb-300 dark:border-crust-700 rounded-xl text-crust-900 dark:text-crumb-100 focus:outline-none focus:ring-2 focus:ring-crust-500/20"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl cursor-pointer">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                  Keep nights free
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500">
                  Avoid steps during 23:00 - 07:00
                </p>
              </div>
              <input
                type="checkbox"
                checked={avoidNightHours}
                onChange={(e) => setAvoidNightHours(e.target.checked)}
                className="w-5 h-5 rounded border-crumb-300 text-crust-600 focus:ring-crust-500"
              />
            </label>

            <label className="flex items-center gap-3 p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl cursor-pointer">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                <Snowflake className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                  Overnight proofing
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500">
                  Cold proof in fridge overnight
                </p>
              </div>
              <input
                type="checkbox"
                checked={useOvernightProof}
                onChange={(e) => setUseOvernightProof(e.target.checked)}
                className="w-5 h-5 rounded border-crumb-300 text-crust-600 focus:ring-crust-500"
              />
            </label>

            {schedule && isFeasible && (
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <Sun className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Start: {formatDate(schedule.startTime)} at {formatTime(schedule.startTime, settings.timeFormat)}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Ready: {formatDate(new Date(readyDate))} at {readyTime}
                  </p>
                </div>
              </div>
            )}

            {!isFeasible && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Not enough time! Please choose a later ready time.
                </p>
              </div>
            )}
          </>
        )}

        {planMode === 'bake-now' && (
          <>
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Starting immediately
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Estimated finish: ~{totalHours} hours from now
                </p>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl cursor-pointer">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                <Snowflake className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                  Overnight proofing
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500">
                  Cold proof in fridge overnight
                </p>
              </div>
              <input
                type="checkbox"
                checked={useOvernightProof}
                onChange={(e) => setUseOvernightProof(e.target.checked)}
                className="w-5 h-5 rounded border-crumb-300 text-crust-600 focus:ring-crust-500"
              />
            </label>
          </>
        )}

        {/* Scale Recipe */}
        <div>
          <Slider
            label="Scale Recipe"
            value={scaleFactor}
            onChange={setScaleFactor}
            min={0.5}
            max={3}
            step={0.25}
            unit="x"
            marks={[
              { value: 0.5, label: '½' },
              { value: 1, label: '1x' },
              { value: 2, label: '2x' },
              { value: 3, label: '3x' },
            ]}
          />
        </div>

        {/* Calculated Amounts */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            Ingredients
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Wheat className="w-4 h-4 text-honey-500" />
                <span className="text-xs text-crust-500 dark:text-crumb-500">Flour</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.flour}g
              </span>
            </div>
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Droplets className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-crust-500 dark:text-crumb-500">Water</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.water}g
              </span>
            </div>
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <ChefHat className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-crust-500 dark:text-crumb-500">Starter</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.starter}g
              </span>
            </div>
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs">🧂</span>
                <span className="text-xs text-crust-500 dark:text-crumb-500">Salt</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.salt}g
              </span>
            </div>
          </div>
        </div>

        {/* Flour Breakdown if multiple flours */}
        {scaledIngredients.flourBreakdown.length > 1 && (
          <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
            <label className="block text-xs font-medium text-crust-500 dark:text-crumb-500 mb-2">
              Flour Breakdown
            </label>
            <div className="space-y-1">
              {scaledIngredients.flourBreakdown.map((f, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-crust-600 dark:text-crumb-400">{f.type}</span>
                  <span className="font-medium text-crust-800 dark:text-crumb-200">{f.grams}g</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Steps Preview */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            {schedule?.steps.length || 0} Steps
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {schedule?.steps.map((step, i) => (
              <div
                key={step.id}
                className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-crust-200 dark:bg-crust-700 flex items-center justify-center text-xs font-medium text-crust-600 dark:text-crumb-300 flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                        {step.name}
                      </span>
                      <span className="text-xs text-crust-500 dark:text-crumb-500 flex-shrink-0">
                        {formatTime(step.scheduledTime, settings.timeFormat)}
                      </span>
                    </div>
                    <p className="text-xs text-crust-500 dark:text-crumb-500 mt-1 line-clamp-2">
                      {step.description.split('\n')[0]}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
