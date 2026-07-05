import { useState, useEffect, useMemo } from 'react';
import { ChefHat, Clock, Droplets, Moon, Play, Snowflake, Sun, Wheat, Zap } from 'lucide-react';
import { Button, BottomSheet, Slider } from '../ui';
import { db, getActiveTimelines } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  createStepNotifications,
  scheduleTimelineNotifications,
  showPersistentBakeNotification,
} from '../../lib/notifications';
import { allocateTimelineBaseId } from '../../lib/notificationIds';
import {
  isNightHour,
  getNextAwakeTime,
  formatTime,
  formatDate,
} from '../../lib/fermentation';
import { useTranslation } from '../../lib/i18n/useTranslation';
import { localizeTimelineStep } from '../../lib/i18n/scheduleStep';
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
  const { t, language } = useTranslation();
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
    let result = `${flourList}\n• ${t('planBake.ingredientWater')}: ${scaled.water}g`;
    if (includeStarterSalt) {
      result += `\n• ${t('planBake.ingredientStarter')}: ${scaled.starter}g\n• ${t('planBake.ingredientSalt')}: ${scaled.salt}g`;
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
      ? '\n\n🎨 ' + t('planBake.toppingsLabel') + ':\n' + toppings.map((top) => `• ${top.name}${top.grams > 0 ? `: ${top.grams}g` : ''}`).join('\n')
      : '';

    // === BUILD STEPS ===

    // 1. Feed Starter (if starting from scratch)
    steps.push(createStep(
      t('planBake.stepFeedStarterName'),
      new Date(currentTime),
      STEP_DURATIONS.feedStarter,
      t('planBake.stepFeedStarterDesc', { grams: scaled.starter }),
      t('planBake.stepFeedStarterTip'),
      t('planBake.stepFeedStarterPhoto')
    ));
    advanceTime(180); // 3 hours for starter to peak

    // 2. Autolyse (if recipe uses it)
    if (hasAutolyse) {
      steps.push(createStep(
        t('planBake.stepAutolyseName'),
        new Date(currentTime),
        STEP_DURATIONS.autolyse,
        `${t('planBake.stepAutolyseDesc')}\n\n📋 ${t('planBake.ingredientsLabel')}:\n${formatIngredients(scaled, false)}`,
        t('planBake.stepAutolyseTip')
      ));
      advanceTime(STEP_DURATIONS.autolyse);

      // 3. Add Starter & Salt
      steps.push(createStep(
        t('planBake.stepAddStarterSaltName'),
        new Date(currentTime),
        STEP_DURATIONS.addStarterSalt,
        `${t('planBake.stepAddStarterSaltDesc')}\n\n📋 ${t('planBake.addLabel')}:\n• ${t('planBake.ingredientStarter')}: ${scaled.starter}g\n• ${t('planBake.ingredientSalt')}: ${scaled.salt}g`,
        t('planBake.stepAddStarterSaltTip')
      ));
      advanceTime(STEP_DURATIONS.addStarterSalt);
    } else {
      // Mix everything at once
      steps.push(createStep(
        t('planBake.stepMixDoughName'),
        new Date(currentTime),
        STEP_DURATIONS.mixDough,
        `${t('planBake.stepMixDoughDesc')}\n\n📋 ${t('planBake.ingredientsLabel')}:\n${formatIngredients(scaled, true)}`,
        t('planBake.stepMixDoughTip')
      ));
      advanceTime(STEP_DURATIONS.mixDough);

      // Short rest after mixing
      steps.push(createStep(
        t('planBake.stepRestName'),
        new Date(currentTime),
        20,
        t('planBake.stepRestDesc'),
        t('planBake.stepRestTip')
      ));
      advanceTime(20);
    }

    // 4. Bulk Fermentation with individual folds
    // Calculate time for folds phase: first fold happens after foldInterval, subsequent folds spaced by foldInterval
    const foldPhaseTime = foldInterval * numFolds; // Time from start to last fold
    const remainingBulkAfterFolds = Math.max(bulkTime - foldPhaseTime, 30); // Rest after last fold

    const totalBulkHours = Math.round(bulkTime / 60 * 10) / 10;
    steps.push(createStep(
      t('planBake.stepBulkStartName'),
      new Date(currentTime),
      5,
      t('planBake.stepBulkStartDesc', { hours: totalBulkHours, folds: numFolds, interval: foldInterval }),
      hasColdProof
        ? t('planBake.stepBulkStartTipCold')
        : t('planBake.stepBulkStartTipWarm'),
      t('planBake.stepBulkStartPhoto')
    ));
    advanceTime(foldInterval);

    // Add individual fold steps
    for (let i = 1; i <= numFolds; i++) {
      steps.push(createStep(
        t('planBake.stepFoldName', { index: i }),
        new Date(currentTime),
        STEP_DURATIONS.fold,
        t('planBake.stepFoldDesc', { index: i, total: numFolds }),
        i === 1
          ? t('planBake.stepFoldTipFirst')
          : i === numFolds
          ? t('planBake.stepFoldTipLast')
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
      t('planBake.stepCheckBulkName'),
      new Date(currentTime),
      5,
      hasColdProof
        ? t('planBake.stepCheckBulkDescCold')
        : t('planBake.stepCheckBulkDescWarm'),
      hasColdProof
        ? t('planBake.stepCheckBulkTipCold')
        : t('planBake.stepCheckBulkTipWarm'),
      t('planBake.stepCheckBulkPhoto')
    ));

    // 5. Cold Proof workflow (for overnight recipes)
    if (hasColdProof) {
      if (isBunsOrRolls) {
        // Buns/rolls: put bulk dough in fridge, shape in morning
        steps.push(createStep(
          t('planBake.stepTransferFridgeName'),
          new Date(currentTime),
          5,
          t('planBake.stepTransferFridgeDesc', { hours: Math.round(coldProofTime / 60) }),
          t('planBake.stepTransferFridgeTip'),
          t('planBake.stepDoughBeforeFridgePhoto')
        ));
        advanceTime(coldProofTime, true); // Overnight is OK

        // Push to morning if we're still in night hours
        if (respectNightHours && isNightHour(currentTime)) {
          currentTime = getNextAwakeTime(currentTime);
        }

        // Morning: pull from fridge
        steps.push(createStep(
          t('planBake.stepPullFridgeName'),
          new Date(currentTime),
          5,
          t('planBake.stepPullFridgeDesc'),
          t('planBake.stepPullFridgeTip')
        ));
        advanceTime(5);

        // Preheat (while shaping)
        steps.push(createStep(
          t('planBake.stepPreheatName'),
          new Date(currentTime),
          STEP_DURATIONS.preheatOven,
          t('planBake.stepPreheatRollsDesc', { temp: bakeTemp }),
          t('planBake.stepPreheatTip')
        ));

        // Shape during preheat
        const shapeTime = new Date(currentTime.getTime() + 10 * 60 * 1000);
        steps.push(createStep(
          t('planBake.stepDivideShapeName'),
          shapeTime,
          15,
          `${t('planBake.stepDivideShapeDesc')}${toppingsText}`,
          t('planBake.stepDivideShapeTip'),
          t('planBake.stepShapedRollsPhoto')
        ));
        advanceTime(STEP_DURATIONS.preheatOven);

      } else {
        // Bread loaf: pre-shape, final shape, then cold proof shaped
        steps.push(createStep(
          t('planBake.stepPreShapeName'),
          new Date(currentTime),
          STEP_DURATIONS.preshape,
          t('planBake.stepPreShapeLoafDesc'),
          t('planBake.stepPreShapeTip')
        ));
        advanceTime(STEP_DURATIONS.preshape);

        steps.push(createStep(
          t('planBake.stepBenchRestName'),
          new Date(currentTime),
          STEP_DURATIONS.benchRest,
          t('planBake.stepBenchRestLoafDesc'),
          t('planBake.stepBenchRestTip')
        ));
        advanceTime(STEP_DURATIONS.benchRest);

        steps.push(createStep(
          t('planBake.stepFinalShapeName'),
          new Date(currentTime),
          STEP_DURATIONS.finalShape,
          t('planBake.stepFinalShapeLoafDesc'),
          t('planBake.stepFinalShapeLoafTip'),
          t('planBake.stepShapedDoughPhoto')
        ));
        advanceTime(STEP_DURATIONS.finalShape);

        steps.push(createStep(
          t('planBake.stepColdProofName'),
          new Date(currentTime),
          coldProofTime,
          t('planBake.stepColdProofDesc', { hours: Math.round(coldProofTime / 60) }),
          t('planBake.stepColdProofTip'),
          t('planBake.stepDoughBeforeFridgePhoto')
        ));
        advanceTime(coldProofTime, true);

        // Push to morning if we're still in night hours
        if (respectNightHours && isNightHour(currentTime)) {
          currentTime = getNextAwakeTime(currentTime);
        }

        steps.push(createStep(
          t('planBake.stepPreheatName'),
          new Date(currentTime),
          STEP_DURATIONS.preheatOven,
          t('planBake.stepPreheatDutchDesc', { temp: bakeTemp }),
          t('planBake.stepPreheatDutchTip')
        ));
        advanceTime(STEP_DURATIONS.preheatOven);
      }
    } else {
      // Warm proof workflow
      steps.push(createStep(
        t('planBake.stepPreShapeName'),
        new Date(currentTime),
        STEP_DURATIONS.preshape,
        t('planBake.stepPreShapeWarmDesc'),
        t('planBake.stepPreShapeTip')
      ));
      advanceTime(STEP_DURATIONS.preshape);

      steps.push(createStep(
        t('planBake.stepBenchRestName'),
        new Date(currentTime),
        STEP_DURATIONS.benchRest,
        t('planBake.stepBenchRestWarmDesc'),
        t('planBake.stepBenchRestTip')
      ));
      advanceTime(STEP_DURATIONS.benchRest);

      steps.push(createStep(
        t('planBake.stepFinalShapeName'),
        new Date(currentTime),
        STEP_DURATIONS.finalShape,
        `${t('planBake.stepFinalShapeWarmDesc')}${toppingsText}`,
        t('planBake.stepFinalShapeWarmTip'),
        t('planBake.stepShapedDoughPhoto')
      ));
      advanceTime(STEP_DURATIONS.finalShape);

      steps.push(createStep(
        t('planBake.stepFinalProofName'),
        new Date(currentTime),
        STEP_DURATIONS.warmProof,
        t('planBake.stepFinalProofDesc'),
        t('planBake.stepFinalProofTip')
      ));
      advanceTime(STEP_DURATIONS.warmProof);

      steps.push(createStep(
        t('planBake.stepPreheatName'),
        new Date(currentTime),
        STEP_DURATIONS.preheatOven,
        t('planBake.stepPreheatWarmDesc', { temp: bakeTemp }),
        t('planBake.stepPreheatWarmTip')
      ));
      advanceTime(STEP_DURATIONS.preheatOven);
    }

    // 6. Score & Bake
    if (isBunsOrRolls) {
      steps.push(createStep(
        t('planBake.stepBakeName'),
        new Date(currentTime),
        bakeTime,
        t('planBake.stepBakeRollsDesc', { temp: bakeTemp, minutes: bakeTime }),
        t('planBake.stepBakeRollsTip'),
        t('planBake.stepBakePhoto')
      ));
    } else {
      steps.push(createStep(
        t('planBake.stepScoreBakeName'),
        new Date(currentTime),
        20,
        t('planBake.stepScoreBakeDesc'),
        t('planBake.stepScoreBakeTip'),
        t('planBake.stepScoreBakePhoto')
      ));
      advanceTime(20);

      steps.push(createStep(
        t('planBake.stepBakeUncoveredName'),
        new Date(currentTime),
        15,
        t('planBake.stepBakeUncoveredDesc'),
        t('planBake.stepBakeUncoveredTip')
      ));
      advanceTime(15);
    }
    advanceTime(bakeTime);

    // 7. Cool
    steps.push(createStep(
      t('planBake.stepCoolName'),
      new Date(currentTime),
      STEP_DURATIONS.cool,
      t('planBake.stepCoolDesc'),
      t('planBake.stepCoolTip'),
      t('planBake.stepCoolPhoto')
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
      const baseNotificationId = await allocateTimelineBaseId();
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
        notes: t('planBake.scaledNote', { grams: scaledIngredients.flour, factor: scaleFactor }),
      };

      await db.activeTimelines.add(timeline);

      // Show persistent notification for the active bake (summarizing the count
      // if other bakes are already running).
      if (settings.notificationsEnabled) {
        const activeCount = await getActiveTimelines().then((a) => a.length);
        await showPersistentBakeNotification(recipe.name, activeCount);
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
          showToast(t('planBake.toastPlannedNoNotifications'), 'warning');
        } else {
          showToast(t('planBake.toastPlannedWithNotifications', { name: recipe.name }), 'success');
        }
      } else {
        showToast(t('planBake.toastPlanned', { name: recipe.name }), 'success');
      }

      handleClose();
      setActiveTab('home');
    } catch (error) {
      console.error('Failed to plan bake:', error);
      showToast(t('planBake.toastFailed'), 'error');
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
        {t('common.cancel')}
      </Button>
      <Button
        onClick={handleStartBake}
        disabled={isSubmitting || !isFeasible}
        isLoading={isSubmitting}
        leftIcon={<Play className="w-4 h-4" />}
        className="flex-1"
      >
        {planMode === 'bake-now' ? t('planBake.startNow') : t('planBake.planBake')}
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={t('planBake.title')} footer={footerContent}>
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
              {t('planBake.recipeSummary', { hours: totalHours, steps: schedule?.steps.length || 0 })}
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
            <span className="text-sm font-medium">{t('planBake.modeSchedule')}</span>
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
            <span className="text-sm font-medium">{t('planBake.modeBakeNow')}</span>
          </button>
        </div>

        {/* Schedule Options */}
        {planMode === 'end-time' && (
          <>
            <div>
              <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
                {t('planBake.readyQuestion')}
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
                  {t('planBake.keepNightsFree')}
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500">
                  {t('planBake.keepNightsFreeHint')}
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
                  {t('planBake.overnightProofing')}
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500">
                  {t('planBake.overnightProofingHint')}
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
                    {t('planBake.startLine', { date: formatDate(schedule.startTime), time: formatTime(schedule.startTime, settings.timeFormat) })}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {t('planBake.readyLine', { date: formatDate(new Date(readyDate)), time: readyTime })}
                  </p>
                </div>
              </div>
            )}

            {!isFeasible && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {t('planBake.notEnoughTime')}
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
                  {t('planBake.startingImmediately')}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('planBake.estimatedFinish', { hours: totalHours })}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl cursor-pointer">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                <Snowflake className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                  {t('planBake.overnightProofing')}
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500">
                  {t('planBake.overnightProofingHint')}
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
            label={t('planBake.scaleRecipe')}
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
            {t('planBake.ingredientsLabel')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Wheat className="w-4 h-4 text-honey-500" />
                <span className="text-xs text-crust-500 dark:text-crumb-500">{t('planBake.ingredientFlour')}</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.flour}g
              </span>
            </div>
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Droplets className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-crust-500 dark:text-crumb-500">{t('planBake.ingredientWater')}</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.water}g
              </span>
            </div>
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <ChefHat className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-crust-500 dark:text-crumb-500">{t('planBake.ingredientStarter')}</span>
              </div>
              <span className="text-lg font-semibold text-crust-800 dark:text-crumb-100">
                {scaledIngredients.starter}g
              </span>
            </div>
            <div className="p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs">🧂</span>
                <span className="text-xs text-crust-500 dark:text-crumb-500">{t('planBake.ingredientSalt')}</span>
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
              {t('planBake.flourBreakdown')}
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
            {t('planBake.stepsCount', { count: schedule?.steps.length || 0 })}
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
                      {localizeTimelineStep(step, language).description.split('\n')[0]}
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
