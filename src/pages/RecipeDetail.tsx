import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Droplets,
  Clock,
  ChefHat,
  Star,
  ExternalLink,
  Wheat,
  FlaskConical,
  Copy,
  Pencil,
  Trash2,
  Play,
  Gauge,
  Timer,
  Pizza,
} from 'lucide-react';
import { Card, Button } from '../components/ui';
import { EditRecipeModal } from '../components/modals/EditRecipeModal';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import type { Recipe } from '../types';

interface RecipeDetailPageProps {
  recipeId: string;
}

/** Format a step timer (seconds) into a compact human label, metric/24h-friendly. */
function formatTimer(seconds: number): string {
  // Keep sub-minute and ragged short timers in seconds so values like a
  // 90 s pizza bake are preserved exactly rather than rounded to minutes.
  if (seconds < 120 && seconds % 60 !== 0) return `${seconds} s`;
  if (seconds < 60) return `${seconds} s`;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function RecipeDetailPage({ recipeId }: RecipeDetailPageProps) {
  const { goBackFromPage, showToast, navigateTo, openModal } = useAppStore();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const recipeData = await db.recipes.where('uuid').equals(recipeId).first();
      if (recipeData) {
        setRecipe(recipeData);
      }
      setIsLoading(false);
    };

    loadData();
  }, [recipeId]);

  const toggleFavorite = async () => {
    if (!recipe?.id) return;
    try {
      const newFavorite = !recipe.isFavorite;
      await db.recipes.update(recipe.id, { isFavorite: newFavorite });
      setRecipe({ ...recipe, isFavorite: newFavorite });
      showToast(newFavorite ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (error) {
      showToast('Failed to update favorite', 'error');
    }
  };

  const forkRecipe = async () => {
    if (!recipe) return;
    try {
      const newUuid = crypto.randomUUID();
      const now = new Date();
      const forkedRecipe: Omit<Recipe, 'id'> = {
        ...recipe,
        uuid: newUuid,
        name: `${recipe.name} (Copy)`,
        isFavorite: false,
        isBuiltIn: false, // Forked recipes are user-owned and editable
        timesUsed: 0,
        lastUsed: undefined,
        createdAt: now,
        updatedAt: now,
        syncedAt: undefined,
        // Clear source attribution for user's copy
        sourceAttribution: recipe.sourceAttribution ? `Forked from: ${recipe.sourceAttribution}` : undefined,
      };
      // Remove the id so Dexie auto-generates a new one
      delete (forkedRecipe as Recipe).id;

      await db.recipes.add(forkedRecipe as Recipe);
      showToast('Recipe forked! You can now edit your copy.', 'success');
      // Navigate to the new recipe
      navigateTo('recipe-detail', { recipeId: newUuid });
    } catch (error) {
      showToast('Failed to fork recipe', 'error');
    }
  };

  const reloadRecipe = async () => {
    const recipeData = await db.recipes.where('uuid').equals(recipeId).first();
    if (recipeData) {
      setRecipe(recipeData);
    }
  };

  const deleteRecipe = async () => {
    if (!recipe?.id) return;
    try {
      await db.recipes.delete(recipe.id);
      showToast('Recipe deleted', 'success');
      goBackFromPage();
    } catch (error) {
      showToast('Failed to delete recipe', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 pt-6 pb-24">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-crumb-200 dark:bg-crust-700 rounded" />
          <div className="h-48 bg-crumb-200 dark:bg-crust-700 rounded-2xl" />
          <div className="h-24 bg-crumb-200 dark:bg-crust-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen px-4 pt-6 pb-24">
        <Button variant="ghost" onClick={goBackFromPage} leftIcon={<ArrowLeft className="w-5 h-5" />}>
          Back
        </Button>
        <div className="text-center py-12">
          <p className="text-crust-600 dark:text-crumb-400">Recipe not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-warmWhite/95 dark:bg-charcoal/95 backdrop-blur-sm px-4 py-3 border-b border-crumb-200 dark:border-crust-700">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBackFromPage}
            leftIcon={<ArrowLeft className="w-5 h-5" />}
          >
            Back
          </Button>
          <div className="flex items-center gap-1">
            {/* Edit button - only for user-created recipes */}
            {!recipe.isBuiltIn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit recipe"
              >
                <Pencil className="w-5 h-5" />
              </Button>
            )}
            {/* Delete button - only for user-created recipes */}
            {!recipe.isBuiltIn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete recipe"
                className="text-error-500 hover:text-error-600"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
            {/* Fork button - for built-in recipes to create editable copy */}
            {recipe.isBuiltIn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={forkRecipe}
                title="Fork recipe to create your own copy"
              >
                <Copy className="w-5 h-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFavorite}
            >
              <Star className={`w-5 h-5 ${recipe.isFavorite ? 'fill-honey-500 text-honey-500' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="h-40 bg-gradient-to-br from-crust-500 to-crust-700 rounded-2xl flex items-center justify-center mb-4">
            {recipe.photo ? (
              <img src={recipe.photo} alt={recipe.name} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <ChefHat className="w-16 h-16 text-crumb-300" />
            )}
          </div>

          <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
            {recipe.name}
          </h1>
          <p className="text-crust-600 dark:text-crumb-400 mt-2">
            {recipe.description}
          </p>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card padding="md">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <Droplets className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{recipe.hydration}%</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Hydration</p>
              </div>
              <div>
                <FlaskConical className="w-5 h-5 mx-auto text-amber-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{recipe.starterPercent}%</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Starter</p>
              </div>
              <div>
                <Wheat className="w-5 h-5 mx-auto text-honey-500 mb-1" />
                <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{recipe.totalFlour}g</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Flour</p>
              </div>
              <div>
                <Clock className="w-5 h-5 mx-auto text-crust-500 mb-1" />
                <p className="text-sm font-semibold text-crust-800 dark:text-crumb-100">{recipe.timing.handsOnTime}</p>
                <p className="text-xs text-crust-500 dark:text-crumb-500">Hands-on</p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Timing */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card padding="md" className="bg-honey-50 dark:bg-honey-950/20 border-honey-200 dark:border-honey-800">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-honey-600" />
              <span className="font-medium text-honey-800 dark:text-honey-200">Timing</span>
            </div>
            <p className="text-sm text-honey-700 dark:text-honey-300">
              <span className="font-medium">Total:</span> {recipe.timing.totalTime}
            </p>
            <p className="text-sm text-honey-700 dark:text-honey-300">
              <span className="font-medium">Best for:</span> {recipe.timing.bestFor}
            </p>
          </Card>
        </motion.div>

        {/* Yield (portioned doughs, e.g. pizza) */}
        {recipe.yield && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <Card padding="md">
              <div className="flex items-center gap-2 mb-3">
                <Pizza className="w-4 h-4 text-crust-600 dark:text-crumb-400" />
                <span className="font-medium text-crust-800 dark:text-crumb-100">Yield</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{recipe.yield.balls}</p>
                  <p className="text-xs text-crust-500 dark:text-crumb-500">Dough balls</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{recipe.yield.ballWeightG} g</p>
                  <p className="text-xs text-crust-500 dark:text-crumb-500">Per ball</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-crust-800 dark:text-crumb-100">{recipe.yield.pizzaDiameterCm} cm</p>
                  <p className="text-xs text-crust-500 dark:text-crumb-500">Diameter</p>
                </div>
              </div>
              {recipe.totalDoughWeight && (
                <p className="text-xs text-center text-crust-500 dark:text-crumb-500 mt-3">
                  ~{recipe.totalDoughWeight} g total dough
                </p>
              )}
            </Card>
          </motion.div>
        )}

        {/* Ingredients (weighed list with baker's %) */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">
              Ingredients
            </h2>
            <Card padding="md">
              <div className="space-y-2">
                {recipe.ingredients.map((ingredient, i) => (
                  <div key={i} className="flex justify-between items-baseline gap-3">
                    <span className="text-crust-700 dark:text-crumb-300">{ingredient.name}</span>
                    <span className="flex items-baseline gap-2 flex-shrink-0">
                      <span className="font-medium text-crust-800 dark:text-crumb-100">
                        {ingredient.amount} {ingredient.unit}
                      </span>
                      <span className="text-xs text-crust-500 dark:text-crumb-500">
                        {ingredient.bakersPercent}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Flour Breakdown */}
        {recipe.flourBreakdown.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">
              Flour Breakdown
            </h2>
            <Card padding="md">
              <div className="space-y-2">
                {recipe.flourBreakdown.map((flour, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-crust-700 dark:text-crumb-300">{flour.type}</span>
                    <span className="font-medium text-crust-800 dark:text-crumb-100">{flour.percent}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Additions */}
        {recipe.additions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">
              Additions
            </h2>
            <Card padding="md">
              <div className="space-y-2">
                {recipe.additions.map((addition, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-crust-700 dark:text-crumb-300">{addition.name}</span>
                    <span className="text-sm text-crust-500 dark:text-crumb-500">
                      {addition.percent > 0 ? `${addition.percent}%` : ''} {addition.addAt && `(${addition.addAt})`}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Method Steps */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">
            Method
          </h2>
          <div className="space-y-3">
            {recipe.method.map((step, i) => (
              <Card key={i} padding="md">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-crust-600 text-white flex items-center justify-center text-sm font-medium flex-shrink-0">
                    {step.order}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-crust-800 dark:text-crumb-100">{step.step}</h3>
                    <p className="text-sm text-crust-600 dark:text-crumb-400 mt-1">{step.description}</p>
                    {step.tips && (
                      <p className="text-sm text-honey-600 dark:text-honey-400 mt-2 italic">
                        Tip: {step.tips}
                      </p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-crust-500 dark:text-crumb-500">
                      {step.duration > 0 && (
                        <span>Active: {step.duration} min</span>
                      )}
                      {step.waitTime > 0 && (
                        <span>Wait: {step.waitTime} min</span>
                      )}
                    </div>
                    {(step.mixer || step.timerSeconds) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {step.mixer && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-crust-100 dark:bg-crust-800 text-crust-700 dark:text-crumb-300">
                            <Gauge className="w-3 h-3" />
                            {step.mixer.percent}% · {step.mixer.rpm} RPM
                          </span>
                        )}
                        {step.timerSeconds != null && step.timerSeconds > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-honey-100 dark:bg-honey-950/30 text-honey-700 dark:text-honey-300">
                            <Timer className="w-3 h-3" />
                            {formatTimer(step.timerSeconds)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Notes */}
        {recipe.notes && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-3">
              Notes
            </h2>
            <Card padding="md">
              <p className="text-crust-700 dark:text-crumb-300">{recipe.notes}</p>
            </Card>
          </motion.div>
        )}

        {/* Source Attribution */}
        {recipe.sourceAttribution && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="pb-4"
          >
            <Card padding="md" className="bg-crumb-100 dark:bg-crust-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-crust-500 dark:text-crumb-500">Recipe by</p>
                  <p className="font-medium text-crust-700 dark:text-crumb-300">{recipe.sourceAttribution}</p>
                </div>
                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-crust-600 hover:text-crust-800 dark:text-crumb-400 dark:hover:text-crumb-200"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Bake Button - Fixed at bottom, above navigation */}
      <div className="fixed bottom-24 left-4 right-4 z-10">
        <Button
          className="w-full"
          leftIcon={<Play className="w-5 h-5" />}
          onClick={() => openModal('plan-bake', { recipeId: recipe.uuid })}
        >
          Bake This Recipe
        </Button>
      </div>

      {/* Edit Recipe Modal */}
      <EditRecipeModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        recipeId={recipe.uuid}
        onSave={reloadRecipe}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-crust-900 rounded-2xl p-6 max-w-sm w-full shadow-xl"
          >
            <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-2">
              Delete Recipe?
            </h3>
            <p className="text-crust-600 dark:text-crumb-400 mb-6">
              Are you sure you want to delete "{recipe.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  deleteRecipe();
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
