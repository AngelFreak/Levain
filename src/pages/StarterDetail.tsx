import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Card, Button, ActionSheet, Badge, BottomSheet } from '../components/ui';
import { ConfirmModal } from '../components/ui/Modal';
import { EditStarterModal } from '../components/modals';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { db } from '../lib/db';
import { formatTime } from '../lib/fermentation';
import { takePhoto, photoToBase64 } from '../lib/photos';
import { analyzeStarter, MissingApiKeyError } from '../lib/claude';
import { analyzeStarterLocal } from '../lib/starterVision';
import { differenceInDays } from 'date-fns';
import type { Starter, Feeding } from '../types';
import { formatDistanceToNow, format } from 'date-fns';

interface StarterDetailPageProps {
  starterId: string;
}

export function StarterDetailPage({ starterId }: StarterDetailPageProps) {
  const { goBackFromPage, openModal, showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const hasClaudeKey = Boolean(settings.claudeApiKey?.trim());
  const [starter, setStarter] = useState<Starter | null>(null);
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // Load starter
      const starterData = await db.starters.where('uuid').equals(starterId).first();
      if (starterData) {
        setStarter(starterData);
      }

      // Load feedings for this starter, sorted by timestamp descending (newest first)
      const feedingsData = await db.feedings
        .where('starterId')
        .equals(starterId)
        .toArray();
      // Sort in memory by timestamp descending
      feedingsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setFeedings(feedingsData);
      setIsLoading(false);
    };

    loadData();
  }, [starterId]);

  const handleDelete = async () => {
    if (!starter?.id) return;

    try {
      // Delete all feedings for this starter
      await db.feedings.where('starterId').equals(starterId).delete();
      // Delete the starter
      await db.starters.delete(starter.id);
      showToast(`${starter.name} has been deleted`, 'success');
      goBackFromPage();
    } catch (error) {
      showToast('Failed to delete starter', 'error');
    }
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
        showToast('Could not read that photo. Please try again.', 'error');
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
      };

      const { analysis, healthScore } =
        method === 'claude'
          ? await analyzeStarter(base64, ctx)
          : await analyzeStarterLocal(base64, ctx);

      await db.starters.update(starter.id, { healthScore, lastAnalysis: analysis });
      setStarter({ ...starter, healthScore, lastAnalysis: analysis });
      showToast(
        method === 'claude' ? 'Analyzed with Claude!' : 'Quick estimate ready!',
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
            : 'Analysis failed. Please try again.';
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
    if (!lastFed) return { color: 'text-crust-500', label: 'Never fed' };
    const hoursSinceFed = (Date.now() - new Date(lastFed).getTime()) / (1000 * 60 * 60);
    if (hoursSinceFed < 8) return { color: 'text-success-600', label: 'Recently fed' };
    if (hoursSinceFed < 24) return { color: 'text-honey-600', label: 'Ready to use' };
    if (hoursSinceFed < 48) return { color: 'text-warning-600', label: 'Needs feeding' };
    return { color: 'text-error-600', label: 'Feed urgently!' };
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
          Back
        </button>
        <Card padding="lg" className="text-center">
          <p className="text-crust-600 dark:text-crumb-400">Starter not found</p>
        </Card>
      </div>
    );
  }

  const feedingStatus = getFeedingStatus(starter.lastFed);

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
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            aria-label="How analysis works"
            className="p-2 rounded-full hover:bg-crumb-100 dark:hover:bg-crust-800"
          >
            <HelpCircle className="w-5 h-5 text-crust-600 dark:text-crumb-400" />
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="p-2 rounded-full hover:bg-crumb-100 dark:hover:bg-crust-800"
          >
            <Edit2 className="w-5 h-5 text-crust-600 dark:text-crumb-400" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
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
                    Inactive
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-sm text-crust-600 dark:text-crumb-400">
                <span className="flex items-center gap-1">
                  <Droplets className="w-4 h-4" />
                  {starter.hydration}% hydration
                </span>
                <span>{starter.flourType} flour</span>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className={`text-sm font-medium ${feedingStatus.color}`}>
                  {feedingStatus.label}
                </span>
                {starter.lastFed && (
                  <span className="text-sm text-crust-500 dark:text-crumb-500">
                    (fed {formatDistanceToNow(new Date(starter.lastFed))} ago)
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
                Health Score
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-crust-800 dark:text-crumb-100">
                {starter.averagePeakTime ?? '--'}
              </div>
              <div className="text-xs text-crust-500 dark:text-crumb-500">
                Avg Peak (hrs)
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-crust-800 dark:text-crumb-100">
                {feedings.length}
              </div>
              <div className="text-xs text-crust-500 dark:text-crumb-500">
                Total Feedings
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-4 border-t border-crumb-100 dark:border-crust-800 flex gap-3">
            <Button
              fullWidth
              onClick={() => openModal('feed-starter', { starterId: starter.uuid })}
            >
              <Droplets className="w-4 h-4" />
              Feed Now
            </Button>
            <Button
              variant="ghost"
              fullWidth
              isLoading={isAnalyzing}
              onClick={() => setShowPhotoSheet(true)}
            >
              <Sparkles className="w-4 h-4" />
              {isAnalyzing ? 'Analyzing…' : 'Analyze'}
            </Button>
          </div>
        </Card>
      </motion.div>

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
            <p className="text-sm text-crust-600 dark:text-crumb-400">Birthday</p>
            <p className="font-medium text-crust-800 dark:text-crumb-100">
              {format(new Date(starter.createdDate), 'MMMM d, yyyy')}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-crust-500 dark:text-crumb-500">
              {formatDistanceToNow(new Date(starter.createdDate))} old
            </p>
          </div>
        </Card>
      </motion.div>

      {/* AI Analysis */}
      {starter.lastAnalysis && (
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
                {starter.lastAnalysis.source === 'claude' ? 'Claude Analysis' : 'Quick Estimate'}
              </h3>
              {starter.lastAnalysis.readyToBake ? (
                <Badge variant="success">
                  <CheckCircle2 className="w-3 h-3" />
                  Ready to bake
                </Badge>
              ) : (
                <Badge variant="warning">Not ready yet</Badge>
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
                ? 'On-device estimate'
                : `${starter.lastAnalysis.confidence} confidence`}{' '}
              · analyzed {formatDistanceToNow(new Date(starter.lastAnalysis.timestamp))} ago
            </p>
            {starter.lastAnalysis.source === 'on-device' && !hasClaudeKey && (
              <p className="text-xs text-crust-400 dark:text-crumb-600 mt-1">
                Add a Claude API key in Settings for richer, photo-based advice.
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
              Notes
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
          Feeding History
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
                        {feeding.starterWeight}g starter + {feeding.flourWeight}g flour +{' '}
                        {feeding.waterWeight}g water
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
                          Peaked:{' '}
                          {Math.round(
                            (new Date(feeding.peakTime).getTime() -
                              new Date(feeding.timestamp).getTime()) /
                              (1000 * 60 * 60)
                          )}
                          h
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}

            {feedings.length > 10 && (
              <p className="text-center text-sm text-crust-500 dark:text-crumb-500 pt-2">
                And {feedings.length - 10} more feedings...
              </p>
            )}
          </div>
        ) : (
          <Card padding="lg" className="text-center">
            <p className="text-crust-600 dark:text-crumb-400">
              No feedings recorded yet
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => openModal('feed-starter', { starterId: starter.uuid })}
            >
              Log First Feeding
            </Button>
          </Card>
        )}
      </motion.div>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={`Delete ${starter.name}?`}
        message="This will permanently delete this starter and all its feeding history. This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />

      {/* Edit Starter Modal */}
      <EditStarterModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        starter={starter}
        onSave={(updatedStarter) => setStarter(updatedStarter)}
      />

      {/* Help: how starter analysis works */}
      <BottomSheet
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Analyzing your starter"
      >
        <div className="space-y-5">
          <p className="text-sm text-crust-600 dark:text-crumb-400">
            Take a photo of your starter and get a read on how active and ready
            it looks. Here's how it works:
          </p>

          {/* Steps */}
          <ol className="space-y-3">
            {[
              { n: 1, t: 'Tap "Analyze"', d: 'On this starter\'s page, tap the Analyze button.' },
              { n: 2, t: 'Add a photo', d: 'Take a photo or pick one from your gallery — a clear, well-lit shot of the surface works best.' },
              { n: 3, t: 'Get your results', d: 'You\'ll see scores plus a few observations and suggestions, saved to this starter.' },
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
                  Quick estimate <span className="text-success-600 dark:text-success-400">· free</span>
                </p>
              </div>
              <p className="text-sm text-crust-600 dark:text-crumb-400">
                Runs entirely on your device — no account, no internet needed. It looks at
                bubble activity and surface texture to estimate how active your starter is.
                It's a rough guide, not a verdict.
              </p>
            </div>

            <div className="rounded-xl border border-crumb-200 dark:border-crust-700 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-honey-500" />
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  Deep analysis (Claude) <span className="text-crust-500 dark:text-crumb-500">· needs a key</span>
                </p>
              </div>
              <p className="text-sm text-crust-600 dark:text-crumb-400">
                Sends the photo to Claude for richer, more detailed advice. Add an Anthropic
                API key in Settings to unlock it — it costs a fraction of a cent per analysis.
              </p>
              {!hasClaudeKey && (
                <p className="mt-2 text-sm text-crust-500 dark:text-crumb-500 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Settings → AI Features → add your API key
                </p>
              )}
            </div>
          </div>

          {/* What's a float test */}
          <div className="rounded-xl bg-honey-50 dark:bg-honey-900/20 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <FlaskConical className="w-4 h-4 text-honey-600 dark:text-honey-400" />
              <p className="font-medium text-crust-800 dark:text-crumb-100">
                What's a float test?
              </p>
            </div>
            <p className="text-sm text-crust-600 dark:text-crumb-400">
              A quick way to check if your starter is ready: drop a small spoonful into a glass
              of room-temperature water.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex gap-2 text-crust-700 dark:text-crumb-300">
                <span className="text-success-600 dark:text-success-400">●</span>
                <span><strong>Floats</strong> — it's full of gas and active. Good to bake.</span>
              </li>
              <li className="flex gap-2 text-crust-700 dark:text-crumb-300">
                <span className="text-warning-600 dark:text-warning-400">●</span>
                <span><strong>Sinks</strong> — not enough rise yet. Give it more time, or feed it and wait.</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-crust-500 dark:text-crumb-500">
              It's a handy guide, not foolproof — stiff or very wet starters can fool it, and
              stirring the sample first lets the gas escape.
            </p>
          </div>

          <p className="text-xs text-crust-500 dark:text-crumb-500">
            Tip: a photo taken a few hours after feeding (when it's rising) gives the most
            useful read.
          </p>

          <Button fullWidth onClick={() => setShowHelp(false)}>
            Got it
          </Button>
        </div>
      </BottomSheet>

      {/* Photo source + method picker for analysis */}
      <ActionSheet
        isOpen={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        title="Analyze starter health"
        actions={[
          {
            label: 'Quick estimate · Take Photo',
            icon: <Camera className="w-5 h-5" />,
            onClick: () => handleAnalyze('camera', 'local'),
          },
          {
            label: 'Quick estimate · From Gallery',
            icon: <ImageIcon className="w-5 h-5" />,
            onClick: () => handleAnalyze('gallery', 'local'),
          },
          ...(hasClaudeKey
            ? [
                {
                  label: 'Deep analysis (Claude) · Take Photo',
                  icon: <Sparkles className="w-5 h-5" />,
                  onClick: () => handleAnalyze('camera', 'claude'),
                },
                {
                  label: 'Deep analysis (Claude) · From Gallery',
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
