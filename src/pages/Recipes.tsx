import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, ChefHat, Star, Clock, Droplets, Search } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import type { Recipe, RecipeCategory } from '../types';

const CATEGORIES: { id: RecipeCategory | 'all'; label: string }[] = [
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

export function RecipesPage() {
  const { openModal } = useAppStore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'all'>('all');

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
    setIsLoading(false);
  };

  useEffect(() => {
    loadRecipes();
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen pb-24 px-4 pt-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
            Recipes
          </h1>
          <p className="text-crust-600 dark:text-crumb-400 mt-1">
            Your bread collection
          </p>
        </div>
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => openModal('new-recipe')}
        >
          Add
        </Button>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-4"
      >
        <Input
          placeholder="Search recipes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </motion.div>

      {/* Categories */}
      <div className="flex gap-2 mb-1 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-1">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-6 py-3 rounded-xl text-base font-medium whitespace-nowrap transition-colors touch-target ${
              selectedCategory === category.id
                ? 'bg-crust-600 text-white'
                : 'bg-crumb-100 dark:bg-crust-800 text-crust-700 dark:text-crumb-300'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Recipes Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 bg-crumb-100 dark:bg-crust-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : recipes.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {recipes.map((recipe, index) => (
            <motion.div
              key={recipe.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                variant="default"
                padding="none"
                pressable
                onPress={() => {
                  // TODO: Navigate to recipe detail
                  console.log('View recipe:', recipe.id);
                }}
                className="overflow-hidden"
              >
                {/* Photo */}
                <div className="h-28 bg-gradient-to-br from-crumb-200 to-crumb-300 dark:from-crust-700 dark:to-crust-800 relative">
                  {recipe.photo ? (
                    <img
                      src={recipe.photo}
                      alt={recipe.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ChefHat className="w-10 h-10 text-crumb-400 dark:text-crust-600" />
                    </div>
                  )}

                  {/* Favorite badge */}
                  {recipe.isFavorite && (
                    <div className="absolute top-2 right-2" role="img" aria-label="Favorite">
                      <Star className="w-5 h-5 fill-honey-500 text-honey-500 drop-shadow" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-3">
                  <h3 className="font-medium text-crust-800 dark:text-crumb-100 truncate">
                    {recipe.name}
                  </h3>

                  <div className="flex items-center gap-3 mt-2 text-xs text-crust-500 dark:text-crumb-500">
                    <span className="flex items-center gap-1">
                      <Droplets className="w-3 h-3" />
                      {recipe.hydration}%
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {recipe.timing.totalTime}
                    </span>
                  </div>

                  {recipe.timesUsed > 0 && (
                    <p className="text-[10px] text-crust-400 dark:text-crumb-600 mt-2">
                      Made {recipe.timesUsed} time{recipe.timesUsed > 1 ? 's' : ''}
                    </p>
                  )}
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

    </div>
  );
}
