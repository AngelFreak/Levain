import { useState, useEffect } from 'react';
import { ChefHat, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Input, NumberInput, BottomSheet, Textarea } from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Bake, Rating } from '../../types';

interface StartBakeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StartBakeModal({ isOpen, onClose }: StartBakeModalProps) {
  const { showToast } = useAppStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Basic Info
  const [recipeName, setRecipeName] = useState('');
  const [selectedStarterId, setSelectedStarterId] = useState('');

  // Step 2: Key Metrics (optional, collapsible)
  const [showMetrics, setShowMetrics] = useState(false);
  const [totalFlour, setTotalFlour] = useState(500);
  const [hydration, setHydration] = useState(75);
  const [bulkTime, setBulkTime] = useState(4);
  const [bulkTemp, setBulkTemp] = useState(23);

  // Step 3: Results (can be added later)
  const [showResults, setShowResults] = useState(false);
  const [overallRating, setOverallRating] = useState<Rating>(3);
  const [notes, setNotes] = useState('');

  // Get active starters for selection
  const starters = useLiveQuery(
    () => db.starters.filter((s) => s.isActive).toArray(),
    []
  );

  // Auto-select first starter if only one exists
  useEffect(() => {
    if (starters?.length === 1 && !selectedStarterId) {
      setSelectedStarterId(starters[0].uuid);
    }
  }, [starters, selectedStarterId]);

