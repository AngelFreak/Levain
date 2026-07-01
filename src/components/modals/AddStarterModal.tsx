import { useState } from 'react';
import { Beaker } from 'lucide-react';
import { Button, Input, BottomSheet, DateField, toDateInputValue, fromDateInputValue } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../lib/i18n/useTranslation';

interface AddStarterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddStarterModal({ isOpen, onClose }: AddStarterModalProps) {
  const { showToast } = useAppStore();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [flourType, setFlourType] = useState('white');
  const [hydration, setHydration] = useState('100');
  const [createdDate, setCreatedDate] = useState(() => toDateInputValue(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = toDateInputValue(new Date());

  const flourOptions = [
    { value: 'white', label: t('addStarter.flourWhite') },
    { value: 'whole-wheat', label: t('addStarter.flourWholeWheat') },
    { value: 'rye', label: t('addStarter.flourRye') },
    { value: 'spelt', label: t('addStarter.flourSpelt') },
    { value: 'mixed', label: t('addStarter.flourMixed') },
  ];

  const hydrationOptions = [
    { value: '50', label: t('addStarter.hydrationStiff') },
    { value: '65', label: t('addStarter.hydrationMediumStiff') },
    { value: '100', label: t('addStarter.hydrationStandard') },
    { value: '125', label: t('addStarter.hydrationLiquid') },
  ];

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast(t('addStarter.errorNameRequired'), 'error');
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
        storageLocation: 'room',
        notes: '',
      });

      showToast(t('addStarter.successAdded', { name }), 'success');
      handleClose();
    } catch (error) {
      showToast(t('addStarter.errorAddFailed'), 'error');
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
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={t('addStarter.title')}>
      <div className="space-y-5">
        {/* Icon header */}
        <div className="flex justify-center">
          <div className="p-3 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
            <Beaker className="w-8 h-8 text-honey-600 dark:text-honey-400" />
          </div>
        </div>

        {/* Form fields */}
        <Input
          label={t('addStarter.nameLabel')}
          placeholder={t('addStarter.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {/* Date created - when the starter was first made */}
        <DateField
          label={t('addStarter.dateCreatedLabel')}
          value={createdDate}
          onChange={setCreatedDate}
          max={today}
          hint={t('addStarter.dateCreatedHint')}
        />

        {/* Flour Type - Native-style segmented list */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            {t('addStarter.flourTypeLabel')}
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
            {t('addStarter.hydrationLabel')}
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
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={isSubmitting}
            className="flex-1"
          >
            {t('addStarter.submitButton')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
