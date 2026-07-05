import { useState, useEffect } from 'react';
import { Star, Camera, ImageIcon, X, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Button,
  Input,
  NumberInput,
  Textarea,
  BottomSheet,
  DateField,
  toDateInputValue,
  fromDateInputValue,
} from '../ui';
import { db } from '../../lib/db';
import { useAppStore } from '../../stores/appStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { takePhoto, savePhoto } from '../../lib/photos';
import { useTranslation } from '../../lib/i18n/useTranslation';
import type { TranslationKey } from '../../lib/i18n';
import type { Bake, Rating, BakePhoto } from '../../types';

interface EditBakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeId: string;
  onSave?: () => void;
}

const RATING_FIELDS: Array<{ key: keyof Pick<Bake['results'], 'overall' | 'ovenSpring' | 'crumbStructure' | 'crust' | 'flavor' | 'sourness'>; labelKey: TranslationKey }> = [
  { key: 'overall', labelKey: 'editBake.ratingOverall' },
  { key: 'ovenSpring', labelKey: 'editBake.ratingOvenSpring' },
  { key: 'crumbStructure', labelKey: 'editBake.ratingCrumb' },
  { key: 'crust', labelKey: 'editBake.ratingCrust' },
  { key: 'flavor', labelKey: 'editBake.ratingFlavor' },
  { key: 'sourness', labelKey: 'editBake.ratingSourness' },
];

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: Rating;
  onChange: (r: Rating) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex gap-1"
      role="group"
      aria-label={label ? t('editBake.ratingGroupNamed', { label }) : t('editBake.ratingGroup')}
    >
      {([1, 2, 3, 4, 5] as Rating[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-label={
            label
              ? t('editBake.starAriaNamed', { label, count: s })
              : t('editBake.starAria', { count: s })
          }
          aria-pressed={s <= value}
          className="p-0.5"
        >
          <Star
            aria-hidden="true"
            className={`w-6 h-6 ${
              s <= value ? 'fill-honey-500 text-honey-500' : 'text-crumb-300 dark:text-crust-600'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function EditBakeModal({ isOpen, onClose, bakeId, onSave }: EditBakeModalProps) {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []);
  const starters = useLiveQuery(() => db.starters.toArray(), []);

  const [bake, setBake] = useState<Bake | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editable fields
  const [recipeName, setRecipeName] = useState('');
  const [recipeId, setRecipeId] = useState<string | undefined>();
  const [starterId, setStarterId] = useState<string | undefined>();
  const [dateStr, setDateStr] = useState('');
  const [totalFlour, setTotalFlour] = useState(500);
  const [hydration, setHydration] = useState(75);
  const [starterPercent, setStarterPercent] = useState(20);
  const [saltPercent, setSaltPercent] = useState(2);
  const [ratings, setRatings] = useState<Bake['results']>({
    overall: 3, ovenSpring: 3, crumbStructure: 3, crust: 3, flavor: 3, sourness: 3,
    whatWorked: '', toImprove: '',
  });
  const [photos, setPhotos] = useState<BakePhoto[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState('');
  // Process/baking
  const [showProcess, setShowProcess] = useState(false);
  const [bulkTime, setBulkTime] = useState(4);
  const [bulkTemp, setBulkTemp] = useState(23);
  const [proofTime, setProofTime] = useState(2);
  const [ovenTemp, setOvenTemp] = useState(245);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      const data = await db.bakes.where('uuid').equals(bakeId).first();
      if (!data) return;
      setBake(data);
      setRecipeName(data.recipeName);
      setRecipeId(data.recipeId);
      setStarterId(data.starterId);
      setDateStr(toDateInputValue(new Date(data.date)));
      setTotalFlour(data.ingredients.totalFlour);
      setHydration(data.ingredients.hydration);
      setStarterPercent(data.ingredients.starterPercent);
      setSaltPercent(data.ingredients.saltPercent);
      setRatings(data.results);
      setPhotos(data.photos);
      setTags(data.tags);
      setNotes(data.notes);
      setBulkTime(data.process.bulkTime || 4);
      setBulkTemp(data.process.bulkTemp || 23);
      setProofTime(data.process.proofTime || 2);
      setOvenTemp(data.baking.ovenTemp || 245);
      // Expand process if it was already recorded.
      setShowProcess(data.processKnown !== false || data.bakingKnown !== false);
    };
    load();
  }, [isOpen, bakeId]);

  const setRating = (key: string, r: Rating) => setRatings((prev) => ({ ...prev, [key]: r }));

  const linkRecipe = (uuid: string | undefined) => {
    setRecipeId(uuid);
    if (uuid) {
      const r = recipes?.find((x) => x.uuid === uuid);
      if (r) {
        // Prefill ingredients from the recipe's baker's-percent baseline.
        setRecipeName(r.name);
        setTotalFlour(r.totalFlour);
        setHydration(r.hydration);
        setStarterPercent(r.starterPercent);
        setSaltPercent(r.saltPercent);
      }
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleAddPhoto = async (source: 'camera' | 'gallery') => {
    try {
      const captured = await takePhoto(source);
      if (!captured) return;
      const saved = await savePhoto(captured, `bake_${bakeId}`);
      if (saved) {
        setPhotos((prev) => [
          ...prev,
          { id: crypto.randomUUID(), type: 'other', uri: saved.webviewPath, timestamp: new Date() },
        ]);
        showToast(t('editBake.toastPhotoAdded'), 'success');
      }
    } catch (error) {
      console.error('Failed to add photo:', error);
      showToast(t('editBake.toastPhotoFailed'), 'error');
    }
  };

  const handleSubmit = async () => {
    if (!bake?.id) return;
    if (!recipeName.trim()) {
      showToast(t('editBake.toastEnterName'), 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await db.bakes.update(bake.id, {
        recipeName: recipeName.trim(),
        recipeId,
        starterId,
        date: fromDateInputValue(dateStr),
        ingredients: {
          ...bake.ingredients,
          totalFlour,
          hydration,
          starterPercent,
          saltPercent,
        },
        process: { ...bake.process, bulkTime, bulkTemp, proofTime },
        baking: { ...bake.baking, ovenTemp },
        // Once edited with details, mark them as recorded.
        processKnown: true,
        bakingKnown: true,
        results: ratings,
        photos,
        tags,
        notes,
        updatedAt: new Date(),
      });
      showToast(t('editBake.toastUpdated'), 'success');
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Failed to update bake:', error);
      showToast(t('editBake.toastUpdateFailed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex gap-3">
      <Button variant="ghost" onClick={onClose} className="flex-1">
        {t('common.cancel')}
      </Button>
      <Button onClick={handleSubmit} isLoading={isSubmitting} className="flex-1">
        {t('common.saveChanges')}
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('editBake.title')} footer={footer}>
      <div className="space-y-5">
        <Input label={t('editBake.nameLabel')} value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />

        <DateField label={t('editBake.dateLabel')} value={dateStr} onChange={setDateStr} />

        {/* Recipe link */}
        {recipes && recipes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
              {t('editBake.linkedRecipeLabel')}
            </label>
            <select
              value={recipeId ?? ''}
              onChange={(e) => linkRecipe(e.target.value || undefined)}
              className="w-full px-3 py-2.5 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 bg-surface1 dark:bg-surfaceDark1 text-crust-800 dark:text-crumb-100"
            >
              <option value="">{t('editBake.recipeNone')}</option>
              {recipes.map((r) => (
                <option key={r.uuid} value={r.uuid}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Starter link */}
        {starters && starters.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
              {t('editBake.starterUsedLabel')}
            </label>
            <select
              value={starterId ?? ''}
              onChange={(e) => setStarterId(e.target.value || undefined)}
              className="w-full px-3 py-2.5 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 bg-surface1 dark:bg-surfaceDark1 text-crust-800 dark:text-crumb-100"
            >
              <option value="">{t('editBake.starterNone')}</option>
              {starters.map((s) => (
                <option key={s.uuid} value={s.uuid}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Ingredients */}
        <div className="space-y-3 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
          <IngredientRow label={t('editBake.totalFlour')} value={totalFlour} onChange={setTotalFlour} min={100} max={5000} step={50} unit="g" />
          <IngredientRow label={t('editBake.hydration')} value={hydration} onChange={setHydration} min={40} max={120} step={1} unit="%" />
          <IngredientRow label={t('editBake.starter')} value={starterPercent} onChange={setStarterPercent} min={0} max={50} step={1} unit="%" />
          <IngredientRow label={t('editBake.salt')} value={saltPercent} onChange={setSaltPercent} min={0} max={6} step={0.1} unit="%" />
        </div>

        {/* Ratings */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">{t('editBake.ratingsLabel')}</label>
          <div className="space-y-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
            {RATING_FIELDS.map(({ key, labelKey }) => {
              const label = t(labelKey);
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-crust-700 dark:text-crumb-200">{label}</span>
                  <StarPicker value={ratings[key]} onChange={(r) => setRating(key, r)} label={label} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">{t('editBake.photosLabel')}</label>
          <div className="flex gap-2 flex-wrap">
            {photos.map((p, i) => (
              <div key={p.id || i} className="relative">
                <img src={p.uri} alt={t('editBake.photoAlt', { index: i + 1 })} className="w-20 h-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                  aria-label={t('editBake.removePhoto', { index: i + 1 })}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-error-500 text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleAddPhoto('camera')}
              aria-label={t('editBake.takePhoto')}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-crumb-300 dark:border-crust-600 flex items-center justify-center text-crust-400"
            >
              <Camera className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => handleAddPhoto('gallery')}
              aria-label={t('editBake.chooseFromGallery')}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-crumb-300 dark:border-crust-600 flex items-center justify-center text-crust-400"
            >
              <ImageIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">{t('editBake.tagsLabel')}</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-crumb-100 dark:bg-crust-800 text-crust-700 dark:text-crumb-300 rounded-full"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== tag))}
                  aria-label={t('editBake.removeTag', { tag })}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t('editBake.addTagPlaceholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button variant="secondary" onClick={addTag} type="button" aria-label={t('editBake.addTag')}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Process / baking (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowProcess(!showProcess)}
            className="flex items-center justify-between w-full py-2 text-sm text-crust-600 dark:text-crumb-400"
          >
            <span>{showProcess ? t('editBake.hideProcess') : t('editBake.addProcess')}</span>
            {showProcess ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showProcess && (
            <div className="space-y-3 mt-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <IngredientRow label={t('editBake.bulkTime')} value={bulkTime} onChange={setBulkTime} min={0} max={24} step={0.5} unit="h" />
              <IngredientRow label={t('editBake.bulkTemp')} value={bulkTemp} onChange={setBulkTemp} min={10} max={40} step={1} unit="°C" />
              <IngredientRow label={t('editBake.proofTime')} value={proofTime} onChange={setProofTime} min={0} max={48} step={0.5} unit="h" />
              <IngredientRow label={t('editBake.ovenTemp')} value={ovenTemp} onChange={setOvenTemp} min={150} max={500} step={5} unit="°C" />
            </div>
          )}
        </div>

        {/* Notes */}
        <Textarea label={t('editBake.notesLabel')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
    </BottomSheet>
  );
}

function IngredientRow({
  label, value, onChange, min, max, step, unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm font-medium text-crust-700 dark:text-crumb-200 w-24">{label}</label>
      <div className="flex-1 max-w-[180px]">
        <NumberInput value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} />
      </div>
    </div>
  );
}
