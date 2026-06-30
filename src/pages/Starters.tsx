import { motion } from 'framer-motion';
import { Plus, Beaker, Clock, Droplets, ChevronRight, Home, Snowflake } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import { getStorageLocation } from '../lib/storage';
import { formatDistanceToNow } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';

export function StartersPage() {
  const { openModal, navigateTo } = useAppStore();

  // Use live query for reactive updates
  const starters = useLiveQuery(
    () => db.starters.orderBy('name').toArray(),
    []
  );
  const isLoading = starters === undefined;

  const getHealthColor = (score?: number) => {
    if (!score) return 'bg-crumb-200 dark:bg-crust-800 text-crust-600 dark:text-crumb-400';
    if (score >= 80) return 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400';
    if (score >= 50) return 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400';
    return 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400';
  };

  const getFeedingStatus = (lastFed?: Date) => {
    if (!lastFed) return { status: 'unknown', label: 'Never fed' };

    const hoursSinceFed = (Date.now() - new Date(lastFed).getTime()) / (1000 * 60 * 60);

    if (hoursSinceFed < 8) return { status: 'healthy', label: 'Recently fed' };
    if (hoursSinceFed < 24) return { status: 'ok', label: 'Ready to use' };
    if (hoursSinceFed < 48) return { status: 'hungry', label: 'Needs feeding' };
    return { status: 'starving', label: 'Feed urgently!' };
  };

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
            Starters
          </h1>
          <p className="text-crust-600 dark:text-crumb-400 mt-1">
            Manage your sourdough cultures
          </p>
        </div>
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => openModal('new-starter')}
        >
          Add
        </Button>
      </motion.div>

      {/* Starters List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 bg-crumb-100 dark:bg-crust-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : starters && starters.length > 0 ? (
        <div className="space-y-4">
          {starters.map((starter, index) => {
            const feedingStatus = getFeedingStatus(starter.lastFed);

            return (
              <motion.div
                key={starter.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  variant="elevated"
                  padding="none"
                  pressable
                  onPress={() => {
                    navigateTo('starter-detail', { starterId: starter.uuid });
                  }}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-crumb-200 to-crumb-300 dark:from-crust-700 dark:to-crust-800 flex items-center justify-center">
                        {starter.photoUri ? (
                          <img
                            src={starter.photoUri}
                            alt={starter.name}
                            className="w-full h-full object-cover rounded-2xl"
                          />
                        ) : (
                          <Beaker className="w-7 h-7 text-crust-500 dark:text-crumb-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 truncate">
                            {starter.name}
                          </h3>
                          {!starter.isActive && (
                            <span className="px-2 py-0.5 text-xs bg-crumb-200 dark:bg-crust-700 text-crust-600 dark:text-crumb-400 rounded-full">
                              Inactive
                            </span>
                          )}
                          {getStorageLocation(starter.storageLocation) === 'fridge' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full flex-shrink-0">
                              <Snowflake className="w-3 h-3" />
                              Fridge
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-honey-100 dark:bg-honey-900/30 text-honey-700 dark:text-honey-400 rounded-full flex-shrink-0">
                              <Home className="w-3 h-3" />
                              Room
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-sm text-crust-500 dark:text-crumb-500">
                          <span className="flex items-center gap-1">
                            <Droplets className="w-3.5 h-3.5" />
                            {starter.hydration}%
                          </span>
                          <span>{starter.flourType}</span>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${getHealthColor(
                              starter.healthScore
                            )}`}
                          >
                            {starter.healthScore ? `${starter.healthScore}% health` : 'No score'}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              feedingStatus.status === 'healthy'
                                ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400'
                                : feedingStatus.status === 'ok'
                                ? 'bg-honey-100 dark:bg-honey-900/30 text-honey-700 dark:text-honey-400'
                                : feedingStatus.status === 'hungry'
                                ? 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400'
                                : feedingStatus.status === 'starving'
                                ? 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400'
                                : 'bg-crumb-200 dark:bg-crust-800 text-crust-600 dark:text-crumb-400'
                            }`}
                          >
                            {feedingStatus.label}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="w-5 h-5 text-crumb-400 dark:text-crust-600 mt-2" />
                    </div>

                    {/* Last fed info */}
                    {starter.lastFed && (
                      <div className="mt-3 pt-3 border-t border-crumb-100 dark:border-crust-800 flex items-center gap-2 text-sm text-crust-500 dark:text-crumb-500">
                        <Clock className="w-4 h-4" />
                        <span>
                          Fed {formatDistanceToNow(new Date(starter.lastFed))} ago
                        </span>
                        {starter.averagePeakTime && (
                          <span className="ml-auto">
                            Peak: ~{starter.averagePeakTime}h
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Action */}
                  <div className="border-t border-crumb-100 dark:border-crust-800">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('feed-starter', { starterId: starter.uuid });
                      }}
                      className="w-full py-3 text-sm font-medium text-crust-600 dark:text-crumb-400 hover:bg-crumb-50 dark:hover:bg-crust-800/50 transition-colors"
                    >
                      Feed Now
                    </button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          <Card padding="lg" className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-crumb-100 dark:bg-crust-800 flex items-center justify-center">
              <Beaker className="w-8 h-8 text-crust-500 dark:text-crumb-400" />
            </div>
            <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-2">
              No starters yet
            </h3>
            <p className="text-crust-600 dark:text-crumb-400 mb-4">
              Add your sourdough starter to begin tracking feedings
            </p>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => openModal('new-starter')}
            >
              Add Your Starter
            </Button>
          </Card>

          {/* Creating a Starter Guide */}
          <Card padding="md" className="bg-honey-50 dark:bg-honey-950/20 border-honey-200 dark:border-honey-800">
            <h4 className="font-medium text-honey-800 dark:text-honey-200 mb-3">
              🌾 Creating a Starter from Scratch
            </h4>
            <div className="space-y-3 text-sm text-honey-700 dark:text-honey-300">
              <div>
                <p className="font-medium mb-1">Day 1: Mix</p>
                <p>50g whole grain rye flour + 50g lukewarm water. Cover loosely and keep at 26-28°C.</p>
              </div>
              <div>
                <p className="font-medium mb-1">Days 2-7: Feed Daily</p>
                <p>Discard half, add 50g flour + 50g water. Look for bubbles and a tangy smell.</p>
              </div>
              <div>
                <p className="font-medium mb-1">Ready to Use</p>
                <p>When it doubles in 4-6 hours and passes the float test, it's ready! This takes 7-14 days.</p>
              </div>
            </div>
          </Card>

          {/* Tips */}
          <Card padding="md">
            <h4 className="font-medium text-crust-800 dark:text-crumb-100 mb-2">
              💡 Pro Tips
            </h4>
            <ul className="space-y-2 text-sm text-crust-600 dark:text-crumb-400">
              <li>• Use organic flour for best results</li>
              <li>• Whole grain rye activates faster than white flour</li>
              <li>• Warmer temps (26-28°C) speed up fermentation</li>
              <li>• Feed when it peaks and starts to fall</li>
              <li>• A healthy starter smells like beer and yogurt</li>
            </ul>
          </Card>
        </motion.div>
      )}

      {/* Tips Section */}
      {starters && starters.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Card padding="md" className="bg-honey-50 dark:bg-honey-950/20 border-honey-200 dark:border-honey-800">
            <h4 className="font-medium text-honey-800 dark:text-honey-200 mb-2">
              💡 Feeding Ratios
            </h4>
            <div className="space-y-2 text-sm text-honey-700 dark:text-honey-300">
              <p><strong>1:1:1</strong> — Peak in 4-6 hours. Use when baking soon.</p>
              <p><strong>1:6:6</strong> — Peak in 10-12 hours. Great for daily maintenance.</p>
              <p className="text-xs mt-2 opacity-75">Ratio = starter : water : flour (by weight)</p>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
