import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Star,
  Droplets,
  Wheat,
  FlaskConical,
  Calendar,
  Pencil,
  Trash2,
  BookOpen,
  Beaker,
  ThermometerSun,
  Sparkles,
  Camera,
  ImageIcon,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';
import { Card, Button, ActionSheet, Badge } from '../components/ui';
import { EditBakeModal } from '../components/modals/EditBakeModal';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { db } from '../lib/db';
import { takePhoto, photoToBase64 } from '../lib/photos';
import { analyzeCrumb, MissingApiKeyError } from '../lib/claude';
import { analyzeCrumbLocal } from '../lib/crumbVision';
import { format, formatDistanceToNow } from 'date-fns';
import type { Bake, Rating, Starter } from '../types';

interface BakeDetailPageProps {
  bakeId: string;
}

const FOLD_LABELS: Record<string, string> = {
  stretch_fold: 'Stretch & fold',
  coil_fold: 'Coil fold',
  lamination: 'Lamination',
  slap_fold: 'Slap & fold',
};
const PROOF_LABELS: Record<string, string> = {
  room_temp: 'Room temp',
  cold_retard: 'Cold retard',
  proofbox: 'Proof box',
};
const SHAPE_LABELS: Record<string, string> = {
  boule: 'Boule',
  batard: 'Bâtard',
  baguette: 'Baguette',
  focaccia: 'Focaccia',
  other: 'Other',
};

const PROOF_LABEL: Record<'under' | 'good' | 'over', string> = {
  under: 'Under-proofed',
  good: 'Well proofed',
  over: 'Over-proofed',
};
const PROOF_BADGE: Record<'under' | 'good' | 'over', 'warning' | 'success' | 'error'> = {
  under: 'warning',
  good: 'success',
  over: 'error',
};

