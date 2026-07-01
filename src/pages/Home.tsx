import { motion } from 'framer-motion';
import {
  Clock,
  Beaker,
  Plus,
  ChevronRight,
  Timer,
  Settings,
  ChefHat,
} from 'lucide-react';
import { Button, Card } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ActiveTimeline } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '../lib/i18n/useTranslation';

export function HomePage() {
  const { setActiveTab, openModal, navigateTo } = useAppStore();
  const { t } = useTranslation();

  // Use live queries for reactive data
  // Note: Dexie doesn't support boolean index queries, using filter
  const starters = useLiveQuery(
    () => db.starters.filter((s) => s.isActive === true).toArray(),
    []
  );

  const recentBakes = useLiveQuery(
    () => db.bakes.orderBy('date').reverse().limit(3).toArray(),
    []
  );

  // All active timelines (not just the first) so concurrent bakes are reachable.
  const activeTimelines = useLiveQuery(async () => {
    const active = await db.activeTimelines.where('status').equals('active').toArray();
    return active.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, []) as ActiveTimeline[] | undefined;

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header with Settings */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Levain"
            className="w-12 h-12 drop-shadow-md"
          />
          <div>
            <h1 className="text-3xl font-display font-bold text-crust-800 dark:text-crumb-100">
              Levain
            </h1>
            <p className="text-crust-600 dark:text-crumb-400 mt-1">
              {t('home.subtitle')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('settings')}
          aria-label={t('home.openSettings')}
          className="w-10 h-10 rounded-full bg-crumb-100 dark:bg-crust-800 text-crust-600 dark:text-crumb-400 flex items-center justify-center"
        >
          <Settings className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Active Bake Banner */}
      {activeTimelines && activeTimelines.length > 0 && (
        <div className="mb-6 space-y-3">
          {activeTimelines.map((timeline, index) => (
            <motion.div
              key={timeline.uuid}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                variant="elevated"
                padding="none"
                pressable
                onPress={() => navigateTo('active-bake', { timelineId: timeline.uuid })}
                className="bg-gradient-to-br from-crust-600 to-crust-700 text-white overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase tracking-wide opacity-90">
                      {activeTimelines.length > 1
                        ? t('home.activeBakeNumbered', { number: index + 1 })
                        : t('home.activeBake')}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{timeline.name}</h3>
                  <div className="flex items-center gap-4 text-sm opacity-90">
                    <span>
                      {t('home.stepOfTotal', {
                        current: timeline.currentStepIndex + 1,
                        total: timeline.steps.length,
                      })}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="h-1 bg-white/20">
                  <div
                    className="h-full bg-white/80"
                    style={{
                      width: `${((timeline.currentStepIndex + 1) / timeline.steps.length) * 100}%`,
                    }}
                  />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Bake Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <Card
          variant="elevated"
          padding="none"
          pressable
          onPress={() => setActiveTab('book')}
          className="bg-gradient-to-br from-honey-500 to-honey-600 text-white"
        >
          <div className="flex items-center gap-4 p-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <ChefHat className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-display font-semibold">{t('home.bake')}</h3>
              <p className="text-sm opacity-90">{t('home.bakeSubtitle')}</p>
            </div>
            <ChevronRight className="w-6 h-6 opacity-80" />
          </div>
        </Card>
      </motion.div>

      {/* Starters Section */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100">
            {t('home.yourStarters')}
          </h2>
          <button
            onClick={() => setActiveTab('starters')}
            className="text-sm text-crust-600 dark:text-crumb-400 flex items-center gap-1"
          >
            {t('home.viewAll')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {starters && starters.length > 0 ? (
          <div className="space-y-3">
            {starters.slice(0, 2).map((starter) => (
              <Card key={starter.id} padding="sm" pressable onPress={() => setActiveTab('starters')}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-crumb-200 dark:bg-crust-800 flex items-center justify-center">
                    <Beaker className="w-6 h-6 text-crust-600 dark:text-crumb-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-crust-800 dark:text-crumb-100">
                      {starter.name}
                    </h3>
                    <p className="text-sm text-crust-500 dark:text-crumb-500">
                      {starter.lastFed
                        ? t('home.fedAgo', {
                            time: formatDistanceToNow(new Date(starter.lastFed)),
                          })
                        : t('home.notFedYet')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        starter.healthScore && starter.healthScore >= 80
                          ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                          : starter.healthScore && starter.healthScore >= 50
                          ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                          : 'bg-crumb-200 text-crust-600 dark:bg-crust-800 dark:text-crumb-400'
                      }`}
                    >
                      {starter.healthScore ? `${starter.healthScore}%` : '—'}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card padding="md" className="text-center">
            <Beaker className="w-8 h-8 mx-auto mb-2 text-crumb-400" />
            <p className="text-crust-600 dark:text-crumb-400 mb-3">
              {t('home.noStartersYet')}
            </p>
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => openModal('new-starter')}
            >
              {t('home.addStarter')}
            </Button>
          </Card>
        )}
      </motion.section>

      {/* Recent Bakes */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100">
            {t('home.recentBakes')}
          </h2>
          <button
            onClick={() => setActiveTab('book')}
            className="text-sm text-crust-600 dark:text-crumb-400 flex items-center gap-1"
          >
            {t('home.viewAll')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {recentBakes && recentBakes.length > 0 ? (
          <div className="space-y-3">
            {recentBakes.map((bake) => (
              <Card key={bake.id} padding="sm" pressable onPress={() => setActiveTab('book')}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-crumb-100 dark:bg-crust-800 flex items-center justify-center overflow-hidden">
                    {bake.photos[0] ? (
                      <img
                        src={bake.photos[0].uri}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Clock className="w-5 h-5 text-crust-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-crust-800 dark:text-crumb-100 truncate">
                      {bake.recipeName}
                    </h3>
                    <p className="text-sm text-crust-500 dark:text-crumb-500">
                      {t('home.timeAgo', {
                        time: formatDistanceToNow(new Date(bake.date)),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-honey-500">
                    {'★'.repeat(bake.results.overall)}
                    <span className="text-crumb-300 dark:text-crust-700">
                      {'★'.repeat(5 - bake.results.overall)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card padding="md" className="text-center">
            <Clock className="w-8 h-8 mx-auto mb-2 text-crumb-400" />
            <p className="text-crust-600 dark:text-crumb-400">
              {t('home.noBakesYet')}
            </p>
          </Card>
        )}
      </motion.section>
    </div>
  );
}
