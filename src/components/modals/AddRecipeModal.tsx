import { useState } from 'react';
import { Plus, Trash2, Camera, ImageIcon, X } from 'lucide-react';
import { Button, Input, BottomSheet, Textarea, NumberInput } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { takePhoto, savePhoto } from '../../lib/photos';
import { useTranslation } from '../../lib/i18n/useTranslation';
import type { TranslationKey } from '../../lib/i18n';
import type { Recipe, RecipeCategory, FlourComponent, Addition, MethodStep } from '../../types';

interface AddRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { value: RecipeCategory; labelKey: TranslationKey }[] = [
  { value: 'country_loaf', labelKey: 'addRecipe.categoryCountryLoaf' },
  { value: 'buns', labelKey: 'addRecipe.categoryBuns' },
  { value: 'sandwich', labelKey: 'addRecipe.categorySandwich' },
  { value: 'focaccia', labelKey: 'addRecipe.categoryFocaccia' },
  { value: 'pizza', labelKey: 'addRecipe.categoryPizza' },
  { value: 'rye', labelKey: 'addRecipe.categoryRye' },
  { value: 'whole_grain', labelKey: 'addRecipe.categoryWholeGrain' },
  { value: 'enriched', labelKey: 'addRecipe.categoryEnriched' },
  { value: 'specialty', labelKey: 'addRecipe.categorySpecialty' },
  { value: 'discard', labelKey: 'addRecipe.categoryDiscard' },
];

