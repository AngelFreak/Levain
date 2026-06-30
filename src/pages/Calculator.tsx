import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator as CalcIcon,
  Thermometer,
  Droplets,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Flame,
  Snowflake,
  Play,
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Slider, NumberInput, BottomSheetSelect } from '../components/ui';
import {
  calculateReverseSchedule,
  formatTime,
  formatDate,
} from '../lib/fermentation';
import { db, getActiveTimelines } from '../lib/db';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  convertToTimelineSteps,
  createStepNotifications,
  scheduleTimelineNotifications,
  showPersistentBakeNotification,
} from '../lib/notifications';
import { allocateTimelineBaseId } from '../lib/notificationIds';
import type {
  ReverseCalculatorOutput,
  ScheduleStep,
  FlourType,
  StarterStrength,
  ActiveTimeline,
} from '../types';

type CalculatorTab = 'reverse' | 'bakers' | 'ddt' | 'hydration';

export function CalculatorPage() {
  const [activeTab, setActiveTab] = useState<CalculatorTab>('reverse');

  const tabs = [
    { id: 'reverse' as const, label: 'Plan Bake', icon: Sparkles },
    { id: 'bakers' as const, label: "Baker's %", icon: CalcIcon },
    { id: 'ddt' as const, label: 'DDT', icon: Thermometer },
    { id: 'hydration' as const, label: 'Hydration', icon: Droplets },
  ];

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
          Calculators
        </h1>
        <p className="text-crust-600 dark:text-crumb-400 mt-1">
          Precision tools for perfect bread
        </p>
      </motion.div>

      {/* Tab Selector - 2x2 Grid */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl
                transition-all touch-target border aspect-square
                ${isActive
                  ? 'bg-crust-600 text-white border-crust-600 shadow-sm dark:bg-honey-600 dark:border-honey-600'
                  : 'bg-surface1 dark:bg-surfaceDark2 text-crust-700 dark:text-crumb-300 border-crumb-300 dark:border-crust-600 hover:bg-surface2 dark:hover:bg-surfaceDark3'
                }
              `}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Calculator Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'reverse' && <ReverseTimeCalculator />}
          {activeTab === 'bakers' && <BakersPercentCalculator />}
          {activeTab === 'ddt' && <DDTCalculator />}
          {activeTab === 'hydration' && <HydrationCalculator />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Reverse Time Calculator (Hero Feature)
function ReverseTimeCalculator() {
  const { showToast, setActiveTab } = useAppStore();
  const { settings } = useSettingsStore();
  const [readyTime, setReadyTime] = useState('18:00');
  const [readyDate, setReadyDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [temperature, setTemperature] = useState(23);
  const [bakeType, setBakeType] = useState<'bread' | 'rolls'>('bread');
  const [includeColdRetard, setIncludeColdRetard] = useState(true);
  const [coldRetardDuration, setColdRetardDuration] = useState(12);
  const [flourType, setFlourType] = useState<FlourType>('bread');
  const [starterStrength, setStarterStrength] = useState<StarterStrength>('normal');
  const [includeAutolyse, setIncludeAutolyse] = useState(true);
  const [avoidNightHours, setAvoidNightHours] = useState(true);
  const [result, setResult] = useState<ReverseCalculatorOutput | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleCalculate = () => {
    const [hours, minutes] = readyTime.split(':').map(Number);
    const desiredReadyTime = new Date(readyDate);
    desiredReadyTime.setHours(hours, minutes, 0, 0);

    const output = calculateReverseSchedule({
      desiredReadyTime,
      ambientTemperature: temperature,
      flourType,
      wholeGrainPercentage: flourType === 'wholewheat' ? 100 : flourType === 'mixed' ? 30 : 0,
      starterHydration: 100,
      starterStrength,
      includeColdRetard,
      coldRetardDuration: includeColdRetard ? coldRetardDuration : undefined,
      includeAutolyse,
      preferredBulkLocation: 'counter',
      avoidNightHours,
      bakeType,
    });

    setResult(output);
  };

  const handleStartBake = async () => {
    if (!result || !result.feasible) return;

    setIsStarting(true);
    try {
      // Convert schedule steps to timeline steps
      const timelineSteps = convertToTimelineSteps(result.schedule);

      // Allocate a collision-free notification block for this timeline.
      const baseNotificationId = await allocateTimelineBaseId();

      // Create notifications for each step
      const notifications = createStepNotifications(timelineSteps, baseNotificationId);

      // Create the active timeline
      const timeline: ActiveTimeline = {
        uuid: crypto.randomUUID(),
        name: `Sourdough Bake - ${formatDate(new Date(readyDate))}`,
        startTime: new Date(),
        steps: timelineSteps,
        currentStepIndex: 0,
        status: 'active',
        notifications,
        notificationBaseId: baseNotificationId, // Store for cancellation later
        photos: [],
        notes: '',
      };

      // Save to database
      await db.activeTimelines.add(timeline);

      // Show persistent notification for the active bake (summarizing the count
      // if other bakes are already running).
      if (settings.notificationsEnabled) {
        const activeCount = await getActiveTimelines().then((a) => a.length);
        await showPersistentBakeNotification(timeline.name, activeCount);
      }

      // Schedule notifications only if user has them enabled in settings
      if (settings.notificationsEnabled) {
        // Schedule all notifications (also checks OS permissions internally)
        const notificationResult = await scheduleTimelineNotifications(notifications, baseNotificationId);

        if (notificationResult.permissionDenied) {
          showToast('Bake started! Enable notifications in settings for reminders.', 'warning');
        } else {
          showToast('Bake started! You\'ll be notified for each step.', 'success');
        }
      } else {
        showToast('Bake started! Enable notifications in settings for reminders.', 'info');
      }

      // Navigate to home to see the active bake
      setActiveTab('home');
    } catch (error) {
      console.error('Failed to start bake:', error);
      showToast('Failed to start bake', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card variant="elevated" padding="lg">
        <CardHeader
          title="When do you want bread?"
          subtitle="We'll plan the perfect schedule"
        />
        <CardContent className="space-y-6">
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={readyDate}
                onChange={(e) => setReadyDate(e.target.value)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-crust-900 border border-crumb-300 dark:border-crust-700 rounded-xl text-crust-900 dark:text-crumb-100 focus:outline-none focus:ring-2 focus:ring-crust-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
                Time
              </label>
              <input
                type="time"
                value={readyTime}
                onChange={(e) => setReadyTime(e.target.value)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-crust-900 border border-crumb-300 dark:border-crust-700 rounded-xl text-crust-900 dark:text-crumb-100 focus:outline-none focus:ring-2 focus:ring-crust-500/20"
              />
            </div>
          </div>

          {/* Temperature */}
          <Slider
            label="Kitchen Temperature"
            value={temperature}
            onChange={setTemperature}
            min={15}
            max={35}
            unit="°C"
            marks={[
              { value: 15, label: '15°' },
              { value: 23, label: '23°' },
              { value: 35, label: '35°' },
            ]}
          />

          {/* Bake Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
              What are you baking?
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setBakeType('bread')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                  bakeType === 'bread'
                    ? 'bg-crust-600 dark:bg-crust-500 text-white border-transparent'
                    : 'bg-white dark:bg-crust-900 text-crust-700 dark:text-crumb-300 border-crumb-300 dark:border-crust-700'
                }`}
              >
                <ChefHat className="w-4 h-4" />
                <span className="text-sm font-medium">Bread</span>
              </button>
              <button
                onClick={() => setBakeType('rolls')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                  bakeType === 'rolls'
                    ? 'bg-crust-600 dark:bg-crust-500 text-white border-transparent'
                    : 'bg-white dark:bg-crust-900 text-crust-700 dark:text-crumb-300 border-crumb-300 dark:border-crust-700'
                }`}
              >
                <Flame className="w-4 h-4" />
                <span className="text-sm font-medium">Rolls</span>
              </button>
            </div>
          </div>

          {/* Cold Retard Option */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeColdRetard}
                onChange={(e) => setIncludeColdRetard(e.target.checked)}
                className="w-5 h-5 rounded border-crumb-300 text-crust-600 focus:ring-crust-500"
              />
              <div className="flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-blue-500" />
                <span className="text-crust-700 dark:text-crumb-200">
                  Include cold retard (fridge proof)
                </span>
              </div>
            </label>
            {includeColdRetard && (
              <div className="ml-8">
                <Slider
                  label="Cold Retard Duration"
                  value={coldRetardDuration}
                  onChange={setColdRetardDuration}
                  min={4}
                  max={24}
                  unit=" hours"
                />
              </div>
            )}
          </div>

          {/* Avoid Night Hours Option */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={avoidNightHours}
              onChange={(e) => setAvoidNightHours(e.target.checked)}
              className="w-5 h-5 rounded border-crumb-300 text-crust-600 focus:ring-crust-500"
            />
            <span className="text-crust-700 dark:text-crumb-200">
              Keep night free (23:00–07:00)
            </span>
          </label>

          {/* Advanced Options Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-crust-600 dark:text-crumb-400 hover:text-crust-800 dark:hover:text-crumb-200"
          >
            {showAdvanced ? '− Hide' : '+ Show'} advanced options
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-2"
            >
              <div>
                <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
                  Flour Type
                </label>
                <BottomSheetSelect
                  value={flourType}
                  onChange={(v) => setFlourType(v as FlourType)}
                  title="Flour Type"
                  options={[
                    { value: 'bread', label: 'Bread Flour' },
                    { value: 'allpurpose', label: 'All-Purpose' },
                    { value: 'wholewheat', label: 'Whole Wheat' },
                    { value: 'rye', label: 'Rye' },
                    { value: 'mixed', label: 'Mixed' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
                  Starter Strength
                </label>
                <BottomSheetSelect
                  value={starterStrength}
                  onChange={(v) => setStarterStrength(v as StarterStrength)}
                  title="Starter Strength"
                  options={[
                    { value: 'weak', label: 'Weak (new or neglected)' },
                    { value: 'developing', label: 'Developing' },
                    { value: 'normal', label: 'Normal (healthy)' },
                    { value: 'strong', label: 'Strong' },
                    { value: 'vigorous', label: 'Vigorous (fed twice daily)' },
                  ]}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAutolyse}
                  onChange={(e) => setIncludeAutolyse(e.target.checked)}
                  className="w-5 h-5 rounded border-crumb-300 text-crust-600 focus:ring-crust-500"
                />
                <span className="text-crust-700 dark:text-crumb-200">
                  Include autolyse step
                </span>
              </label>
            </motion.div>
          )}
        </CardContent>
      </Card>

      <Button fullWidth size="lg" onClick={handleCalculate}>
        Generate Schedule
        <ChevronRight className="w-5 h-5" />
      </Button>

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Summary Card */}
          <Card
            padding="lg"
            className={result.feasible ? 'border-success-500' : 'border-error-500'}
          >
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-full ${
                  result.feasible
                    ? 'bg-success-100 dark:bg-success-900/30'
                    : 'bg-error-100 dark:bg-error-900/30'
                }`}
              >
                {result.feasible ? (
                  <CheckCircle2 className="w-6 h-6 text-success-600 dark:text-success-400" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-error-600 dark:text-error-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-lg text-crust-800 dark:text-crumb-100">
                  {result.feasible ? 'Schedule Ready!' : 'Not Enough Time'}
                </h3>
                <p className="text-sm text-crust-600 dark:text-crumb-400 mt-1">
                  {result.feasible
                    ? `Total time: ${Math.round(result.totalHours)} hours`
                    : 'Try an earlier date or adjust settings'}
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <ChefHat className="w-4 h-4 text-crust-500" />
                    <span className="text-crust-700 dark:text-crumb-300">
                      {result.recommendedInoculation}% starter
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Flame className="w-4 h-4 text-crust-500" />
                    <span className="text-crust-700 dark:text-crumb-300">
                      {result.recommendedStarterRatio} ratio
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <Card padding="md" className="bg-warning-50 dark:bg-warning-900/20 border-warning-300 dark:border-warning-800">
              <div className="space-y-2">
                {result.warnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-warning-600 dark:text-warning-400 flex-shrink-0 mt-0.5" />
                    <span className="text-warning-800 dark:text-warning-200">{warning}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Schedule Timeline */}
          {result.feasible && (
            <Card padding="lg">
              <h3 className="font-display font-semibold text-crust-800 dark:text-crumb-100 mb-4">
                Your Schedule
              </h3>
              <div className="space-y-0">
                {result.schedule.map((step, index) => (
                  <ScheduleStepRow
                    key={step.id}
                    step={step}
                    isFirst={index === 0}
                    isLast={index === result.schedule.length - 1}
                    timeFormat={settings.timeFormat}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Start Bake Button */}
          {result.feasible && (
            <Button
              fullWidth
              size="lg"
              variant="primary"
              onClick={handleStartBake}
              isLoading={isStarting}
              disabled={isStarting}
            >
              <Play className="w-5 h-5" />
              Start This Bake
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}

// Schedule Step Row Component
function ScheduleStepRow({
  step,
  isLast,
  timeFormat,
}: {
  step: ScheduleStep;
  isFirst: boolean;
  isLast: boolean;
  timeFormat: '12h' | '24h';
}) {
  const isHighPriority = ['Feed Starter', 'Mix Final Dough', 'Pre-Shape', 'Score & Bake (Covered)'].includes(step.step);

  return (
    <div className="flex gap-3">
      {/* Timeline Line */}
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full ${
            isHighPriority
              ? 'bg-honey-500'
              : 'bg-crumb-300 dark:bg-crust-600'
          }`}
        />
        {!isLast && (
          <div className="w-0.5 flex-1 bg-crumb-200 dark:bg-crust-700 min-h-[40px]" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? 'pb-0' : ''}`}>
        <div className="flex items-start justify-between">
          <div>
            <h4
              className={`font-medium ${
                isHighPriority
                  ? 'text-crust-800 dark:text-crumb-100'
                  : 'text-crust-700 dark:text-crumb-300'
              }`}
            >
              {step.step}
            </h4>
            <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
              {step.description}
            </p>
          </div>
          <div className="text-right flex-shrink-0 ml-3">
            <p className="text-sm font-mono text-crust-700 dark:text-crumb-200">
              {formatTime(step.time, timeFormat)}
            </p>
            <p className="text-xs text-crust-500 dark:text-crumb-500">
              {formatDate(step.time)}
            </p>
          </div>
        </div>
        {step.tips && (
          <p className="text-xs text-honey-700 dark:text-honey-400 mt-1 italic">
            {step.tips}
          </p>
        )}
      </div>
    </div>
  );
}

// Baker's Percentage Calculator
function BakersPercentCalculator() {
  const [flour, setFlour] = useState(500);
  const [hydration, setHydration] = useState(75);
  const [starterPercent, setStarterPercent] = useState(20);
  const [saltPercent, setSaltPercent] = useState(2);
  const [starterHydration, setStarterHydration] = useState(100);

  // Calculations
  const starterWeight = (flour * starterPercent) / 100;
  const starterFlour = starterWeight / (1 + starterHydration / 100);
  const starterWater = starterWeight - starterFlour;
  const totalFlour = flour + starterFlour;
  const targetWater = (totalFlour * hydration) / 100;
  const addedWater = targetWater - starterWater;
  const salt = (totalFlour * saltPercent) / 100;
  const totalDoughWeight = flour + addedWater + starterWeight + salt;
  const trueHydration = (targetWater / totalFlour) * 100;

  return (
    <div className="space-y-6">
      <Card variant="elevated" padding="lg">
        <CardHeader
          title="Baker's Percentages"
          subtitle="Calculate ingredient weights"
        />
        <CardContent className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
              Base Flour
            </label>
            <NumberInput
              value={flour}
              onChange={setFlour}
              min={100}
              max={5000}
              step={50}
              unit="g"
            />
          </div>

          <Slider
            label="Hydration"
            value={hydration}
            onChange={setHydration}
            min={50}
            max={100}
            unit="%"
          />

          <Slider
            label="Starter"
            value={starterPercent}
            onChange={setStarterPercent}
            min={5}
            max={40}
            unit="%"
          />

          <Slider
            label="Salt"
            value={saltPercent}
            onChange={setSaltPercent}
            min={1}
            max={3}
            step={0.1}
            unit="%"
          />

          <Slider
            label="Starter Hydration"
            value={starterHydration}
            onChange={setStarterHydration}
            min={50}
            max={150}
            unit="%"
          />
        </CardContent>
      </Card>

      {/* Results */}
      <Card padding="lg">
        <h3 className="font-display font-semibold text-crust-800 dark:text-crumb-100 mb-4">
          Recipe
        </h3>
        <div className="space-y-3">
          <ResultRow label="Flour" value={`${flour}g`} />
          <ResultRow label="Water" value={`${Math.round(addedWater)}g`} />
          <ResultRow label="Starter" value={`${Math.round(starterWeight)}g`} />
          <ResultRow label="Salt" value={`${salt.toFixed(1)}g`} />
          <div className="border-t border-crumb-200 dark:border-crust-800 pt-3 mt-3">
            <ResultRow
              label="Total Dough"
              value={`${Math.round(totalDoughWeight)}g`}
              highlight
            />
            <ResultRow
              label="True Hydration"
              value={`${trueHydration.toFixed(1)}%`}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

// DDT Calculator
function DDTCalculator() {
  const [targetTemp, setTargetTemp] = useState(24);
  const [roomTemp, setRoomTemp] = useState(22);
  const [flourTemp, setFlourTemp] = useState(20);
  const [starterTemp, setStarterTemp] = useState(22);
  const [friction, setFriction] = useState(4);

  // DDT Formula: Water Temp = (DDT × 4) - Room - Flour - Starter - Friction
  const waterTemp = targetTemp * 4 - roomTemp - flourTemp - starterTemp - friction;

  const warnings: string[] = [];
  if (waterTemp > 43) warnings.push('Water too hot! May damage yeast.');
  if (waterTemp < 4) warnings.push('Water too cold. Consider warming flour.');
  if (waterTemp < 0) warnings.push('Calculation results in impossible water temp.');

  return (
    <div className="space-y-6">
      <Card variant="elevated" padding="lg">
        <CardHeader
          title="Desired Dough Temperature"
          subtitle="Calculate optimal water temperature"
        />
        <CardContent className="space-y-5">
          <Slider
            label="Target Dough Temp"
            value={targetTemp}
            onChange={setTargetTemp}
            min={20}
            max={30}
            unit="°C"
          />

          <Slider
            label="Room Temperature"
            value={roomTemp}
            onChange={setRoomTemp}
            min={15}
            max={35}
            unit="°C"
          />

          <Slider
            label="Flour Temperature"
            value={flourTemp}
            onChange={setFlourTemp}
            min={10}
            max={30}
            unit="°C"
          />

          <Slider
            label="Starter Temperature"
            value={starterTemp}
            onChange={setStarterTemp}
            min={15}
            max={30}
            unit="°C"
          />

          <Slider
            label="Friction Factor"
            value={friction}
            onChange={setFriction}
            min={0}
            max={15}
            unit="°C"
          />
        </CardContent>
      </Card>

      {/* Result */}
      <Card padding="lg" className={warnings.length > 0 ? 'border-warning-500' : ''}>
        <div className="text-center">
          <p className="text-sm text-crust-600 dark:text-crumb-400 mb-1">
            Use water at
          </p>
          <p className="text-4xl font-mono font-bold text-crust-800 dark:text-crumb-100">
            {waterTemp.toFixed(1)}°C
          </p>
          {warnings.map((warning, i) => (
            <p key={i} className="text-warning-600 dark:text-warning-400 text-sm mt-2">
              ⚠️ {warning}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}

// Hydration Calculator
function HydrationCalculator() {
  const [flourWeight, setFlourWeight] = useState(500);
  const [waterWeight, setWaterWeight] = useState(350);
  const [starterWeight, setStarterWeight] = useState(100);
  const [starterHydration, setStarterHydration] = useState(100);

  // Calculate true hydration
  const starterFlour = starterWeight / (1 + starterHydration / 100);
  const starterWater = starterWeight - starterFlour;
  const totalFlour = flourWeight + starterFlour;
  const totalWater = waterWeight + starterWater;
  const trueHydration = (totalWater / totalFlour) * 100;
  const apparentHydration = (waterWeight / flourWeight) * 100;

  return (
    <div className="space-y-6">
      <Card variant="elevated" padding="lg">
        <CardHeader
          title="True Hydration"
          subtitle="Account for starter contribution"
        />
        <CardContent className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
              Flour Weight
            </label>
            <NumberInput
              value={flourWeight}
              onChange={setFlourWeight}
              min={100}
              max={5000}
              step={50}
              unit="g"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
              Water Weight
            </label>
            <NumberInput
              value={waterWeight}
              onChange={setWaterWeight}
              min={50}
              max={5000}
              step={25}
              unit="g"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
              Starter Weight
            </label>
            <NumberInput
              value={starterWeight}
              onChange={setStarterWeight}
              min={0}
              max={1000}
              step={10}
              unit="g"
            />
          </div>

          <Slider
            label="Starter Hydration"
            value={starterHydration}
            onChange={setStarterHydration}
            min={50}
            max={150}
            unit="%"
          />
        </CardContent>
      </Card>

      {/* Results */}
      <Card padding="lg">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-sm text-crust-600 dark:text-crumb-400 mb-1">
              Apparent
            </p>
            <p className="text-2xl font-mono font-semibold text-crust-700 dark:text-crumb-300">
              {apparentHydration.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-crust-600 dark:text-crumb-400 mb-1">
              True Hydration
            </p>
            <p className="text-2xl font-mono font-bold text-crust-800 dark:text-crumb-100">
              {trueHydration.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-crumb-200 dark:border-crust-800 text-sm text-crust-600 dark:text-crumb-400">
          <p>
            Starter adds <strong>{starterFlour.toFixed(0)}g flour</strong> and{' '}
            <strong>{starterWater.toFixed(0)}g water</strong>
          </p>
        </div>
      </Card>
    </div>
  );
}

// Helper component for result rows
function ResultRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-crust-600 dark:text-crumb-400">{label}</span>
      <span
        className={`font-mono ${
          highlight
            ? 'text-lg font-semibold text-crust-800 dark:text-crumb-100'
            : 'text-crust-800 dark:text-crumb-200'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