function Stars({ value }: { value: Rating }) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3, 4, 5] as Rating[]).map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${
            s <= value ? 'fill-honey-500 text-honey-500' : 'text-crumb-300 dark:text-crust-600'
          }`}
        />
      ))}
    </div>
  );
}

export function BakeDetailPage({ bakeId }: BakeDetailPageProps) {
  const { goBackFromPage, showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const [bake, setBake] = useState<Bake | null>(null);
  const [starter, setStarter] = useState<Starter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCrumbSheet, setShowCrumbSheet] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const hasClaudeKey = Boolean(settings.claudeApiKey?.trim());

  const loadBake = async () => {
    const data = await db.bakes.where('uuid').equals(bakeId).first();
    setBake(data ?? null);
    if (data?.starterId) {
      const s = await db.starters.where('uuid').equals(data.starterId).first();
      setStarter(s ?? null);
    } else {
      setStarter(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadBake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bakeId]);

  const toggleFavorite = async () => {
    if (!bake?.id) return;
    const next = !bake.isFavorite;
    await db.bakes.update(bake.id, { isFavorite: next });
    setBake({ ...bake, isFavorite: next });
    showToast(next ? 'Added to favorites' : 'Removed from favorites', 'success');
  };

  const deleteBake = async () => {
    if (!bake?.id) return;
    try {
      await db.bakes.delete(bake.id);
      showToast('Bake deleted', 'success');
      goBackFromPage();
    } catch {
      showToast('Failed to delete bake', 'error');
    }
  };

  const handleAnalyzeCrumb = async (source: 'camera' | 'gallery', method: 'local' | 'claude') => {
    if (!bake?.id) return;
    setIsAnalyzing(true);
    try {
      const photo = await takePhoto(source);
      if (!photo) {
        setIsAnalyzing(false);
        return; // user cancelled
      }
      const base64 = await photoToBase64(photo);
      if (!base64) {
        showToast('Could not read that photo. Please try again.', 'error');
        return;
      }
      const ctx = { hydration: bake.ingredients.hydration };
      const analysis =
        method === 'claude'
          ? await analyzeCrumb(base64, ctx)
          : await analyzeCrumbLocal(base64);

      await db.bakes.update(bake.id, { crumbAnalysis: analysis });
      setBake({ ...bake, crumbAnalysis: analysis });
      showToast(method === 'claude' ? 'Analyzed with Claude!' : 'Quick estimate ready!', 'success');
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        showToast(error.message, 'error');
      } else {
        console.error('Crumb analysis failed:', error);
        const message =
          error instanceof Error && error.message ? error.message : 'Analysis failed. Please try again.';
        showToast(message, 'error');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 pt-6 pb-24">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-crumb-200 dark:bg-crust-700 rounded" />
          <div className="h-48 bg-crumb-200 dark:bg-crust-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!bake) {
    return (
      <div className="min-h-screen px-4 pt-6 pb-24">
        <Button variant="ghost" onClick={goBackFromPage} leftIcon={<ArrowLeft className="w-5 h-5" />}>
          Back
        </Button>
        <div className="text-center py-12">
          <p className="text-crust-600 dark:text-crumb-400">Bake not found</p>
        </div>
      </div>
    );
  }

  const { results, ingredients, process, baking } = bake;
  const ratingRows: Array<[string, Rating]> = [
    ['Oven spring', results.ovenSpring],
    ['Crumb', results.crumbStructure],
    ['Crust', results.crust],
    ['Flavor', results.flavor],
    ['Sourness', results.sourness],
  ];

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-warmWhite/95 dark:bg-charcoal/95 backdrop-blur-sm px-4 py-3 border-b border-crumb-200 dark:border-crust-700">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={goBackFromPage} leftIcon={<ArrowLeft className="w-5 h-5" />}>
            Back
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)} title="Edit bake">
              <Pencil className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete bake"
              className="text-error-500 hover:text-error-600"
            >
              <Trash2 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleFavorite}>
              <Star className={`w-5 h-5 ${bake.isFavorite ? 'fill-honey-500 text-honey-500' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {bake.photos.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
              {bake.photos.map((p, i) => (
                <img
                  key={p.id || i}
                  src={p.uri}
                  alt={`${bake.recipeName} ${i + 1}`}
                  className="h-40 rounded-2xl object-cover flex-shrink-0"
                />
              ))}
            </div>
          ) : (
            <div className="h-40 bg-gradient-to-br from-crust-500 to-crust-700 rounded-2xl flex items-center justify-center mb-4">
              <BookOpen className="w-16 h-16 text-crumb-300" />
            </div>
          )}

          <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
            {bake.recipeName}
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-crust-600 dark:text-crumb-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {format(new Date(bake.date), 'MMMM d, yyyy')}
            </span>
            {starter && (
              <span className="flex items-center gap-1">
                <Beaker className="w-4 h-4" />
                {starter.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Stars value={results.overall} />
            <span className="text-sm text-crust-500 dark:text-crumb-500">overall</span>
          </div>
        </motion.div>

        {/* Ingredients */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card padding="md">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <Droplets className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{ingredients.hydration}%</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Hydration</p>
              </div>
              <div>
                <FlaskConical className="w-5 h-5 mx-auto text-amber-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{ingredients.starterPercent}%</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Starter</p>
              </div>
              <div>
                <Wheat className="w-5 h-5 mx-auto text-honey-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{ingredients.totalFlour}g</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Flour</p>
              </div>
              <div>
                <Wheat className="w-5 h-5 mx-auto text-crust-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{ingredients.saltPercent}%</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Salt</p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Results ratings */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">Results</h2>
          <Card padding="md">
            <div className="space-y-2">
              {ratingRows.map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-crust-700 dark:text-crumb-300">{label}</span>
                  <Stars value={value} />
                </div>
              ))}
            </div>
            {(results.whatWorked || results.toImprove) && (
              <div className="mt-3 pt-3 border-t border-crumb-100 dark:border-crust-800 space-y-2">
                {results.whatWorked && (
                  <p className="text-sm text-crust-600 dark:text-crumb-400">
                    <span className="font-medium text-success-600 dark:text-success-400">What worked:</span>{' '}
                    {results.whatWorked}
                  </p>
                )}
                {results.toImprove && (
                  <p className="text-sm text-crust-600 dark:text-crumb-400">
                    <span className="font-medium text-honey-600 dark:text-honey-400">To improve:</span>{' '}
                    {results.toImprove}
                  </p>
                )}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Process */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">Process</h2>
          <Card padding="md">
            {bake.processKnown === false ? (
              <p className="text-sm text-crust-500 dark:text-crumb-500 italic">
                Not recorded — this bake was logged from a timeline. Tap edit to add details.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Bulk" value={`${process.bulkTime}h @ ${process.bulkTemp}°C`} />
                <Row label="Folds" value={`${process.folds} × ${FOLD_LABELS[process.foldMethod]}`} />
                <Row
                  label="Proof"
                  value={`${PROOF_LABELS[process.proofMethod]} · ${process.proofTime}h @ ${process.proofTemp}°C`}
                />
                <Row label="Shape" value={SHAPE_LABELS[process.shapeType]} />
              </div>
            )}
          </Card>
        </motion.div>

        {/* Baking */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">Baking</h2>
          <Card padding="md">
            {bake.bakingKnown === false ? (
              <p className="text-sm text-crust-500 dark:text-crumb-500 italic">
                Not recorded — tap edit to add oven details.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Oven" value={`${baking.ovenTemp}°C`} icon={<ThermometerSun className="w-4 h-4" />} />
                {baking.steamMethod && <Row label="Steam" value={baking.steamMethod} />}
                <Row label="Covered" value={`${baking.coveredTime} min`} />
                <Row label="Uncovered" value={`${baking.uncoveredTime} min`} />
                {baking.finalInternalTemp ? (
                  <Row label="Internal" value={`${baking.finalInternalTemp}°C`} />
                ) : null}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Crumb analysis */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100">
              Crumb analysis
            </h2>
            <Button
              variant="ghost"
              size="sm"
              isLoading={isAnalyzing}
              onClick={() => setShowCrumbSheet(true)}
            >
              <Sparkles className="w-4 h-4" />
              {bake.crumbAnalysis ? 'Re-analyze' : 'Analyze'}
            </Button>
          </div>

          {bake.crumbAnalysis ? (
            <Card padding="md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                  {bake.crumbAnalysis.source === 'claude' ? 'Claude Analysis' : 'Quick Estimate'}
                </span>
                <Badge variant={PROOF_BADGE[bake.crumbAnalysis.proofingAssessment]}>
                  {bake.crumbAnalysis.proofingAssessment === 'good' && <CheckCircle2 className="w-3 h-3" />}
                  {PROOF_LABEL[bake.crumbAnalysis.proofingAssessment]}
                </Badge>
              </div>

              <p className="text-sm text-crust-600 dark:text-crumb-400 mb-3">
                {bake.crumbAnalysis.summary}
              </p>

              {/* Scores */}
              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                {([
                  ['Open', bake.crumbAnalysis.scores.openness],
                  ['Even', bake.crumbAnalysis.scores.evenness],
                  ['Ferment', bake.crumbAnalysis.scores.fermentation],
                  ['Gluten', bake.crumbAnalysis.scores.gluten],
                ] as Array<[string, number]>).map(([label, val]) => (
                  <div key={label}>
                    <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{val}/5</p>
                    <p className="text-[10px] text-crust-500 dark:text-crumb-500">{label}</p>
                  </div>
                ))}
              </div>

              {bake.crumbAnalysis.observations.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {bake.crumbAnalysis.observations.map((obs, i) => (
                    <li key={i} className="text-sm text-crust-600 dark:text-crumb-400 flex gap-2">
                      <span className="text-crust-400">•</span>
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              )}
              {bake.crumbAnalysis.suggestions.map((tip, i) => (
                <p key={i} className="text-sm text-honey-700 dark:text-honey-300 flex gap-2 mt-1">
                  <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </p>
              ))}

              <p className="text-xs text-crust-400 dark:text-crumb-600 mt-3">
                {bake.crumbAnalysis.source === 'on-device'
                  ? 'On-device estimate'
                  : `${bake.crumbAnalysis.confidence} confidence`}{' '}
                · analyzed {formatDistanceToNow(new Date(bake.crumbAnalysis.timestamp))} ago
              </p>
              {bake.crumbAnalysis.source === 'on-device' && !hasClaudeKey && (
                <p className="text-xs text-crust-500 dark:text-crumb-500 mt-1">
                  Add a Claude API key in Settings for richer, photo-based feedback.
                </p>
              )}
            </Card>
          ) : (
            <Card padding="md">
              <p className="text-sm text-crust-500 dark:text-crumb-500">
                Take or pick a photo of the crumb (the sliced cross-section) for a read on
                openness, evenness, and proofing.
              </p>
            </Card>
          )}
        </motion.div>

        {/* Notes */}
        {bake.notes && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">Notes</h2>
            <Card padding="md">
              <p className="text-crust-700 dark:text-crumb-300 whitespace-pre-line">{bake.notes}</p>
            </Card>
          </motion.div>
        )}

        {/* Tags */}
        {bake.tags.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="flex flex-wrap gap-2">
              {bake.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 text-xs bg-crumb-100 dark:bg-crust-800 text-crust-600 dark:text-crumb-400 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>
        )}

      </div>

      <EditBakeModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        bakeId={bake.uuid}
        onSave={loadBake}
      />

      {/* Crumb-analysis source picker */}
      <ActionSheet
        isOpen={showCrumbSheet}
        onClose={() => setShowCrumbSheet(false)}
        title="Analyze crumb photo"
        actions={[
          {
            label: 'Quick estimate · Camera',
            icon: <Camera className="w-5 h-5" />,
            onClick: () => handleAnalyzeCrumb('camera', 'local'),
          },
          {
            label: 'Quick estimate · Gallery',
            icon: <ImageIcon className="w-5 h-5" />,
            onClick: () => handleAnalyzeCrumb('gallery', 'local'),
          },
          ...(hasClaudeKey
            ? [
                {
                  label: 'Claude analysis · Camera',
                  icon: <Sparkles className="w-5 h-5" />,
                  onClick: () => handleAnalyzeCrumb('camera', 'claude'),
                },
                {
                  label: 'Claude analysis · Gallery',
                  icon: <Sparkles className="w-5 h-5" />,
                  onClick: () => handleAnalyzeCrumb('gallery', 'claude'),
                },
              ]
            : []),
        ]}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-crust-900 rounded-2xl p-6 max-w-sm w-full shadow-xl"
          >
            <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-2">
              Delete bake?
            </h3>
            <p className="text-crust-600 dark:text-crumb-400 mb-6">
              Delete "{bake.recipeName}" from your journal? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  deleteBake();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 bg-error-500 hover:bg-error-600"
              >
                Delete
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-crust-700 dark:text-crumb-300 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="font-medium text-crust-800 dark:text-crumb-100">{value}</span>
    </div>
  );
}
