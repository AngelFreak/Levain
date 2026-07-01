import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Beaker,
  Droplets,
  Edit2,
  Trash2,
  Calendar,
  TrendingUp,
  Sparkles,
  Camera,
  ImageIcon,
  CheckCircle2,
  Lightbulb,
  HelpCircle,
  KeyRound,
  Cpu,
  FlaskConical,
  Home,
  Snowflake,
  Recycle,
} from 'lucide-react';
import { Card, Button, ActionSheet, Badge, BottomSheet } from '../components/ui';
import { ConfirmModal } from '../components/ui/Modal';
import { EditStarterModal } from '../components/modals';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PlanFeedModal } from '../components/modals/PlanFeedModal';
import { db, recomputeStarterStats, resetStarterDiscard } from '../lib/db';
import { computeNormalizedPeakSeries } from '../lib/starterStats';
import { formatTime } from '../lib/fermentation';
import { rescheduleFeedingReminder, cancelFeedingReminder } from '../lib/notifications';
import { releaseFeedingReminderId } from '../lib/notificationIds';
import {
  getStorageLocation,
  getStorageLocationMeta,
  FRIDGE_FEEDING_INTERVAL_DAYS,
} from '../lib/storage';
import type { StorageLocation } from '../types';
import { takePhoto, photoToBase64 } from '../lib/photos';
import { analyzeStarter, MissingApiKeyError } from '../lib/claude';
import { analyzeStarterLocal } from '../lib/starterVision';
import { stageBadgeVariant } from '../lib/starterStages';
import { differenceInDays } from 'date-fns';
import { formatDistanceToNow, format } from 'date-fns';
import { useTranslation } from '../lib/i18n/useTranslation';

interface StarterDetailPageProps {
  starterId: string;
}

