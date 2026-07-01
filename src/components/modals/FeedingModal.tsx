import { useState, useEffect } from 'react';
import { Droplet, Thermometer, ChevronDown, ChevronUp, Recycle } from 'lucide-react';
import { Button, NumberInput, BottomSheet, Textarea } from '../ui';
import { db, recomputeStarterStats, addStarterDiscard } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { scheduleFeedingReminder } from '../../lib/notifications';
import { getStorageLocation, getFeedingReminderHours } from '../../lib/storage';
import { useTranslation } from '../../lib/i18n/useTranslation';
import type { Feeding } from '../../types';

interface FeedingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedStarterId?: string;
}

const FEEDING_RATIOS = [
  { value: '1:1:1', peak: '4-6h' },
  { value: '1:2:2', peak: '6-8h' },
  { value: '1:3:3', peak: '8-10h' },
  { value: '1:5:5', peak: '10-14h' },
  { value: '1:10:10', peak: '16-24h' },
];

const FLOUR_TYPES = [
  { value: 'white', labelKey: 'feeding.flourWhite' },
  { value: 'whole-wheat', labelKey: 'feeding.flourWholeWheat' },
  { value: 'rye', labelKey: 'feeding.flourRye' },
  { value: 'spelt', labelKey: 'feeding.flourSpelt' },
  { value: 'mixed', labelKey: 'feeding.flourMixed' },
] as const;

