import { useState, useEffect } from 'react';
import { Droplet, Thermometer, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, NumberInput, BottomSheet, Textarea } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { scheduleFeedingReminder } from '../../lib/notifications';
import type { Feeding } from '../../types';

interface FeedingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedStarterId?: string;
}

const FEEDING_RATIOS = [
  { value: '1:1:1', label: '1:1:1 (4-6h peak)' },
  { value: '1:2:2', label: '1:2:2 (6-8h peak)' },
  { value: '1:3:3', label: '1:3:3 (8-10h peak)' },
  { value: '1:5:5', label: '1:5:5 (10-14h peak)' },
  { value: '1:10:10', label: '1:10:10 (16-24h peak)' },
];

const FLOUR_TYPES = [
  { value: 'white', label: 'White (AP/Bread)' },
  { value: 'whole-wheat', label: 'Whole Wheat' },
  { value: 'rye', label: 'Rye' },
  { value: 'spelt', label: 'Spelt' },
  { value: 'mixed', label: 'Mixed' },
];

export function FeedingModal({ isOpen, onClose, preselectedStarterId }: FeedingModalProps) {
  const { showToast } = useAppStore();
  const { settings } = useSettingsStore();
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

  const handleSubmit = async () => {
    if (!selectedStarterId) {
      showToast('Please select a starter', 'error');
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

      const starterName = starters?.find((s) => s.uuid === selectedStarterId)?.name || 'Starter';

      // Schedule feeding reminder if enabled
      if (settings.notificationsEnabled && settings.feedingRemindersEnabled && starter) {
        const reminderResult = await scheduleFeedingReminder(
          starter,
          new Date(),
          settings.feedingReminderHours
        );

        if (reminderResult.success && reminderResult.scheduledTime) {
          const hours = settings.feedingReminderHours;
          showToast(`${starterName} fed! Reminder set for ${hours}h.`, 'success');
        } else if (reminderResult.permissionDenied) {
          showToast(`${starterName} fed! Enable notifications for reminders.`, 'warning');
        } else {
          showToast(`${starterName} fed successfully!`, 'success');
        }
      } else {
        showToast(`${starterName} fed successfully!`, 'success');
      }

      handleClose();
    } catch (error) {
      console.error('Failed to log feeding:', error);
      showToast('Failed to log feeding', 'error');
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
        Cancel
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !selectedStarterId}
        isLoading={isSubmitting}
        className="flex-1"
      >
        Log Feeding
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Feed Starter" footer={footerContent}>
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
              Which Starter?
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
            <span className="text-sm text-crust-600 dark:text-crumb-400">Feeding:</span>
            <span className="font-medium text-crust-800 dark:text-crumb-100">
              {selectedStarter.name}
            </span>
          </div>
        )}

        {/* Feeding Ratio - Native list style */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            Feeding Ratio
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
                  {option.label}
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
            Starter : Flour : Water
          </p>
        </div>

        {/* Weights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-16">
              Starter
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
              Flour
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
              Water
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
            Flour Type
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
                  {option.label}
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
            <span>{showAdvanced ? '− Hide' : '+ Show'} advanced options</span>
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
                      Water Temp
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
                      Room Temp
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

              {/* Notes */}
              <Textarea
                label="Notes"
                placeholder="Any observations..."
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