  const handleSubmit = async () => {
    if (!recipeName.trim()) {
      showToast('Please enter a recipe name', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const bake: Bake = {
        uuid: crypto.randomUUID(),
        date: new Date(),
        recipeName: recipeName.trim(),
        starterId: selectedStarterId || undefined,
        ingredients: {
          totalFlour,
          hydration,
          starterPercent: 20,
          saltPercent: 2,
          flourBreakdown: [{ type: 'bread', percent: 100 }],
          additions: [],
        },
        process: {
          bulkTime,
          bulkTemp,
          folds: 4,
          foldMethod: 'coil_fold',
          proofMethod: 'cold_retard',
          proofTime: 10,
          proofTemp: 4,
          shapeType: 'boule',
        },
        baking: {
          ovenTemp: 0,
          steamMethod: '',
          coveredTime: 0,
          uncoveredTime: 0,
        },
        // The quick logger captures bulk metrics (when expanded) but no oven
        // details, so flag process known only if the user filled them in.
        processKnown: showMetrics,
        bakingKnown: false,
        environment: {
          ambientTemp: bulkTemp,
        },
        results: {
          ovenSpring: overallRating,
          crumbStructure: overallRating,
          crust: overallRating,
          flavor: overallRating,
          sourness: overallRating,
          overall: overallRating,
          whatWorked: '',
          toImprove: '',
        },
        photos: [],
        notes,
        tags: [],
        isFavorite: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.bakes.add(bake);
      showToast('Bake logged successfully!', 'success');
      handleClose();
    } catch (error) {
      console.error('Failed to log bake:', error);
      showToast('Failed to log bake', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setRecipeName('');
    setSelectedStarterId('');
    setShowMetrics(false);
    setTotalFlour(500);
    setHydration(75);
    setBulkTime(4);
    setBulkTemp(23);
    setShowResults(false);
    setOverallRating(3);
    setNotes('');
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
        disabled={isSubmitting || !recipeName.trim()}
        isLoading={isSubmitting}
        className="flex-1"
      >
        Log Bake
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Log Bake" footer={footerContent}>
      <div className="space-y-5">
        {/* Icon header */}
        <div className="flex justify-center">
          <div className="p-3 bg-crust-100 dark:bg-crust-800 rounded-2xl">
            <ChefHat className="w-8 h-8 text-crust-600 dark:text-crumb-300" />
          </div>
        </div>

        {/* Recipe Name */}
        <Input
          label="Recipe Name"
          placeholder="e.g., Country Loaf, Focaccia"
          value={recipeName}
          onChange={(e) => setRecipeName(e.target.value)}
          autoFocus
        />

        {/* Starter Selection */}
        {starters && starters.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
              Starter Used (optional)
            </label>
            <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedStarterId('')}
                className={`
                  w-full flex items-center justify-between px-4 py-3 text-left
                  ${!selectedStarterId
                    ? 'bg-honey-50 dark:bg-honey-900/20'
                    : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                  }
                `}
              >
                <span className={`font-medium text-sm ${
                  !selectedStarterId
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}>
                  None / Commercial Yeast
                </span>
                {!selectedStarterId && (
                  <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
              {starters.map((starter) => (
                <button
                  key={starter.uuid}
                  type="button"
                  onClick={() => setSelectedStarterId(starter.uuid)}
                  className={`
                    w-full flex items-center justify-between px-4 py-3 text-left
                    border-t border-crumb-200/50 dark:border-crust-700/50
                    ${selectedStarterId === starter.uuid
                      ? 'bg-honey-50 dark:bg-honey-900/20'
                      : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                    }
                  `}
                >
                  <span className={`font-medium text-sm ${
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
            <span className="text-sm text-crust-600 dark:text-crumb-400">Using:</span>
            <span className="font-medium text-crust-800 dark:text-crumb-100">
              {selectedStarter.name}
            </span>
          </div>
        )}

        {/* Key Metrics (Collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowMetrics(!showMetrics)}
            className="flex items-center justify-between w-full py-2 text-sm text-crust-600 dark:text-crumb-400 hover:text-crust-800 dark:hover:text-crumb-200"
          >
            <span>{showMetrics ? '− Hide' : '+ Add'} bake details</span>
            {showMetrics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showMetrics && (
            <div className="space-y-3 mt-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-24">
                  Total Flour
                </label>
                <div className="flex-1 max-w-[180px]">
                  <NumberInput
                    value={totalFlour}
                    onChange={setTotalFlour}
                    min={100}
                    max={5000}
                    step={50}
                    unit="g"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-24">
                  Hydration
                </label>
                <div className="flex-1 max-w-[180px]">
                  <NumberInput
                    value={hydration}
                    onChange={setHydration}
                    min={50}
                    max={100}
                    step={1}
                    unit="%"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-24">
                  Bulk Time
                </label>
                <div className="flex-1 max-w-[180px]">
                  <NumberInput
                    value={bulkTime}
                    onChange={setBulkTime}
                    min={1}
                    max={24}
                    step={0.5}
                    unit="h"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-24">
                  Room Temp
                </label>
                <div className="flex-1 max-w-[180px]">
                  <NumberInput
                    value={bulkTemp}
                    onChange={setBulkTemp}
                    min={15}
                    max={35}
                    step={1}
                    unit="°C"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Results (Collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowResults(!showResults)}
            className="flex items-center justify-between w-full py-2 text-sm text-crust-600 dark:text-crumb-400 hover:text-crust-800 dark:hover:text-crumb-200"
          >
            <span>{showResults ? '− Hide' : '+ Add'} quick rating</span>
            {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showResults && (
            <div className="space-y-4 mt-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              {/* Star Rating */}
              <div>
                <label className="block text-xs font-medium text-crust-700 dark:text-crumb-200 mb-2">
                  Overall Rating
                </label>
                <div className="flex gap-2 justify-center" role="group" aria-label="Overall rating">
                  {([1, 2, 3, 4, 5] as Rating[]).map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setOverallRating(star)}
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      aria-pressed={star <= overallRating}
                      className="p-1 touch-target"
                    >
                      <Star
                        aria-hidden="true"
                        className={`w-8 h-8 transition-colors ${
                          star <= overallRating
                            ? 'fill-honey-500 text-honey-500'
                            : 'text-crumb-300 dark:text-crust-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <Textarea
                label="Notes"
                placeholder="How did it turn out? Any observations..."
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
