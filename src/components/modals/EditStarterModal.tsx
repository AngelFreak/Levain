import { useState, useEffect } from 'react';
import { Edit2, Home, Snowflake } from 'lucide-react';
import { Button, Input, BottomSheet, Textarea, DateField, toDateInputValue, fromDateInputValue } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { rescheduleFeedingReminder } from '../../lib/notifications';
import { getStorageLocation, STORAGE_LOCATION_META } from '../../lib/storage';
import type { Starter, StorageLocation } from '../../types';

interface EditStarterModalProps {
  isOpen: boolean;
  onClose: () => void;
  starter: Starter | null;
  onSave?: (updatedStarter: Starter) => void;
}

export function EditStarterModal({ isOpen, onClose, starter, onSave }: EditStarterModalProps) {
  const { showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const [name, setName] = useState('');
  const [flourType, setFlourType] = useState('white');
  const [hydration, setHydration] = useState('100');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [storageLocation, setStorageLocation] = useState<StorageLocation>('room');
  const [createdDate, setCreatedDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = toDateInputValue(new Date());

  const flourOptions = [
    { value: 'white', label: 'White (AP/Bread)' },
    { value: 'whole-wheat', label: 'Whole Wheat' },
    { value: 'rye', label: 'Rye' },
    { value: 'spelt', label: 'Spelt' },
    { value: 'mixed', label: 'Mixed' },
  ];

  const hydrationOptions = [
    { value: '50', label: '50% (Stiff)' },
    { value: '65', label: '65% (Medium-Stiff)' },
    { value: '100', label: '100% (Standard)' },
    { value: '125', label: '125% (Liquid)' },
  ];

  // Populate form when starter changes
  useEffect(() => {
    if (starter) {
      setName(starter.name);
      setFlourType(starter.flourType);
      setHydration(starter.hydration.toString());
      setNotes(starter.notes || '');
      setIsActive(starter.isActive);
      setStorageLocation(getStorageLocation(starter.storageLocation));
      setCreatedDate(toDateInputValue(new Date(starter.createdDate)));
    }
  }, [starter]);

  const handleSubmit = async () => {
    if (!starter?.id) return;

    if (!name.trim()) {
      showToast('Please enter a name for your starter', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const locationChanged = getStorageLocation(starter.storageLocation) !== storageLocation;

      const updatedData = {
        name: name.trim(),
        flourType,
        hydration: parseInt(hydration),
        notes,
        isActive,
        storageLocation,
        createdDate: fromDateInputValue(createdDate),
      };

      await db.starters.update(starter.id, updatedData);

      const updatedStarter = { ...starter, ...updatedData };

      // A room/fridge change shifts the feeding cadence — reschedule the pending
      // reminder relative to the last feeding using the new interval.
      if (locationChanged && settings.notificationsEnabled) {
        await rescheduleFeedingReminder(
          updatedStarter,
          settings.feedingRemindersEnabled,
          settings.feedingReminderHours
        );
      }

      showToast(`${name} has been updated!`, 'success');
      onSave?.(updatedStarter);
      onClose();
    } catch (error) {
      console.error('Failed to update starter:', error);
      showToast('Failed to update starter', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form to original values
    if (starter) {
      setName(starter.name);
      setFlourType(starter.flourType);
      setHydration(starter.hydration.toString());
      setNotes(starter.notes || '');
      setIsActive(starter.isActive);
      setStorageLocation(getStorageLocation(starter.storageLocation));
      setCreatedDate(toDateInputValue(new Date(starter.createdDate)));
    }
    onClose();
  };

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
        isLoading={isSubmitting}
        className="flex-1"
      >
        Save Changes
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Edit Starter" footer={footerContent}>
      <div className="space-y-5">
        {/* Icon header */}
        <div className="flex justify-center">
          <div className="p-3 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
            <Edit2 className="w-8 h-8 text-honey-600 dark:text-honey-400" />
          </div>
        </div>

        {/* Form fields */}
        <Input
          label="Starter Name"
          placeholder="e.g., Bubbles, Old Faithful"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {/* Date created - when the starter was first made */}
        <DateField
          label="Date Created"
          value={createdDate}
          onChange={setCreatedDate}
          max={today}
          hint="When you first made this starter"
        />

        {/* Flour Type - Native-style segmented list */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            Primary Flour Type
          </label>
          <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
            {flourOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFlourType(option.value)}
                className={`
                  w-full flex items-center justify-between px-4 py-3.5 text-left
                  ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                  ${flourType === option.value
                    ? 'bg-honey-50 dark:bg-honey-900/20'
                    : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                  }
                `}
              >
                <span className={`font-medium ${
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

        {/* Hydration - Native-style segmented list */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            Hydration Level
          </label>
          <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
            {hydrationOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setHydration(option.value)}
                className={`
                  w-full flex items-center justify-between px-4 py-3.5 text-left
                  ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                  ${hydration === option.value
                    ? 'bg-honey-50 dark:bg-honey-900/20'
                    : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                  }
                `}
              >
                <span className={`font-medium ${
                  hydration === option.value
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}>
                  {option.label}
                </span>
                {hydration === option.value && (
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

        {/* Storage Location - affects feeding reminder cadence */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            Storage
          </label>
          <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
            {(['room', 'fridge'] as StorageLocation[]).map((loc, index) => (
              <button
                key={loc}
                type="button"
                onClick={() => setStorageLocation(loc)}
                className={`
                  w-full flex items-center justify-between px-4 py-3.5 text-left
                  ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                  ${storageLocation === loc
                    ? 'bg-honey-50 dark:bg-honey-900/20'
                    : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  {loc === 'fridge' ? (
                    <Snowflake className={`w-5 h-5 ${storageLocation === loc ? 'text-honey-600 dark:text-honey-400' : 'text-crust-500 dark:text-crumb-400'}`} />
                  ) : (
                    <Home className={`w-5 h-5 ${storageLocation === loc ? 'text-honey-600 dark:text-honey-400' : 'text-crust-500 dark:text-crumb-400'}`} />
                  )}
                  <div>
                    <span className={`font-medium ${
                      storageLocation === loc
                        ? 'text-honey-700 dark:text-honey-400'
                        : 'text-crust-700 dark:text-crumb-200'
                    }`}>
                      {STORAGE_LOCATION_META[loc].label}
                    </span>
                    <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
                      {STORAGE_LOCATION_META[loc].description}
                    </p>
                  </div>
                </div>
                {storageLocation === loc && (
                  <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <Textarea
          label="Notes"
          placeholder="Any special characteristics or history..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />

        {/* Active Toggle */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            Status
          </label>
          <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsActive(true)}
              className={`
                w-full flex items-center justify-between px-4 py-3.5 text-left
                ${isActive
                  ? 'bg-honey-50 dark:bg-honey-900/20'
                  : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                }
              `}
            >
              <div>
                <span className={`font-medium ${
                  isActive
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}>
                  Active
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
                  Starter appears in feeding list
                </p>
              </div>
              {isActive && (
                <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsActive(false)}
              className={`
                w-full flex items-center justify-between px-4 py-3.5 text-left
                border-t border-crumb-200/50 dark:border-crust-700/50
                ${!isActive
                  ? 'bg-honey-50 dark:bg-honey-900/20'
                  : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                }
              `}
            >
              <div>
                <span className={`font-medium ${
                  !isActive
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}>
                  Inactive
                </span>
                <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
                  Hidden from feeding list (archived)
                </p>
              </div>
              {!isActive && (
                <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
