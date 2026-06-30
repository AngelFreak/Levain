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
import type { Bake, Rating, BakePhoto } from '../../types';

interface EditBakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeId: string;
  onSave?: () => void;
}

const RATING_FIELDS: Array<{ key: keyof Pick<Bake['results'], 'overall' | 'ovenSpring' | 'crumbStructure' | 'crust' | 'flavor' | 'sourness'>; label: string }> = [
  { key: 'overall', label: 'Overall' },
  { key: 'ovenSpring', label: 'Oven spring' },
  { key: 'crumbStructure', label: 'Crumb' },
  { key: 'crust', label: 'Crust' },
  { key: 'flavor', label: 'Flavor' },
  { key: 'sourness', label: 'Sourness' },
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
  return (
    <div className="flex gap-1" role="group" aria-label={label ? `${label} rating` : 'Rating'}>
      {([1, 2, 3, 4, 5] as Rating[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-label={`${label ? `${label}: ` : ''}${s} star${s > 1 ? 's' : ''}`}
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
        showToast('Photo added!', 'success');
      }
    } catch (error) {
      console.error('Failed to add photo:', error);
      showToast('Failed to add photo', 'error');
    }
  };

  const handleSubmit = async () => {
    if (!bake?.id) return;
    if (!recipeName.trim()) {
      showToast('Please enter a name', 'error');
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
      showToast('Bake updated!', 'success');
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Failed to update bake:', error);
      showToast('Failed to update bake', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex gap-3">
      <Button variant="ghost" onClick={onClose} className="flex-1">
        Cancel
      </Button>
      <Button onClick={handleSubmit} isLoading={isSubmitting} className="flex-1">
        Save Changes
      </Button>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Edit Bake" footer={footer}>
      <div className="space-y-5">
        <Input label="Name" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />

        <DateField label="Date" value={dateStr} onChange={setDateStr} />

        {/* Recipe link */}
        {recipes && recipes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
              Linked recipe (prefills ingredients)
            </label>
            <select
              value={recipeId ?? ''}
              onChange={(e) => linkRecipe(e.target.value || undefined)}
              className="w-full px-3 py-2.5 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 bg-surface1 dark:bg-surfaceDark1 text-crust-800 dark:text-crumb-100"
            >
              <option value="">None</option>
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
              Starter used
            </label>
            <select
              value={starterId ?? ''}
              onChange={(e) => setStarterId(e.target.value || undefined)}
              className="w-full px-3 py-2.5 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 bg-surface1 dark:bg-surfaceDark1 text-crust-800 dark:text-crumb-100"
            >
              <option value="">None / commercial yeast</option>
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
          <IngredientRow label="Total flour" value={totalFlour} onChange={setTotalFlour} min={100} max={5000} step={50} unit="g" />
          <IngredientRow label="Hydration" value={hydration} onChange={setHydration} min={40} max={120} step={1} unit="%" />
          <IngredientRow label="Starter" value={starterPercent} onChange={setStarterPercent} min={0} max={50} step={1} unit="%" />
          <IngredientRow label="Salt" value={saltPercent} onChange={setSaltPercent} min={0} max={6} step={0.1} unit="%" />
        </div>

        {/* Ratings */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">Ratings</label>
          <div className="space-y-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
            {RATING_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-crust-700 dark:text-crumb-200">{label}</span>
                <StarPicker value={ratings[key]} onChange={(r) => setRating(key, r)} label={label} />
              </div>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">Photos</label>
          <div className="flex gap-2 flex-wrap">
            {photos.map((p, i) => (
              <div key={p.id || i} className="relative">
                <img src={p.uri} alt={`bake ${i + 1}`} className="w-20 h-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-error-500 text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleAddPhoto('camera')}
              aria-label="Take photo"
              className="w-20 h-20 rounded-xl border-2 border-dashed border-crumb-300 dark:border-crust-600 flex items-center justify-center text-crust-400"
            >
              <Camera className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => handleAddPhoto('gallery')}
              aria-label="Choose from gallery"
              className="w-20 h-20 rounded-xl border-2 border-dashed border-crumb-300 dark:border-crust-600 flex items-center justify-center text-crust-400"
            >
              <ImageIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">Tags</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-crumb-100 dark:bg-crust-800 text-crust-700 dark:text-crumb-300 rounded-full"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button variant="secondary" onClick={addTag} type="button" aria-label="Add tag">
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
            <span>{showProcess ? '− Hide' : '+ Add'} process & baking</span>
            {showProcess ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showProcess && (
            <div className="space-y-3 mt-2 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
              <IngredientRow label="Bulk time" value={bulkTime} onChange={setBulkTime} min={0} max={24} step={0.5} unit="h" />
              <IngredientRow label="Bulk temp" value={bulkTemp} onChange={setBulkTemp} min={10} max={40} step={1} unit="°C" />
              <IngredientRow label="Proof time" value={proofTime} onChange={setProofTime} min={0} max={48} step={0.5} unit="h" />
              <IngredientRow label="Oven temp" value={ovenTemp} onChange={setOvenTemp} min={150} max={500} step={5} unit="°C" />
            </div>
          )}
        </div>

        {/* Notes */}
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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
