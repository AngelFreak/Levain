import { useState, useMemo } from 'react';
import { CalendarClock, Beaker } from 'lucide-react';
import { Button, BottomSheet } from '../ui';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { planStarterFeed } from '../../lib/starterPlanner';
import { schedulePlannedFeedReminder } from '../../lib/notifications';
import type { Starter } from '../../types';

interface PlanFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  starter: Starter | null;
}

/** Default target: tomorrow 18:00, as a datetime-local string. */
function defaultTarget(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PlanFeedModal({ isOpen, onClose, starter }: PlanFeedModalProps) {
  const { showToast } = useAppStore();
  const { settings } = useSettingsStore();
  const [target, setTarget] = useState(defaultTarget);
  const [isScheduling, setIsScheduling] = useState(false);

  const plan = useMemo(() => {
    if (!target) return null;
    const targetDate = new Date(target);
    if (isNaN(targetDate.getTime())) return null;
    return planStarterFeed(
      targetDate,
      settings.defaultAmbientTemp,
      starter?.averagePeakTime
    );
  }, [target, settings.defaultAmbientTemp, starter?.averagePeakTime]);

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleSetReminder = async () => {
    if (!starter || !plan) return;
    setIsScheduling(true);
    try {
      const result = await schedulePlannedFeedReminder(
        starter,
        plan.feedAt,
        plan.ratio,
        plan.targetPeak
      );
      if (result.success) {
        showToast(`Reminder set to feed at ${fmt(plan.feedAt)}.`, 'success');
        onClose();
      } else if (result.permissionDenied) {
        showToast('Enable notifications to set a feed reminder.', 'warning');
      } else {
        showToast('Feed time is in the past — pick a later target.', 'warning');
      }
    } catch {
      showToast('Could not set reminder.', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Plan a feed">
      <div className="space-y-5">
        <div className="flex justify-center">
          <div className="p-3 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
            <CalendarClock className="w-8 h-8 text-honey-600 dark:text-honey-400" />
          </div>
        </div>

        <p className="text-sm text-crust-600 dark:text-crumb-400 text-center">
          When do you want {starter?.name ?? 'your starter'} at peak (ready to bake)?
        </p>

        <div>
          <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5">
            Peak by
          </label>
          <input
            type="datetime-local"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-crust-900 border border-crumb-300 dark:border-crust-700 rounded-xl text-crust-900 dark:text-crumb-100 focus:outline-none focus:ring-2 focus:ring-crust-500/20"
          />
        </div>

        {/* Plan result */}
        {plan && (
          <div className="p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl space-y-3">
            {plan.status === 'past' ? (
              <p className="text-sm text-warning-600 dark:text-warning-400">
                That time is in the past — pick a later target.
              </p>
            ) : plan.status === 'too_soon' ? (
              <p className="text-sm text-warning-600 dark:text-warning-400">
                Even a quick 1:1:1 feed needs ~{plan.peakHours}h to peak. Pick a later
                target or feed now and bake a bit later.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Beaker className="w-5 h-5 text-honey-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-crust-800 dark:text-crumb-100">
                      Feed at {plan.ratio}
                    </p>
                    <p className="text-xs text-crust-500 dark:text-crumb-500">
                      Peaks in ~{plan.peakHours}h at {settings.defaultAmbientTemp}°C
                      {plan.personalized ? ' (using this starter’s history)' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-crumb-200/50 dark:border-crust-700/50 pt-3">
                  <span className="text-crust-600 dark:text-crumb-400">
                    {plan.status === 'feed_now' ? 'Feed' : 'Feed at'}
                  </span>
                  <span className="font-medium text-crust-800 dark:text-crumb-100">
                    {plan.status === 'feed_now' ? 'now' : fmt(plan.feedAt)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <Button
          fullWidth
          onClick={handleSetReminder}
          isLoading={isScheduling}
          disabled={!plan || plan.status === 'past' || plan.status === 'too_soon'}
        >
          {plan?.status === 'feed_now' ? 'Remind me to feed (soon)' : 'Set feed reminder'}
        </Button>
      </div>
    </BottomSheet>
  );
}
