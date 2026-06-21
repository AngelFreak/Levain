import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, BookOpen, Star, Calendar, ChefHat, Clock, Droplets, Search, Play } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import type { Bake, Recipe, RecipeCategory } from '../types';
import { format } from 'date-fns';

type BookTab = 'recipes' | 'journal';

const RECIPE_CATEGORIES: { id: RecipeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'country_loaf', label: 'Country' },
  { id: 'buns', label: 'Buns & Rolls' },
  { id: 'sandwich', label: 'Sandwich' },
  { id: 'focaccia', label: 'Focaccia' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'rye', label: 'Rye Bread' },
  { id: 'whole_grain', label: 'Whole Grain' },
  { id: 'enriched', label: 'Enriched' },
  { id: 'specialty', label: 'Specialty' },
  { id: 'discard', label: 'Discard' },
];

export function BookPage() {
  const { openModal, navigateTo } = useAppStore();
  const [activeTab, setActiveTab] = useState<BookTab>('recipes');

  // Bakes state
  const [bakes, setBakes] = useState<Bake[]>([]);
  const [bakesLoading, setBakesLoading] = useState(true);
  const [bakesFilter, setBakesFilter] = useState<'all' | 'favorites'>('all');

  // Recipes state
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'all'>('all');

  // Legacy compatibility
  const isLoading = activeTab === 'journal' ? bakesLoading : recipesLoading;

  // Load bakes
  useEffect(() => {
    const loadBakes = async () => {
      let data: Bake[];
      if (bakesFilter === 'favorites') {
        // Note: Dexie doesn't support boolean index queries, using filter
        data = await db.bakes.filter((b) => b.isFavorite === true).toArray();
        // Sort by date descending (not indexed for this query)
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else {
        data = await db.bakes.orderBy('date').reverse().toArray();
      }
      setBakes(data);
      setBakesLoading(false);
    };
    loadBakes();
  }, [bakesFilter]);

  // Load recipes function
  const loadRecipes = async () => {
    let data: Recipe[];
    if (selectedCategory === 'all') {
      data = await db.recipes.orderBy('name').toArray();
    } else {
      data = await db.recipes.where('category').equals(selectedCategory).toArray();
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      data = data.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query)
      );
    }

    setRecipes(data);
    setRecipesLoading(false);
  };

  // Load recipes on mount and when filters change
  useEffect(() => {
    loadRecipes();
  }, [selectedCategory, searchQuery]);

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-3.5 h-3.5 ${
              star <= rating
                ? 'fill-honey-500 text-honey-500'
                : 'text-crumb-300 dark:text-crust-700'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
            Book
          </h1>
          <p className="text-crust-600 dark:text-crumb-400 mt-1">
            {activeTab === 'recipes' ? 'Your recipe collection' : 'Your baking history'}
          </p>
        </div>
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => openModal(activeTab === 'recipes' ? 'new-recipe' : 'start-bake')}
        >
          {activeTab === 'recipes' ? 'Add Recipe' : 'Log Bake'}
        </Button>
      </motion.div>

      {/* Main Tabs: Recipes / Journal */}
      <div className="flex gap-2 mb-4 border-b border-crumb-200 dark:border-crust-700">
        <button
          onClick={() => setActiveTab('recipes')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'recipes'
              ? 'border-crust-600 text-crust-800 dark:text-crumb-100'
              : 'border-transparent text-crust-500 dark:text-crumb-500 hover:text-crust-700 dark:hover:text-crumb-300'
          }`}
        >
          <ChefHat className="w-5 h-5" />
          Recipes
        </button>
        <button
          onClick={() => setActiveTab('journal')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'journal'
              ? 'border-crust-600 text-crust-800 dark:text-crumb-100'
              : 'border-transparent text-crust-500 dark:text-crumb-500 hover:text-crust-700 dark:hover:text-crumb-300'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          Journal
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'recipes' ? (
          <motion.div
            key="recipes"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
          >
            {/* Search */}
            <div className="mb-4">
              <Input
                placeholder="Search recipes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>

            {/* Categories - horizontal scroll */}
            <div className="relative mb-2">
              {/* Fade indicator - only on right side */}
              <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-warmWhite dark:from-charcoal to-transparent z-10 pointer-events-none" />

              <div className="flex gap-2 overflow-x-auto pr-6 pb-1 snap-x snap-mandatory">
                {RECIPE_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors snap-start flex-shrink-0 ${
                      selectedCategory === category.id
                        ? 'bg-crust-600 text-white'
                        : 'bg-crumb-200 dark:bg-crust-700 text-crust-600 dark:text-crumb-300'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipes Grid */}
            {recipesLoading ? (
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-48 bg-crumb-100 dark:bg-crust-800 rounded-2xl animate-pulse"
                  />
                ))}
              </div>
            ) : recipes.length > 0 ? (
              <div className="space-y-3">
                {recipes.map((recipe, index) => (
                  <motion.div
                    key={recipe.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card
                      variant="default"
                      padding="md"
                      pressable
                      onPress={() => navigateTo('recipe-detail', { recipeId: recipe.uuid })}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-crumb-200 to-crumb-300 dark:from-crust-700 dark:to-crust-800 flex items-center justify-center flex-shrink-0">
                          {recipe.photo ? (
                            <img
                              src={recipe.photo}
                              alt={recipe.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <ChefHat className="w-6 h-6 text-crumb-400 dark:text-crust-500" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium text-crust-800 dark:text-crumb-100 leading-tight">
                              {recipe.name}
                            </h3>
                            {recipe.isFavorite && (
                              <Star className="w-4 h-4 fill-honey-500 text-honey-500 flex-shrink-0" />
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1 text-xs text-crust-500 dark:text-crumb-500">
                            <span className="flex items-center gap-1">
                              <Droplets className="w-3 h-3" />
                              {recipe.hydration}%
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {recipe.timing.handsOnTime}
                            </span>
                          </div>

                          {/* Quick Bake button */}
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              leftIcon={<Play className="w-3.5 h-3.5" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                openModal('plan-bake', { recipeId: recipe.uuid });
                              }}
                            >
                              Bake
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Card padding="lg" className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-crumb-100 dark:bg-crust-800 flex items-center justify-center">
                    <ChefHat className="w-8 h-8 text-crust-500 dark:text-crumb-400" />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-2">
                    {searchQuery ? 'No recipes found' : 'No recipes yet'}
                  </h3>
                  <p className="text-crust-600 dark:text-crumb-400 mb-4">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Add your favorite bread recipes'}
                  </p>
                  {!searchQuery && (
                    <Button
                      leftIcon={<Plus className="w-4 h-4" />}
                      onClick={() => openModal('new-recipe')}
                    >
                      Add Recipe
                    </Button>
                  )}
                </Card>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="journal"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {/* Journal (Bakes) Filters */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setBakesFilter('all')}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  bakesFilter === 'all'
                    ? 'bg-crust-600 text-white'
                    : 'bg-crumb-200 dark:bg-crust-700 text-crust-600 dark:text-crumb-300'
                }`}
              >
                All Bakes
              </button>
              <button
                onClick={() => setBakesFilter('favorites')}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  bakesFilter === 'favorites'
                    ? 'bg-crust-600 text-white'
                    : 'bg-crumb-200 dark:bg-crust-700 text-crust-600 dark:text-crumb-300'
                }`}
              >
                Favorites
              </button>
            </div>

      {/* Stats Summary */}
      {bakes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3 mb-6"
        >
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-mono font-bold text-crust-800 dark:text-crumb-100">
              {bakes.length}
            </p>
            <p className="text-xs text-crust-500 dark:text-crumb-500">
              Total Bakes
            </p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-mono font-bold text-crust-800 dark:text-crumb-100">
              {bakes.length > 0
                ? (
                    bakes.reduce((sum, b) => sum + b.results.overall, 0) / bakes.length
                  ).toFixed(1)
                : '0'}
            </p>
            <p className="text-xs text-crust-500 dark:text-crumb-500">
              Avg Rating
            </p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-mono font-bold text-crust-800 dark:text-crumb-100">
              {bakes.filter((b) => b.isFavorite).length}
            </p>
            <p className="text-xs text-crust-500 dark:text-crumb-500">
              Favorites
            </p>
          </Card>
        </motion.div>
      )}

      {/* Bakes List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 bg-crumb-100 dark:bg-crust-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : bakes.length > 0 ? (
        <div className="space-y-4">
          {bakes.map((bake, index) => (
            <motion.div
              key={bake.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                variant="default"
                padding="none"
                pressable
                onPress={() => {
                  // TODO: Navigate to bake detail
                  console.log('View bake:', bake.id);
                }}
              >
                <div className="flex">
                  {/* Photo */}
                  <div className="w-24 h-24 flex-shrink-0 bg-crumb-100 dark:bg-crust-800 rounded-l-2xl overflow-hidden">
                    {bake.photos[0] ? (
                      <img
                        src={bake.photos[0].uri}
                        alt={bake.recipeName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-crumb-300 dark:text-crust-600" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-3 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium text-crust-800 dark:text-crumb-100 truncate">
                          {bake.recipeName}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          {renderStars(bake.results.overall)}
                        </div>
                      </div>
                      {bake.isFavorite && (
                        <Star className="w-4 h-4 fill-honey-500 text-honey-500 flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-xs text-crust-500 dark:text-crumb-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(bake.date), 'MMM d')}
                      </span>
                      <span>{bake.ingredients.hydration}% hydration</span>
                    </div>

                    {bake.tags.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-hidden">
                        {bake.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-[10px] bg-crumb-100 dark:bg-crust-800 text-crust-600 dark:text-crumb-400 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card padding="lg" className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-crumb-100 dark:bg-crust-800 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-crust-500 dark:text-crumb-400" />
            </div>
            <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-2">
              No bakes logged yet
            </h3>
            <p className="text-crust-600 dark:text-crumb-400 mb-4">
              Start tracking your bakes to see patterns and improve
            </p>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => openModal('start-bake')}
            >
              Log Your First Bake
            </Button>
          </Card>
        </motion.div>
      )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
