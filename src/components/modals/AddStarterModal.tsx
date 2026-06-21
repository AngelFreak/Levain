import { useState } from 'react';
import { Beaker } from 'lucide-react';
import { Button, Input, BottomSheet, DateField, toDateInputValue, fromDateInputValue } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';

interface AddStarterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddStarterModal({ isOpen, onClose }: AddStarterModalProps) {
  const { showToast } = useAppStore();
  const [name, setName] = useState('');
  const [flourType, setFlourType] = useState('white');
  const [hydration, setHydration] = useState('100');
  const [createdDate, setCreatedDate] = useState(() => toDateInputValue(new Date()));
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

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('Please enter a name for your starter', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await db.starters.add({
        uuid: crypto.randomUUID(),
        name: name.trim(),
        flourType,
        hydration: parseInt(hydration),
        createdDate: fromDateInputValue(createdDate),
        isActive: true,
        notes: '',
      });

      showToast(`${name} has been added!`, 'success');
      handleClose();
    } catch (error) {
      showToast('Failed to add starter', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setFlourType('white');
    setHydration('100');
    setCreatedDate(toDateInputValue(new Date()));
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Add New Starter">
      <div className="space-y-5">
        {/* Icon header */}
        <div className="flex justify-center">
          <div className="p-3 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
            <Beaker className="w-8 h-8 text-honey-600 dark:text-honey-400" />
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

        {/* Actions */}
        <div className="flex gap-3 pt-2">
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
            Add Starter
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