export function AddRecipeModal({ isOpen, onClose }: AddRecipeModalProps) {
  const { showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RecipeCategory>('country_loaf');
  const [totalFlour, setTotalFlour] = useState(500);
  const [hydration, setHydration] = useState(settings.defaultHydration);
  const [starterPercent, setStarterPercent] = useState(settings.defaultStarterPercent);
  const [saltPercent, setSaltPercent] = useState(settings.defaultSaltPercent);
  const [totalTime, setTotalTime] = useState('12-16 hours');
  const [handsOnTime, setHandsOnTime] = useState('30 minutes');
  const [bestFor, setBestFor] = useState('Weekend baking');
  const [notes, setNotes] = useState('');
  const [flourBreakdown, setFlourBreakdown] = useState<FlourComponent[]>([{ type: 'Bread flour', percent: 100 }]);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [method, setMethod] = useState<MethodStep[]>([]);
  const [photo, setPhoto] = useState<string | undefined>(undefined);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast(t('addRecipe.toastNameRequired'), 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const recipe: Recipe = {
        uuid: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim(),
        category,
        totalFlour,
        hydration,
        starterPercent,
        saltPercent,
        flourBreakdown,
        additions,
        method,
        timing: {
          totalTime,
          handsOnTime,
          bestFor,
        },
        notes,
        photo,
        isFavorite: false,
        isBuiltIn: false,
        timesUsed: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.recipes.add(recipe);

      showToast(t('addRecipe.toastAdded', { name }), 'success');
      handleClose();
    } catch (error) {
      console.error('Failed to add recipe:', error);
      showToast(t('addRecipe.toastAddFailed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setName('');
    setDescription('');
    setCategory('country_loaf');
    setTotalFlour(500);
    setHydration(settings.defaultHydration);
    setStarterPercent(settings.defaultStarterPercent);
    setSaltPercent(settings.defaultSaltPercent);
    setTotalTime('12-16 hours');
    setHandsOnTime('30 minutes');
    setBestFor('Weekend baking');
    setNotes('');
    setFlourBreakdown([{ type: 'Bread flour', percent: 100 }]);
    setAdditions([]);
    setMethod([]);
    setPhoto(undefined);
    onClose();
  };

  // Flour breakdown helpers
  const addFlour = () => {
    setFlourBreakdown([...flourBreakdown, { type: '', percent: 0 }]);
  };

  const updateFlour = (index: number, field: keyof FlourComponent, value: string | number) => {
    const updated = [...flourBreakdown];
    updated[index] = { ...updated[index], [field]: value };
    setFlourBreakdown(updated);
  };

  const removeFlour = (index: number) => {
    setFlourBreakdown(flourBreakdown.filter((_, i) => i !== index));
  };

  // Additions helpers
  const addAddition = () => {
    setAdditions([...additions, { name: '', percent: 0, addAt: '' }]);
  };

  const updateAddition = (index: number, field: keyof Addition, value: string | number) => {
    const updated = [...additions];
    updated[index] = { ...updated[index], [field]: value };
    setAdditions(updated);
  };

  const removeAddition = (index: number) => {
    setAdditions(additions.filter((_, i) => i !== index));
  };

  // Photo helpers
  const handleTakePhoto = async (source: 'camera' | 'gallery') => {
    try {
      const capturedPhoto = await takePhoto(source);
      if (capturedPhoto) {
        // Save the photo and get the stored path
        const savedPhoto = await savePhoto(capturedPhoto, `recipe_new`);
        if (savedPhoto) {
          setPhoto(savedPhoto.webviewPath);
          showToast(t('addRecipe.toastPhotoAdded'), 'success');
        }
      }
    } catch (error) {
      console.error('Failed to capture photo:', error);
      showToast(t('addRecipe.toastPhotoFailed'), 'error');
    }
  };

  const removePhoto = () => {
    setPhoto(undefined);
  };

  // Method helpers
  const addStep = () => {
    const newOrder = method.length > 0 ? Math.max(...method.map(s => s.order)) + 1 : 1;
    setMethod([...method, { order: newOrder, step: '', description: '', duration: 0, waitTime: 0 }]);
  };

  const updateStep = (index: number, field: keyof MethodStep, value: string | number) => {
    const updated = [...method];
    updated[index] = { ...updated[index], [field]: value };
    setMethod(updated);
  };

  const removeStep = (index: number) => {
    setMethod(method.filter((_, i) => i !== index));
  };

  const footerContent = (
    <div className="flex gap-3">
      <Button variant="secondary" onClick={handleClose} className="flex-1">
        {t('common.cancel')}
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !name.trim()}
        isLoading={isSubmitting}
        className="flex-1"
      >
        {t('addRecipe.submitButton')}
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={t('addRecipe.title')} footer={footerContent}>
      <div className="space-y-5">
        {/* Recipe Photo */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            {t('addRecipe.photoLabel')}
          </label>
          {photo ? (
            <div className="relative">
              <img
                src={photo}
                alt={t('addRecipe.photoAlt')}
                className="w-full h-48 object-cover rounded-xl"
              />
              <button
                type="button"
                onClick={removePhoto}
                aria-label={t('addRecipe.removePhotoLabel')}
                className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTakePhoto('camera')}
                className="flex-1 flex flex-col items-center gap-2 p-4 bg-crumb-100 dark:bg-crust-800 rounded-xl border-2 border-dashed border-crumb-300 dark:border-crust-600 hover:border-crust-400 dark:hover:border-crust-500 transition-colors"
              >
                <Camera className="w-6 h-6 text-crust-500 dark:text-crumb-400" />
                <span className="text-sm text-crust-600 dark:text-crumb-400">{t('addRecipe.takePhoto')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleTakePhoto('gallery')}
                className="flex-1 flex flex-col items-center gap-2 p-4 bg-crumb-100 dark:bg-crust-800 rounded-xl border-2 border-dashed border-crumb-300 dark:border-crust-600 hover:border-crust-400 dark:hover:border-crust-500 transition-colors"
              >
                <ImageIcon className="w-6 h-6 text-crust-500 dark:text-crumb-400" />
                <span className="text-sm text-crust-600 dark:text-crumb-400">{t('addRecipe.fromGallery')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <Input
          label={t('addRecipe.nameLabel')}
          placeholder={t('addRecipe.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {/* Description */}
        <Textarea
          label={t('addRecipe.descriptionLabel')}
          placeholder={t('addRecipe.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
            {t('addRecipe.categoryLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  category === option.value
                    ? 'bg-crust-600 text-white'
                    : 'bg-crumb-200 dark:bg-crust-700 text-crust-600 dark:text-crumb-300'
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-3">
            {t('addRecipe.keyMetricsLabel')}
          </label>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-crust-600 dark:text-crumb-400 w-24">
                {t('addRecipe.totalFlourLabel')}
              </label>
              <div className="flex-1 max-w-[180px]">
                <NumberInput
                  value={totalFlour}
                  onChange={setTotalFlour}
                  min={100}
                  max={2000}
                  step={50}
                  unit="g"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-crust-600 dark:text-crumb-400 w-24">
                {t('addRecipe.hydrationLabel')}
              </label>
              <div className="flex-1 max-w-[180px]">
                <NumberInput
                  value={hydration}
                  onChange={setHydration}
                  min={50}
                  max={200}
                  step={1}
                  unit="%"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-crust-600 dark:text-crumb-400 w-24">
                {t('addRecipe.starterPercentLabel')}
              </label>
              <div className="flex-1 max-w-[180px]">
                <NumberInput
                  value={starterPercent}
                  onChange={setStarterPercent}
                  min={5}
                  max={50}
                  step={1}
                  unit="%"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-crust-600 dark:text-crumb-400 w-24">
                {t('addRecipe.saltPercentLabel')}
              </label>
              <div className="flex-1 max-w-[180px]">
                <NumberInput
                  value={saltPercent}
                  onChange={setSaltPercent}
                  min={1}
                  max={6}
                  step={0.1}
                  unit="%"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Timing */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-3">
            {t('addRecipe.timingLabel')}
          </label>
          <div className="space-y-3">
            <Input
              label={t('addRecipe.totalTimeLabel')}
              placeholder={t('addRecipe.totalTimePlaceholder')}
              value={totalTime}
              onChange={(e) => setTotalTime(e.target.value)}
            />
            <Input
              label={t('addRecipe.handsOnTimeLabel')}
              placeholder={t('addRecipe.handsOnTimePlaceholder')}
              value={handsOnTime}
              onChange={(e) => setHandsOnTime(e.target.value)}
            />
            <Input
              label={t('addRecipe.bestForLabel')}
              placeholder={t('addRecipe.bestForPlaceholder')}
              value={bestFor}
              onChange={(e) => setBestFor(e.target.value)}
            />
          </div>
        </div>

        {/* Flour Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200">
              {t('addRecipe.flourBreakdownLabel')}
            </label>
            <Button variant="ghost" size="sm" onClick={addFlour} leftIcon={<Plus className="w-4 h-4" />}>
              {t('common.add')}
            </Button>
          </div>
          <div className="space-y-2">
            {flourBreakdown.map((flour, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder={t('addRecipe.flourTypePlaceholder')}
                    value={flour.type}
                    onChange={(e) => updateFlour(index, 'type', e.target.value)}
                  />
                </div>
                <div className="w-20 flex-shrink-0">
                  <NumberInput
                    value={flour.percent}
                    onChange={(v) => updateFlour(index, 'percent', v)}
                    min={0}
                    max={100}
                    step={5}
                    unit="%"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeFlour(index)}
                  aria-label={t('addRecipe.removeFlourLabel')}
                  className="p-2 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
            {flourBreakdown.length === 0 && (
              <p className="text-sm text-crust-500 dark:text-crumb-500 italic">{t('addRecipe.noFlourBreakdown')}</p>
            )}
          </div>
        </div>

        {/* Additions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200">
              {t('addRecipe.additionsLabel')}
            </label>
            <Button variant="ghost" size="sm" onClick={addAddition} leftIcon={<Plus className="w-4 h-4" />}>
              {t('common.add')}
            </Button>
          </div>
          <div className="space-y-2">
            {additions.map((addition, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder={t('addRecipe.ingredientPlaceholder')}
                    value={addition.name}
                    onChange={(e) => updateAddition(index, 'name', e.target.value)}
                  />
                </div>
                <div className="w-16 flex-shrink-0">
                  <NumberInput
                    value={addition.percent}
                    onChange={(v) => updateAddition(index, 'percent', v)}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                  />
                </div>
                <div className="w-24 flex-shrink-0">
                  <Input
                    placeholder={t('addRecipe.whenPlaceholder')}
                    value={addition.addAt || ''}
                    onChange={(e) => updateAddition(index, 'addAt', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAddition(index)}
                  aria-label={t('addRecipe.removeAdditionLabel')}
                  className="p-2 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
            {additions.length === 0 && (
              <p className="text-sm text-crust-500 dark:text-crumb-500 italic">{t('addRecipe.noAdditions')}</p>
            )}
          </div>
        </div>

        {/* Method Steps */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-crust-700 dark:text-crumb-200">
              {t('addRecipe.methodStepsLabel')}
            </label>
            <Button variant="ghost" size="sm" onClick={addStep} leftIcon={<Plus className="w-4 h-4" />}>
              {t('addRecipe.addStep')}
            </Button>
          </div>
          <div className="space-y-4">
            {method.map((step, index) => (
              <div key={index} className="p-3 bg-crumb-100 dark:bg-crust-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                    {t('addRecipe.stepNumber', { order: step.order })}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeStep(index)} aria-label={t('addRecipe.deleteStepLabel')}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
                <Input
                  placeholder={t('addRecipe.stepNamePlaceholder')}
                  value={step.step}
                  onChange={(e) => updateStep(index, 'step', e.target.value)}
                />
                <Textarea
                  placeholder={t('addRecipe.stepDescriptionPlaceholder')}
                  value={step.description}
                  onChange={(e) => updateStep(index, 'description', e.target.value)}
                  rows={2}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-crust-500 dark:text-crumb-500">{t('addRecipe.activeMinutesLabel')}</label>
                    <NumberInput
                      value={step.duration}
                      onChange={(v) => updateStep(index, 'duration', v)}
                      min={0}
                      max={120}
                      step={5}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-crust-500 dark:text-crumb-500">{t('addRecipe.waitMinutesLabel')}</label>
                    <NumberInput
                      value={step.waitTime}
                      onChange={(v) => updateStep(index, 'waitTime', v)}
                      min={0}
                      max={1440}
                      step={5}
                    />
                  </div>
                </div>
                <Input
                  placeholder={t('addRecipe.tipsPlaceholder')}
                  value={step.tips || ''}
                  onChange={(e) => updateStep(index, 'tips', e.target.value)}
                />
              </div>
            ))}
            {method.length === 0 && (
              <p className="text-sm text-crust-500 dark:text-crumb-500 italic">{t('addRecipe.noMethodSteps')}</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <Textarea
          label={t('addRecipe.notesLabel')}
          placeholder={t('addRecipe.notesPlaceholder')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
    </BottomSheet>
  );
}