export function StarterDetailPage({ starterId }: StarterDetailPageProps) {
  const { goBackFromPage, openModal, showToast, openBookAtCategory } = useAppStore();
  const { settings } = useSettingsStore();
  const { t } = useTranslation();
  const hasClaudeKey = Boolean(settings.claudeApiKey?.trim());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPlanFeed, setShowPlanFeed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Live queries so the page reacts to DB changes (feeding, peak-mark, edits,
  // location changes) without needing to navigate away and back.
  // `undefined` = still loading (first run); a row or `null` = resolved.
  const starterResult = useLiveQuery(
    () => db.starters.where('uuid').equals(starterId).first(),
    [starterId]
  );
  const starter = starterResult ?? null;
  const isLoading = starterResult === undefined;

  const feedings = useLiveQuery(async () => {
    const rows = await db.feedings.where('starterId').equals(starterId).toArray();
    rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return rows;
  }, [starterId]) ?? [];

  // Keep feeding-derived stats fresh whenever the feedings change. Writing the
  // recomputed stats back to the starter row re-triggers the starter live query,
  // so tiles/averages update in place. Guard prevents redundant recompute loops.
  useEffect(() => {
    recomputeStarterStats(starterId);
  }, [starterId, feedings.length]);

  // Stamp the current time as the peak for the most recent feeding that hasn't
  // recorded one yet, then recompute stats. This is the capture path that makes
  // averagePeakTime meaningful (the feeding form has no peak-time input).
  const handleMarkPeak = async () => {
    const latestUnpeaked = feedings.find((f) => !f.peakTime);
    if (!latestUnpeaked?.id) {
      showToast(t('starterDetail.toastNoFeedingToMark'), 'info');
      return;
    }
    const hours =
      (Date.now() - new Date(latestUnpeaked.timestamp).getTime()) / (1000 * 60 * 60);
    if (hours < 0.25) {
      showToast(t('starterDetail.toastFeedingJustLogged'), 'info');
      return;
    }
    try {
      await db.feedings.update(latestUnpeaked.id, { peakTime: new Date() });
      await recomputeStarterStats(starterId);
      // Live queries pick up the DB changes automatically.
      showToast(t('starterDetail.toastPeakRecorded', { hours: Math.round(hours) }), 'success');
    } catch (error) {
      console.error('Failed to mark peak:', error);
      showToast(t('starterDetail.toastPeakFailed'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!starter?.id) return;

    try {
      // Cancel any scheduled feeding reminder and free its notification ID.
      await cancelFeedingReminder(starter);
      await releaseFeedingReminderId(starter.uuid);
      // Delete all feedings for this starter
      await db.feedings.where('starterId').equals(starterId).delete();
      // Delete the starter
      await db.starters.delete(starter.id);
      showToast(t('starterDetail.toastDeleted', { name: starter.name }), 'success');
      goBackFromPage();
    } catch (error) {
      showToast(t('starterDetail.toastDeleteFailed'), 'error');
    }
  };

  const handleChangeLocation = async (location: StorageLocation) => {
    if (!starter?.id) return;
    if (getStorageLocation(starter.storageLocation) === location) return;

    try {
      await db.starters.update(starter.id, { storageLocation: location });

      // Re-read so we reschedule against the freshest lastFed (e.g. if the
      // starter was fed via the modal since this page mounted). The live query
      // reflects the DB write; `updated` is just the value passed to reschedule.
      const fresh = (await db.starters.get(starter.id)) ?? starter;
      const updated = { ...fresh, storageLocation: location };

      // Move between room/fridge changes the feeding cadence — reschedule the
      // pending reminder relative to the last feeding using the new interval.
      let scheduledTime: Date | undefined;
      if (settings.notificationsEnabled) {
        const result = await rescheduleFeedingReminder(
          updated,
          settings.feedingRemindersEnabled,
          settings.feedingReminderHours
        );
        scheduledTime = result.scheduledTime;
      }

      const meta = getStorageLocationMeta(location);
      const place = meta.label.toLowerCase();
      if (scheduledTime) {
        showToast(
          location === 'fridge'
            ? t('starterDetail.toastMovedFridge', {
                place,
                days: FRIDGE_FEEDING_INTERVAL_DAYS,
              })
            : t('starterDetail.toastMovedRoom', { place }),
          'success'
        );
      } else {
        showToast(t('starterDetail.toastMoved', { place }), 'success');
      }
    } catch (error) {
      console.error('Failed to change storage location:', error);
      showToast(t('starterDetail.toastMoveFailed'), 'error');
    }
  };

  const handleUsedDiscard = async () => {
    if (!starter) return;
    await resetStarterDiscard(starter.uuid);
    // Live query reflects the reset discardGrams.
    showToast(t('starterDetail.toastDiscardCleared'), 'success');
  };

  const handleAnalyze = async (source: 'camera' | 'gallery', method: 'local' | 'claude') => {
    if (!starter?.id) return;

    setIsAnalyzing(true);
    try {
      const photo = await takePhoto(source);
      if (!photo) {
        // User cancelled the picker — no error.
        setIsAnalyzing(false);
        return;
      }

      const base64 = await photoToBase64(photo);
      if (!base64) {
        showToast(t('starterDetail.toastPhotoUnreadable'), 'error');
        return;
      }

      const ageDays = Math.max(0, differenceInDays(new Date(), new Date(starter.createdDate)));
      const hoursSinceFeed = starter.lastFed
        ? (Date.now() - new Date(starter.lastFed).getTime()) / (1000 * 60 * 60)
        : undefined;
      const ctx = {
        ageDays,
        hydration: starter.hydration,
        flourType: starter.flourType,
        hoursSinceFeed,
        ambientTemp: settings.defaultAmbientTemp,
      };

      const { analysis, healthScore } =
        method === 'claude'
          ? await analyzeStarter(base64, ctx)
          : await analyzeStarterLocal(base64, ctx);

      await db.starters.update(starter.id, { healthScore, lastAnalysis: analysis });
      // Live query reflects the new analysis.
      showToast(
        method === 'claude'
          ? t('starterDetail.toastAnalyzedClaude')
          : t('starterDetail.toastAnalyzedLocal'),
        'success'
      );
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        showToast(error.message, 'error');
      } else {
        console.error('Starter analysis failed:', error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : t('starterDetail.toastAnalysisFailed');
        showToast(message, 'error');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getHealthColor = (score?: number) => {
    if (!score) return 'text-crust-500 dark:text-crumb-500';
    if (score >= 80) return 'text-success-600 dark:text-success-400';
    if (score >= 50) return 'text-warning-600 dark:text-warning-400';
    return 'text-error-600 dark:text-error-400';
  };

  const getFeedingStatus = (lastFed?: Date) => {
    if (!lastFed) return { color: 'text-crust-500', label: t('starterDetail.statusNeverFed') };
    const hoursSinceFed = (Date.now() - new Date(lastFed).getTime()) / (1000 * 60 * 60);
    if (hoursSinceFed < 8) return { color: 'text-success-600', label: t('starterDetail.statusRecentlyFed') };
    if (hoursSinceFed < 24) return { color: 'text-honey-600', label: t('starterDetail.statusReadyToUse') };
    if (hoursSinceFed < 48) return { color: 'text-warning-600', label: t('starterDetail.statusNeedsFeeding') };
    return { color: 'text-error-600', label: t('starterDetail.statusFeedUrgently') };
  };

  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="h-8 w-32 bg-crumb-200 dark:bg-crust-800 rounded animate-pulse mb-6" />
        <div className="h-48 bg-crumb-100 dark:bg-crust-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!starter) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          onClick={goBackFromPage}
          className="flex items-center gap-2 text-crust-600 dark:text-crumb-400 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <Card padding="lg" className="text-center">
          <p className="text-crust-600 dark:text-crumb-400">{t('starterDetail.notFound')}</p>
        </Card>
      </div>
    );
  }

  const feedingStatus = getFeedingStatus(starter.lastFed);
  const peakHistory = computeNormalizedPeakSeries(feedings);

  // A photo analysis describes the starter at the moment it was taken. Once the
  // starter is fed after that, the estimate no longer reflects reality, so hide
  // it (it's superseded). With the live query above, feeding hides it instantly.
  const analysisIsCurrent =
    !!starter.lastAnalysis &&
    (!starter.lastFed ||
      new Date(starter.lastAnalysis.timestamp).getTime() >=
        new Date(starter.lastFed).getTime());

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <button
          onClick={goBackFromPage}
          className="flex items-center gap-2 text-crust-600 dark:text-crumb-400"
        >
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            aria-label={t('starterDetail.helpAriaLabel')}
            className="p-2 rounded-full hover:bg-crumb-100 dark:hover:bg-crust-800"
          >
            <HelpCircle className="w-5 h-5 text-crust-600 dark:text-crumb-400" />
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            aria-label={t('starterDetail.editAriaLabel')}
            className="p-2 rounded-full hover:bg-crumb-100 dark:hover:bg-crust-800"
          >
            <Edit2 className="w-5 h-5 text-crust-600 dark:text-crumb-400" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            aria-label={t('starterDetail.deleteAriaLabel')}
            className="p-2 rounded-full hover:bg-error-50 dark:hover:bg-error-950/20"
          >
            <Trash2 className="w-5 h-5 text-error-500" />
          </button>
        </div>
      </motion.div>

      {/* Starter Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card variant="elevated" padding="lg" className="mb-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-crumb-200 to-crumb-300 dark:from-crust-700 dark:to-crust-800 flex items-center justify-center flex-shrink-0">
              {starter.photoUri ? (
                <img
                  src={starter.photoUri}
                  alt={starter.name}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <Beaker className="w-10 h-10 text-crust-500 dark:text-crumb-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100 truncate">
                  {starter.name}
                </h1>
                {!starter.isActive && (
                  <span className="px-2 py-0.5 text-xs bg-crumb-200 dark:bg-crust-700 text-crust-600 dark:text-crumb-400 rounded-full">
                    {t('starterDetail.inactive')}
                  </span>
                )}
                {getStorageLocation(starter.storageLocation) === 'fridge' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                    <Snowflake className="w-3 h-3" />
                    {t('starterDetail.fridge')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-honey-100 dark:bg-honey-900/30 text-honey-700 dark:text-honey-400 rounded-full">
                    <Home className="w-3 h-3" />
                    {t('starterDetail.room')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-sm text-crust-600 dark:text-crumb-400">
                <span className="flex items-center gap-1">
                  <Droplets className="w-4 h-4" />
                  {t('starterDetail.hydrationLabel', { value: starter.hydration })}
                </span>
                <span>{t('starterDetail.flourLabel', { flour: starter.flourType })}</span>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className={`text-sm font-medium ${feedingStatus.color}`}>
                  {feedingStatus.label}
                </span>
                {starter.lastFed && (
                  <span className="text-sm text-crust-500 dark:text-crumb-500">
                    {t('starterDetail.fedAgo', {
                      ago: formatDistanceToNow(new Date(starter.lastFed)),
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-crumb-100 dark:border-crust-800">
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${getHealthColor(starter.healthScore)}`}
              >
                {starter.healthScore ?? '--'}
              </div>
              <div className="text-xs text-crust-500 dark:text-crumb-500">
                {t('starterDetail.healthScore')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-crust-800 dark:text-crumb-100">
                {starter.averagePeakTime != null ? `${starter.averagePeakTime}h` : '--'}
              </div>
              <div className="text-xs text-crust-500 dark:text-crumb-500">
                {t('starterDetail.avgPeak')}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getHealthColor(starter.feedingStats?.activityScore)}`}>
                {starter.feedingStats?.activityScore ?? '--'}
              </div>
              <div className="text-xs text-crust-500 dark:text-crumb-500">
                {t('starterDetail.activity')}
              </div>
            </div>
          </div>

          {/* Feeding cadence caption */}
          <div className="mt-2 text-center text-xs text-crust-500 dark:text-crumb-500">
            {feedings.length === 1
              ? t('starterDetail.feedingCountOne', { count: feedings.length })
              : t('starterDetail.feedingCountOther', { count: feedings.length })}
            {starter.feedingStats?.medianIntervalDays != null && (
              <>
                {' · '}
                {t('starterDetail.medianInterval', {
                  days: starter.feedingStats.medianIntervalDays,
                })}
              </>
            )}
            {starter.feedingStats != null &&
              starter.feedingStats.peakSampleCount === 0 &&
              feedings.length > 0 && (
                <>
                  {' · '}
                  {t('starterDetail.markPeakHint')}
                </>
              )}
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-4 border-t border-crumb-100 dark:border-crust-800 flex gap-3">
            <Button
              fullWidth
              onClick={() => openModal('feed-starter', { starterId: starter.uuid })}
            >
              <Droplets className="w-4 h-4" />
              {t('starterDetail.feedNow')}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              isLoading={isAnalyzing}
              onClick={() => setShowPhotoSheet(true)}
            >
              <Sparkles className="w-4 h-4" />
              {isAnalyzing ? t('starterDetail.analyzing') : t('starterDetail.analyze')}
            </Button>
          </div>
          {/* Mark peak — captures time-to-peak for the latest feeding */}
          {feedings.some((f) => !f.peakTime) && (
            <Button
              variant="ghost"
              fullWidth
              onClick={handleMarkPeak}
              className="mt-2"
            >
              <TrendingUp className="w-4 h-4" />
              {t('starterDetail.markPeakNow')}
            </Button>
          )}
          {/* Plan a feed — recommend when/what ratio to feed for a target peak */}
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowPlanFeed(true)}
            className="mt-2"
          >
            <Calendar className="w-4 h-4" />
            {t('starterDetail.planAFeed')}
          </Button>
        </Card>
      </motion.div>

      {/* Storage Location */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mb-6"
      >
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-crust-800 dark:text-crumb-100">{t('starterDetail.storage')}</p>
              <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
                {getStorageLocationMeta(starter.storageLocation).description}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleChangeLocation('room')}
              aria-pressed={getStorageLocation(starter.storageLocation) === 'room'}
              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-colors ${
                getStorageLocation(starter.storageLocation) === 'room'
                  ? 'bg-honey-50 dark:bg-honey-900/20 border-honey-400 dark:border-honey-600 text-honey-700 dark:text-honey-400'
                  : 'bg-surface1 dark:bg-surfaceDark1 border-crumb-300/50 dark:border-crust-600/50 text-crust-700 dark:text-crumb-200 active:bg-crumb-100 dark:active:bg-surfaceDark2'
              }`}
            >
              <Home className="w-4 h-4" />
              {t('starterDetail.room')}
            </button>
            <button
              type="button"
              onClick={() => handleChangeLocation('fridge')}
              aria-pressed={getStorageLocation(starter.storageLocation) === 'fridge'}
              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-colors ${
                getStorageLocation(starter.storageLocation) === 'fridge'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                  : 'bg-surface1 dark:bg-surfaceDark1 border-crumb-300/50 dark:border-crust-600/50 text-crust-700 dark:text-crumb-200 active:bg-crumb-100 dark:active:bg-surfaceDark2'
              }`}
            >
              <Snowflake className="w-4 h-4" />
              {t('starterDetail.fridge')}
            </button>
          </div>
        </Card>
      </motion.div>

      {/* Discard tracker */}
      {(starter.discardGrams ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
          className="mb-6"
        >
          <Card
            padding="md"
            className={
              (starter.discardGrams ?? 0) >= 100
                ? 'bg-honey-50 dark:bg-honey-950/20 border-honey-200 dark:border-honey-800'
                : ''
            }
          >
            <div className="flex items-center gap-3">
              <Recycle className="w-5 h-5 text-honey-600 dark:text-honey-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('starterDetail.discardSavedUp', { grams: starter.discardGrams ?? 0 })}
                </p>
                <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
                  {(starter.discardGrams ?? 0) >= 100
                    ? t('starterDetail.discardEnough')
                    : t('starterDetail.discardAccumulating')}
                </p>
              </div>
            </div>
            {(starter.discardGrams ?? 0) >= 100 && (
              <div className="flex gap-2 mt-3">
                <Button
                  fullWidth
                  size="sm"
                  onClick={() => openBookAtCategory('discard')}
                >
                  <Recycle className="w-4 h-4" />
                  {t('starterDetail.discardRecipes')}
                </Button>
                <Button variant="ghost" size="sm" fullWidth onClick={handleUsedDiscard}>
                  {t('starterDetail.usedIt')}
                </Button>
              </div>
            )}
            {(starter.discardGrams ?? 0) < 100 && (
              <button
                onClick={handleUsedDiscard}
                className="text-xs text-crust-500 dark:text-crumb-500 mt-2 underline"
              >
                {t('starterDetail.markUsed')}
              </button>
            )}
          </Card>
        </motion.div>
      )}

      {/* Peak-time history (shown once there are enough recorded peaks) */}
      {peakHistory.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
          className="mb-6"
        >
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-honey-500" />
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('starterDetail.timeToPeak')}
                </p>
              </div>
              <p className="text-xs text-crust-500 dark:text-crumb-500">
                {t('starterDetail.lastNPeaks', { count: peakHistory.length })}
              </p>
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={peakHistory} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip
                    formatter={(v) => [`${v}h`, t('starterDetail.peakTooltip')]}
                    labelFormatter={() => ''}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#d97706' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-crust-500 dark:text-crumb-500 mt-1">
              {t('starterDetail.normalizedCaption', { temp: settings.defaultAmbientTemp })}
            </p>
          </Card>
        </motion.div>
      )}

      {/* Birthday */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <Card padding="md" className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-honey-500" />
          <div>
            <p className="text-sm text-crust-600 dark:text-crumb-400">{t('starterDetail.birthday')}</p>
            <p className="font-medium text-crust-800 dark:text-crumb-100">
              {format(new Date(starter.createdDate), 'MMMM d, yyyy')}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-crust-500 dark:text-crumb-500">
              {t('starterDetail.ageOld', {
                age: formatDistanceToNow(new Date(starter.createdDate)),
              })}
            </p>
          </div>
        </Card>
      </motion.div>

      {/* AI Analysis — only while it still reflects the current state (hidden
          once the starter is fed after the analysis was taken). */}
      {starter.lastAnalysis && analysisIsCurrent && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mb-6"
        >
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-crust-600 dark:text-crumb-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-honey-500" />
                {starter.lastAnalysis.source === 'claude'
                  ? t('starterDetail.claudeAnalysis')
                  : t('starterDetail.quickEstimate')}
              </h3>
              {starter.lastAnalysis.stage && starter.lastAnalysis.stageLabel ? (
                <Badge variant={stageBadgeVariant(starter.lastAnalysis.stage)}>
                  {starter.lastAnalysis.readyToBake && <CheckCircle2 className="w-3 h-3" />}
                  {starter.lastAnalysis.stageLabel}
                </Badge>
              ) : starter.lastAnalysis.readyToBake ? (
                <Badge variant="success">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('starterDetail.readyToBake')}
                </Badge>
              ) : (
                <Badge variant="warning">{t('starterDetail.notReadyYet')}</Badge>
              )}
            </div>

            <p className="text-crust-800 dark:text-crumb-100 mb-3">
              {starter.lastAnalysis.summary}
            </p>

            {starter.lastAnalysis.observations.length > 0 && (
              <ul className="space-y-1 mb-3">
                {starter.lastAnalysis.observations.map((obs, i) => (
                  <li
                    key={i}
                    className="text-sm text-crust-600 dark:text-crumb-400 flex gap-2"
                  >
                    <span className="text-honey-500">•</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ul>
            )}

            {starter.lastAnalysis.suggestions.length > 0 && (
              <div className="rounded-xl bg-honey-50 dark:bg-honey-900/20 p-3 space-y-1">
                {starter.lastAnalysis.suggestions.map((tip, i) => (
                  <p
                    key={i}
                    className="text-sm text-honey-800 dark:text-honey-300 flex gap-2"
                  >
                    <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </p>
                ))}
              </div>
            )}

            <p className="text-xs text-crust-500 dark:text-crumb-500 mt-3">
              {starter.lastAnalysis.source === 'on-device'
                ? t('starterDetail.onDeviceEstimate')
                : t('starterDetail.confidenceLabel', {
                    confidence: starter.lastAnalysis.confidence,
                  })}{' '}
              {t('starterDetail.analyzedAgo', {
                ago: formatDistanceToNow(new Date(starter.lastAnalysis.timestamp)),
              })}
            </p>
            {starter.lastAnalysis.source === 'on-device' && !hasClaudeKey && (
              <p className="text-xs text-crust-400 dark:text-crumb-600 mt-1">
                {t('starterDetail.addKeyForRicherAdvice')}
              </p>
            )}
          </Card>
        </motion.div>
      )}

      {/* Notes */}
      {starter.notes && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <Card padding="md">
            <h3 className="text-sm font-medium text-crust-600 dark:text-crumb-400 mb-2">
              {t('starterDetail.notes')}
            </h3>
            <p className="text-crust-800 dark:text-crumb-100">{starter.notes}</p>
          </Card>
        </motion.div>
      )}

      {/* Feeding History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-honey-500" />
          {t('starterDetail.feedingHistory')}
        </h2>

        {feedings.length > 0 ? (
          <div className="space-y-3">
            {feedings.slice(0, 10).map((feeding, index) => (
              <motion.div
                key={feeding.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
              >
                <Card padding="md">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-crust-800 dark:text-crumb-100">
                        {feeding.ratio}
                      </p>
                      <p className="text-sm text-crust-500 dark:text-crumb-500 mt-0.5">
                        {t('starterDetail.feedingComposition', {
                          starter: feeding.starterWeight,
                          flour: feeding.flourWeight,
                          water: feeding.waterWeight,
                        })}
                      </p>
                      {feeding.notes && (
                        <p className="text-sm text-crust-600 dark:text-crumb-400 mt-1 italic">
                          {feeding.notes}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                        {format(new Date(feeding.timestamp), 'MMM d')}
                      </p>
                      <p className="text-xs text-crust-500 dark:text-crumb-500">
                        {formatTime(new Date(feeding.timestamp), settings.timeFormat)}
                      </p>
                      {feeding.peakTime && (
                        <p className="text-xs text-honey-600 dark:text-honey-400 mt-1">
                          {t('starterDetail.peakedHours', {
                            hours: Math.round(
                              (new Date(feeding.peakTime).getTime() -
                                new Date(feeding.timestamp).getTime()) /
                                (1000 * 60 * 60)
                            ),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}

            {feedings.length > 10 && (
              <p className="text-center text-sm text-crust-500 dark:text-crumb-500 pt-2">
                {t('starterDetail.moreFeedings', { count: feedings.length - 10 })}
              </p>
            )}
          </div>
        ) : (
          <Card padding="lg" className="text-center">
            <p className="text-crust-600 dark:text-crumb-400">
              {t('starterDetail.noFeedingsYet')}
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => openModal('feed-starter', { starterId: starter.uuid })}
            >
              {t('starterDetail.logFirstFeeding')}
            </Button>
          </Card>
        )}
      </motion.div>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={t('starterDetail.deleteConfirmTitle', { name: starter.name })}
        message={t('starterDetail.deleteConfirmMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />

      {/* Edit Starter Modal */}
      <EditStarterModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        starter={starter}
      />

      <PlanFeedModal
        isOpen={showPlanFeed}
        onClose={() => setShowPlanFeed(false)}
        starter={starter}
      />

      {/* Help: how starter analysis works */}
      <BottomSheet
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={t('starterDetail.help.title')}
      >
        <div className="space-y-5">
          <p className="text-sm text-crust-600 dark:text-crumb-400">
            {t('starterDetail.help.intro')}
          </p>

          {/* Steps */}
          <ol className="space-y-3">
            {[
              { n: 1, t: t('starterDetail.help.step1Title'), d: t('starterDetail.help.step1Body') },
              { n: 2, t: t('starterDetail.help.step2Title'), d: t('starterDetail.help.step2Body') },
              { n: 3, t: t('starterDetail.help.step3Title'), d: t('starterDetail.help.step3Body') },
            ].map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-honey-100 dark:bg-honey-900/30 text-honey-700 dark:text-honey-400 text-xs font-semibold flex items-center justify-center">
                  {s.n}
                </span>
                <div>
                  <p className="font-medium text-crust-800 dark:text-crumb-100">{s.t}</p>
                  <p className="text-sm text-crust-600 dark:text-crumb-400">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Two methods */}
          <div className="space-y-3">
            <div className="rounded-xl border border-crumb-200 dark:border-crust-700 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-honey-500" />
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('starterDetail.help.quickEstimateTitle')}{' '}
                  <span className="text-success-600 dark:text-success-400">{t('starterDetail.help.freeTag')}</span>
                </p>
              </div>
              <p className="text-sm text-crust-600 dark:text-crumb-400">
                {t('starterDetail.help.quickEstimateBody')}
              </p>
            </div>

            <div className="rounded-xl border border-crumb-200 dark:border-crust-700 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-honey-500" />
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('starterDetail.help.deepAnalysisTitle')}{' '}
                  <span className="text-crust-500 dark:text-crumb-500">{t('starterDetail.help.needsKeyTag')}</span>
                </p>
              </div>
              <p className="text-sm text-crust-600 dark:text-crumb-400">
                {t('starterDetail.help.deepAnalysisBody')}
              </p>
              {!hasClaudeKey && (
                <p className="mt-2 text-sm text-crust-500 dark:text-crumb-500 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  {t('starterDetail.help.settingsPath')}
                </p>
              )}
            </div>
          </div>

          {/* What's a float test */}
          <div className="rounded-xl bg-honey-50 dark:bg-honey-900/20 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <FlaskConical className="w-4 h-4 text-honey-600 dark:text-honey-400" />
              <p className="font-medium text-crust-800 dark:text-crumb-100">
                {t('starterDetail.help.floatTestTitle')}
              </p>
            </div>
            <p className="text-sm text-crust-600 dark:text-crumb-400">
              {t('starterDetail.help.floatTestIntro')}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex gap-2 text-crust-700 dark:text-crumb-300">
                <span className="text-success-600 dark:text-success-400">●</span>
                <span><strong>{t('starterDetail.help.floatsWord')}</strong> — {t('starterDetail.help.floatsBody')}</span>
              </li>
              <li className="flex gap-2 text-crust-700 dark:text-crumb-300">
                <span className="text-warning-600 dark:text-warning-400">●</span>
                <span><strong>{t('starterDetail.help.sinksWord')}</strong> — {t('starterDetail.help.sinksBody')}</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-crust-500 dark:text-crumb-500">
              {t('starterDetail.help.floatTestCaveat')}
            </p>
          </div>

          <p className="text-xs text-crust-500 dark:text-crumb-500">
            {t('starterDetail.help.tip')}
          </p>

          <Button fullWidth onClick={() => setShowHelp(false)}>
            {t('starterDetail.help.gotIt')}
          </Button>
        </div>
      </BottomSheet>

      {/* Photo source + method picker for analysis */}
      <ActionSheet
        isOpen={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        title={t('starterDetail.analyzeSheetTitle')}
        actions={[
          {
            label: t('starterDetail.actionQuickTakePhoto'),
            icon: <Camera className="w-5 h-5" />,
            onClick: () => handleAnalyze('camera', 'local'),
          },
          {
            label: t('starterDetail.actionQuickFromGallery'),
            icon: <ImageIcon className="w-5 h-5" />,
            onClick: () => handleAnalyze('gallery', 'local'),
          },
          ...(hasClaudeKey
            ? [
                {
                  label: t('starterDetail.actionDeepTakePhoto'),
                  icon: <Sparkles className="w-5 h-5" />,
                  onClick: () => handleAnalyze('camera', 'claude'),
                },
                {
                  label: t('starterDetail.actionDeepFromGallery'),
                  icon: <Sparkles className="w-5 h-5" />,
                  onClick: () => handleAnalyze('gallery', 'claude'),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