export function FeedingModal({ isOpen, onClose, preselectedStarterId }: FeedingModalProps) {
  const { showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [selectedStarterId, setSelectedStarterId] = useState(preselectedStarterId || '');
  const [ratio, setRatio] = useState('1:5:5');
  const [starterWeight, setStarterWeight] = useState(20);
  const [flourWeight, setFlourWeight] = useState(100);
  const [waterWeight, setWaterWeight] = useState(100);
  const [flourType, setFlourType] = useState('white');
  const [waterTemp, setWaterTemp] = useState<number | undefined>(undefined);
  const [ambientTemp, setAmbientTemp] = useState<number | undefined>(undefined);
  const [discardGrams, setDiscardGrams] = useState(0);
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get active starters for selection
  // Note: Dexie doesn't support boolean index queries, using filter
  const starters = useLiveQuery(
    () => db.starters.filter((s) => s.isActive === true).toArray(),
    []
  );

  // Update selected starter when preselected changes
  useEffect(() => {
    if (preselectedStarterId) {
      setSelectedStarterId(preselectedStarterId);
    }
  }, [preselectedStarterId]);

  // Auto-select first starter if only one exists
  useEffect(() => {
    if (starters?.length === 1 && !selectedStarterId) {
      setSelectedStarterId(starters[0].uuid);
    }
  }, [starters, selectedStarterId]);

  // Update weights based on ratio
  useEffect(() => {
    const [, flourRatio] = ratio.split(':').map(Number);
    if (flourRatio) {
      setFlourWeight(starterWeight * flourRatio);
      setWaterWeight(starterWeight * flourRatio);
    }
  }, [ratio, starterWeight]);

  // Default the discard estimate from the previous feeding: the flour + water
  // you built last time is roughly what gets discarded when you keep only
  // `starterWeight` to feed again. The user can override in advanced options.
  useEffect(() => {
    if (!selectedStarterId) return;
    let cancelled = false;
    db.feedings
      .where('starterId')
      .equals(selectedStarterId)
      .toArray()
      .then((fs) => {
        if (cancelled) return;
        const last = fs.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
        const estimate = last
          ? Math.round((last.flourWeight ?? 0) + (last.waterWeight ?? 0))
          : 0;
        setDiscardGrams(estimate);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStarterId]);

  const handleSubmit = async () => {
    if (!selectedStarterId) {
      showToast(t('feeding.selectStarterError'), 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const feeding: Feeding = {
        uuid: crypto.randomUUID(),
        starterId: selectedStarterId,
        timestamp: new Date(),
        ratio,
        starterWeight,
        flourWeight,
        waterWeight,
        flourType,
        waterTemp,
        ambientTemp,
        notes,
      };

      await db.feedings.add(feeding);

      // Update starter's lastFed date
      const starter = await db.starters.where('uuid').equals(selectedStarterId).first();
      if (starter && starter.id) {
        await db.starters.update(starter.id, {
          lastFed: new Date(),
        });
      }

      // Recompute feeding-derived stats (avg peak, activity) for this starter.
      await recomputeStarterStats(selectedStarterId);

      // Accumulate discard for the "use your discard" prompt.
      if (discardGrams > 0) {
        await addStarterDiscard(selectedStarterId, discardGrams);
      }

      const starterName =
        starters?.find((s) => s.uuid === selectedStarterId)?.name || t('feeding.defaultStarterName');

      // Schedule feeding reminder if enabled
      if (settings.notificationsEnabled && settings.feedingRemindersEnabled && starter) {
        const reminderResult = await scheduleFeedingReminder(
          starter,
          new Date(),
          settings.feedingReminderHours
        );

        if (reminderResult.success && reminderResult.scheduledTime) {
          const effectiveHours = getFeedingReminderHours(
            starter.storageLocation,
            settings.feedingReminderHours
          );
          const interval =
            getStorageLocation(starter.storageLocation) === 'fridge'
              ? t('feeding.intervalDays', { count: Math.round(effectiveHours / 24) })
              : t('feeding.intervalHours', { count: effectiveHours });
          showToast(t('feeding.fedReminderSet', { name: starterName, interval }), 'success');
        } else if (reminderResult.permissionDenied) {
          showToast(t('feeding.fedEnableNotifications', { name: starterName }), 'warning');
        } else {
          showToast(t('feeding.fedSuccess', { name: starterName }), 'success');
        }
      } else {
        showToast(t('feeding.fedSuccess', { name: starterName }), 'success');
      }

      handleClose();
    } catch (error) {
      console.error('Failed to log feeding:', error);
      showToast(t('feeding.logError'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setSelectedStarterId(preselectedStarterId || '');
    setRatio('1:5:5');
    setStarterWeight(20);
    setFlourWeight(100);
    setWaterWeight(100);
    setFlourType('white');
    setWaterTemp(undefined);
    setAmbientTemp(undefined);
    setNotes('');
    setShowAdvanced(false);
    onClose();
  };

  const selectedStarter = starters?.find((s) => s.uuid === selectedStarterId);

  const footerContent = (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        onClick={handleClose}
        className="flex-1"
      >
        {t('common.cancel')}
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !selectedStarterId}
        isLoading={isSubmitting}
        className="flex-1"
      >
        {t('feeding.logButton')}
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={t('feeding.title')} footer={footerContent}>
      <div className="space-y-5">
        {/* Icon header */}
        <div className="flex justify-center">
          <div className="p-3 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
            <Droplet className="w-8 h-8 text-honey-600 dark:text-honey-400" />
          </div>
        </div>

        {/* Starter Selection - Native list style */}
        {starters && starters.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
              {t('feeding.whichStarter')}
            </label>
            <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
              {starters.map((starter, index) => (
                <button
                  key={starter.uuid}
                  type="button"
                  onClick={() => setSelectedStarterId(starter.uuid)}
                  className={`
                    w-full flex items-center justify-between px-4 py-3.5 text-left
                    ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                    ${selectedStarterId === starter.uuid
                      ? 'bg-honey-50 dark:bg-honey-900/20'
                      : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                    }
                  `}
                >
                  <span className={`font-medium ${
                    selectedStarterId === starter.uuid
                      ? 'text-honey-700 dark:text-honey-400'
                      : 'text-crust-700 dark:text-crumb-200'
                  }`}>
                    {starter.name}
                  </span>
                  {selectedStarterId === starter.uuid && (
                    <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show selected starter name if only one */}
        {starters?.length === 1 && selectedStarter && (
          <div className="flex items-center gap-2 p-3 bg-surface2 dark:bg-surfaceDark2 rounded-xl">
            <span className="text-sm text-crust-600 dark:text-crumb-400">{t('feeding.feedingLabel')}</span>
            <span className="font-medium text-crust-800 dark:text-crumb-100">
              {selectedStarter.name}
            </span>
          </div>
        )}

        {/* Feeding Ratio - Native list style */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            {t('feeding.ratioLabel')}
          </label>
          <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
            {FEEDING_RATIOS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRatio(option.value)}
                className={`
                  w-full flex items-center justify-between px-4 py-3 text-left
                  ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                  ${ratio === option.value
                    ? 'bg-honey-50 dark:bg-honey-900/20'
                    : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                  }
                `}
              >
                <span className={`font-medium text-sm ${
                  ratio === option.value
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}>
                  {t('feeding.ratioOption', { ratio: option.value, peak: option.peak })}
                </span>
                {ratio === option.value && (
                  <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-crust-500 dark:text-crumb-500 mt-1.5">
            {t('feeding.ratioHint')}
          </p>
        </div>

        {/* Weights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-16">
              {t('feeding.starterWeightLabel')}
            </label>
            <div className="flex-1 max-w-[200px]">
              <NumberInput
                value={starterWeight}
                onChange={setStarterWeight}
                min={5}
                max={200}
                step={5}
                unit="g"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-16">
              {t('feeding.flourWeightLabel')}
            </label>
            <div className="flex-1 max-w-[200px]">
              <NumberInput
                value={flourWeight}
                onChange={setFlourWeight}
                min={10}
                max={1000}
                step={10}
                unit="g"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-16">
              {t('feeding.waterWeightLabel')}
            </label>
            <div className="flex-1 max-w-[200px]">
              <NumberInput
                value={waterWeight}
                onChange={setWaterWeight}
                min={10}
                max={1000}
                step={10}
                unit="g"
              />
            </div>
          </div>
        </div>

        {/* Flour Type - Native list style */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            {t('feeding.flourTypeLabel')}
          </label>
          <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
            {FLOUR_TYPES.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFlourType(option.value)}
                className={`
                  w-full flex items-center justify-between px-4 py-3 text-left
                  ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                  ${flourType === option.value
                    ? 'bg-honey-50 dark:bg-honey-900/20'
                    : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                  }
                `}
              >
                <span className={`font-medium text-sm ${
                  flourType === option.value
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}>
                  {t(option.labelKey)}
                </span>
                {flourType === option.value && (
                  <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Options (Collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full py-2 text-sm text-crust-600 dark:text-crumb-400 hover:text-crust-800 dark:hover:text-crumb-200"
          >
            <span>{showAdvanced ? t('feeding.hideAdvanced') : t('feeding.showAdvanced')}</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 mt-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              {/* Temperature (optional) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-crust-700 dark:text-crumb-200 mb-1">
                    <div className="flex items-center gap-1">
                      <Thermometer className="w-3 h-3" />
                      {t('feeding.waterTemp')}
                    </div>
                  </label>
                  <NumberInput
                    value={waterTemp ?? 0}
                    onChange={(v) => setWaterTemp(v || undefined)}
                    min={0}
                    max={50}
                    unit="°C"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-crust-700 dark:text-crumb-200 mb-1">
                    <div className="flex items-center gap-1">
                      <Thermometer className="w-3 h-3" />
                      {t('feeding.roomTemp')}
                    </div>
                  </label>
                  <NumberInput
                    value={ambientTemp ?? 0}
                    onChange={(v) => setAmbientTemp(v || undefined)}
                    min={0}
                    max={45}
                    unit="°C"
                  />
                </div>
              </div>

              {/* Discard (optional) — accumulates toward the use-it-up prompt */}
              <div>
                <label className="block text-xs font-medium text-crust-700 dark:text-crumb-200 mb-1">
                  <div className="flex items-center gap-1">
                    <Recycle className="w-3 h-3" />
                    {t('feeding.discardLabel')}
                  </div>
                </label>
                <NumberInput
                  value={discardGrams}
                  onChange={setDiscardGrams}
                  min={0}
                  max={2000}
                  step={10}
                  unit="g"
                />
                <p className="text-[10px] text-crust-500 dark:text-crumb-500 mt-1">
                  {t('feeding.discardHint')}
                </p>
              </div>

              {/* Notes */}
              <Textarea
                label={t('feeding.notesLabel')}
                placeholder={t('feeding.notesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
