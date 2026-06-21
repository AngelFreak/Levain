import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Circle,
  PlayCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';
import { Card, Button } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { db, createBakeFromTimeline } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  cancelBakeNotifications,
  showPersistentBakeNotification,
  cancelPersistentBakeNotification,
} from '../lib/notifications';
import { formatTime } from '../lib/fermentation';
import type { ActiveTimeline, TimelineStep, Rating } from '../types';
import { formatDistanceToNow } from 'date-fns';

export function ActiveBakePage() {
  const { goBackFromPage, showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [rating, setRating] = useState<Rating>(4);
  const [completeNotes, setCompleteNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Get active timeline with live updates
  const timeline = useLiveQuery(
    () => db.activeTimelines.where('status').equals('active').first(),
    []
  ) as ActiveTimeline | undefined;

  // Auto-expand current step
  useEffect(() => {
    if (timeline && timeline.steps[timeline.currentStepIndex]) {
      setExpandedStep(timeline.steps[timeline.currentStepIndex].id);
    }
  }, [timeline?.currentStepIndex]);

  // Show persistent notification when bake is active
  // Show persistent notification when bake starts
  useEffect(() => {
    if (!timeline || timeline.status !== 'active') return;

    showPersistentBakeNotification(timeline.name);
  }, [timeline?.status, timeline?.name]);

  const handleCompleteStep = async (stepIndex: number) => {
    if (!timeline?.id) return;

    try {
      const updatedSteps = [...timeline.steps];
      updatedSteps[stepIndex] = {
        ...updatedSteps[stepIndex],
        status: 'completed',
        actualStartTime: updatedSteps[stepIndex].actualStartTime || new Date(),
      };

      // Move to next step if available
      const nextStepIndex = stepIndex + 1;
      const isComplete = nextStepIndex >= timeline.steps.length;

      // Don't mark as 'completed' yet - keep 'active' so LiveQuery still returns it
      // We'll mark it completed when user dismisses the modal
      await db.activeTimelines.update(timeline.id, {
        steps: updatedSteps,
        currentStepIndex: isComplete ? stepIndex : nextStepIndex,
      });

      if (isComplete) {
        // Cancel any remaining notifications
        if (timeline.notifications && timeline.notifications.length > 0 && timeline.notificationBaseId) {
          const notificationIds = timeline.notifications
            .filter((n) => !n.sent)
            .map((_, index) => timeline.notificationBaseId! + index);
          if (notificationIds.length > 0) {
            await cancelBakeNotifications(notificationIds);
          }
        }
        // Cancel persistent notification when bake is complete
        await cancelPersistentBakeNotification();
        // Show completion modal for rating
        setShowCompleteModal(true);
      }
    } catch (error) {
      console.error('Failed to complete step:', error);
      showToast('Failed to update step', 'error');
    }
  };

  const handleAbandonBake = async () => {
    if (!timeline?.id) return;

    try {
      // Cancel any pending notifications for this bake
      if (timeline.notifications && timeline.notifications.length > 0 && timeline.notificationBaseId) {
        const notificationIds = timeline.notifications
          .filter((n) => !n.sent)
          .map((_, index) => timeline.notificationBaseId! + index);
        if (notificationIds.length > 0) {
          await cancelBakeNotifications(notificationIds);
        }
      }

      // Cancel persistent notification
      await cancelPersistentBakeNotification();

      await db.activeTimelines.update(timeline.id, {
        status: 'abandoned',
      });
      showToast('Bake abandoned', 'info');
      goBackFromPage();
    } catch (error) {
      showToast('Failed to abandon bake', 'error');
    }
  };

  const getStepIcon = (step: TimelineStep, index: number, currentIndex: number) => {
    if (step.status === 'completed') {
      return <CheckCircle2 className="w-5 h-5 text-success-500" />;
    }
    if (step.status === 'skipped') {
      return <XCircle className="w-5 h-5 text-crust-400" />;
    }
    if (index === currentIndex) {
      return <PlayCircle className="w-5 h-5 text-honey-500" />;
    }
    return <Circle className="w-5 h-5 text-crumb-300 dark:text-crust-600" />;
  };

  const formatStepTime = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < -60) {
      return `${Math.abs(Math.round(diffMins / 60))}h ago`;
    }
    if (diffMins < 0) {
      return `${Math.abs(diffMins)}m ago`;
    }
    if (diffMins < 60) {
      return `in ${diffMins}m`;
    }
    return `in ${Math.round(diffMins / 60)}h`;
  };

  const handleSaveToJournal = async () => {
    if (!timeline?.id) return;
    setIsSaving(true);
    try {
      await createBakeFromTimeline(timeline, rating, completeNotes);
      // Now mark the bake as completed
      await db.activeTimelines.update(timeline.id, { status: 'completed' });
      showToast('Bake saved to journal!', 'success');
      setShowCompleteModal(false);
      goBackFromPage();
    } catch (error) {
      console.error('Failed to save bake:', error);
      showToast('Failed to save bake', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipSave = async () => {
    if (timeline?.id) {
      // Mark the bake as completed even if skipping save
      await db.activeTimelines.update(timeline.id, { status: 'completed' });
    }
    showToast('Bake complete! Great job!', 'success');
    setShowCompleteModal(false);
    goBackFromPage();
  };

  if (!timeline) {
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
          <p className="text-crust-600 dark:text-crumb-400">No active bake found</p>
        </Card>
      </div>
    );
  }

  const currentStep = timeline.steps[timeline.currentStepIndex];
  const completedSteps = timeline.steps.filter((s) => s.status === 'completed').length;
  const progress = (completedSteps / timeline.steps.length) * 100;

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
        <button
          onClick={handleAbandonBake}
          className="text-sm text-error-500 hover:text-error-600"
        >
          Abandon
        </button>
      </motion.div>

      {/* Bake Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card variant="elevated" padding="lg" className="mb-6">
          <h1 className="text-xl font-display font-bold text-crust-800 dark:text-crumb-100 mb-2">
            {timeline.name}
          </h1>
          <div className="flex items-center gap-4 text-sm text-crust-600 dark:text-crumb-400 mb-4">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Started {formatDistanceToNow(new Date(timeline.startTime))} ago
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-crust-500 dark:text-crumb-500 mb-1">
              <span>Progress</span>
              <span>{completedSteps} of {timeline.steps.length} steps</span>
            </div>
            <div className="h-2 bg-crumb-200 dark:bg-crust-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-honey-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Current Step Highlight */}
      {currentStep && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <Card
            variant="elevated"
            padding="lg"
            className="bg-gradient-to-br from-honey-500 to-honey-600 text-white"
          >
            <div className="flex items-center gap-2 mb-2">
              <PlayCircle className="w-5 h-5" />
              <span className="text-xs font-medium uppercase tracking-wide opacity-90">
                Current Step
              </span>
            </div>
            <h2 className="text-lg font-semibold mb-1">{currentStep.name}</h2>
            <p className="text-sm opacity-90 mb-4 whitespace-pre-line">{currentStep.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-75">
                Scheduled: {formatTime(new Date(currentStep.scheduledTime), settings.timeFormat)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCompleteStep(timeline.currentStepIndex)}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Done
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* All Steps Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-4">
          All Steps
        </h2>
        <div className="space-y-2">
          {timeline.steps.map((step, index) => {
            const isExpanded = expandedStep === step.id;
            const isCurrent = index === timeline.currentStepIndex;
            const isPast = step.status === 'completed' || step.status === 'skipped';

            return (
              <Card
                key={step.id}
                padding="none"
                className={`overflow-hidden ${isCurrent ? 'ring-2 ring-honey-500' : ''}`}
              >
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  {getStepIcon(step, index, timeline.currentStepIndex)}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${
                      isPast
                        ? 'text-crust-500 dark:text-crumb-500'
                        : 'text-crust-800 dark:text-crumb-100'
                    }`}>
                      {step.name}
                    </p>
                    <p className="text-xs text-crust-500 dark:text-crumb-500">
                      {formatTime(new Date(step.scheduledTime), settings.timeFormat)} · {formatStepTime(step.scheduledTime)}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-crust-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-crust-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-crumb-100 dark:border-crust-800">
                    <p className="text-sm text-crust-600 dark:text-crumb-400 mt-3 mb-3 whitespace-pre-line">
                      {step.description}
                    </p>
                    {!isPast && index >= timeline.currentStepIndex && (
                      <Button
                        size="sm"
                        variant={isCurrent ? 'primary' : 'ghost'}
                        onClick={() => handleCompleteStep(index)}
                        disabled={index > timeline.currentStepIndex}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Mark Complete
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </motion.div>

      {/* Completion Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-crust-900 rounded-2xl p-6 max-w-sm w-full shadow-xl"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success-500" />
              </div>
              <h3 className="text-xl font-display font-bold text-crust-800 dark:text-crumb-100 mb-1">
                Bake Complete!
              </h3>
              <p className="text-crust-600 dark:text-crumb-400">
                How did it turn out?
              </p>
            </div>

            {/* Star Rating */}
            <div className="mb-4">
              <p className="text-sm text-crust-600 dark:text-crumb-400 mb-2 text-center">
                Rate your bake
              </p>
              <div className="flex justify-center gap-2">
                {([1, 2, 3, 4, 5] as Rating[]).map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= rating
                          ? 'fill-honey-500 text-honey-500'
                          : 'text-crumb-300 dark:text-crust-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="text-sm text-crust-600 dark:text-crumb-400 mb-2 block">
                Notes (optional)
              </label>
              <textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="What worked well? What to improve next time?"
                className="w-full px-3 py-2 rounded-lg border border-crumb-300 dark:border-crust-700 bg-white dark:bg-crust-800 text-crust-800 dark:text-crumb-100 placeholder-crust-400 dark:placeholder-crumb-600 resize-none"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleSkipSave}
                className="flex-1"
                disabled={isSaving}
              >
                Skip
              </Button>
              <Button
                onClick={handleSaveToJournal}
                className="flex-1"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save to Journal'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
