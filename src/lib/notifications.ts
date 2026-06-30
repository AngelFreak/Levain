import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import type { ScheduleStep, TimelineStep, ScheduledNotification, Starter } from '../types';
import { checkPermissions, requestNotificationPermission } from './permissions';
import { getFeedingReminderHours, getStorageLocation } from './storage';
import {
  PERSISTENT_BAKE_NOTIFICATION_ID,
  FEEDING_REMINDER_MIN,
  FEEDING_REMINDER_MAX,
  getFeedingReminderId,
  getPlannedFeedId,
} from './notificationIds';

// Initialize notification channels for Android
let channelsInitialized = false;

async function ensureNotificationChannels(): Promise<void> {
  if (channelsInitialized || !Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Channel for step notifications (with sound and vibration)
    await LocalNotifications.createChannel({
      id: 'levain_bake_steps',
      name: 'Bake Steps',
      description: 'Notifications for baking step reminders',
      importance: 5, // Max importance for heads-up notifications
      visibility: 1, // Public
      sound: 'default',
      vibration: true,
      lights: true,
    });

    // Silent channel for persistent/ongoing notifications (no sound/vibration)
    await LocalNotifications.createChannel({
      id: 'levain_persistent',
      name: 'Active Bake Status',
      description: 'Silent ongoing notification showing current bake status',
      importance: 2, // Low importance - no sound
      visibility: 1, // Public
      sound: undefined,
      vibration: false,
      lights: false,
    });

    console.log('Notification channels created');
    channelsInitialized = true;
  } catch (error) {
    console.error('Failed to create notification channels:', error);
  }
}

// Notification IDs are owned by src/lib/notificationIds.ts, which partitions the
// integer space and allocates from persisted counters so IDs never collide.
// (Legacy code used a uuid-hash into 100-999 and Date.now() bases — both unsafe.)

type NotificationCategory = 'bake_step' | 'feeding_reminder' | 'persistent_bake';

/**
 * Schedule a local notification
 */
export async function scheduleNotification(
  id: number,
  title: string,
  body: string,
  scheduledTime: Date | string,
  category: NotificationCategory = 'bake_step'
): Promise<void> {
  // Ensure scheduledTime is a Date object
  const scheduleDate = scheduledTime instanceof Date ? scheduledTime : new Date(scheduledTime);

  // Don't schedule if time is in the past
  if (scheduleDate.getTime() <= Date.now()) {
    console.log('Skipping notification - time is in the past:', title, 'scheduled for:', scheduleDate);
    return;
  }

  // On web, just log (notifications won't work properly)
  if (!Capacitor.isNativePlatform()) {
    console.log('Would schedule notification:', { id, title, body, scheduledTime, category });
    return;
  }

  try {
    // Ensure notification channel exists
    await ensureNotificationChannels();

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: {
            at: scheduleDate,
            allowWhileIdle: true, // Fire even in Doze mode
          },
          sound: 'default',
          channelId: 'levain_bake_steps',
          smallIcon: 'ic_stat_bread',
          largeIcon: 'ic_launcher',
          actionTypeId: category === 'feeding_reminder' ? 'FEEDING_REMINDER' : 'BAKE_STEP',
          extra: {
            type: category,
          },
        },
      ],
    });
    console.log('Scheduled notification:', title, 'at', scheduleDate.toISOString());
  } catch (error) {
    console.error('Failed to schedule notification:', error);
  }
}

/**
 * Cancel all pending notifications for a bake
 */
export async function cancelBakeNotifications(notificationIds: number[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Would cancel notifications:', notificationIds);
    return;
  }

  try {
    await LocalNotifications.cancel({
      notifications: notificationIds.map((id) => ({ id })),
    });
    console.log('Cancelled notifications:', notificationIds);
  } catch (error) {
    console.error('Failed to cancel notifications:', error);
  }
}

/**
 * Convert calculator ScheduleSteps to TimelineSteps
 */
export function convertToTimelineSteps(scheduleSteps: ScheduleStep[]): TimelineStep[] {
  return scheduleSteps.map((step) => ({
    id: step.id,
    name: step.step,
    description: step.description,
    scheduledTime: step.time,
    duration: step.duration,
    status: 'pending' as const,
    photoPrompt: step.photoPrompt,
  }));
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 */
function truncateText(text: string, maxLength: number): string {
  // Get first line only (before any newline)
  const firstLine = text.split('\n')[0];
  if (firstLine.length <= maxLength) {
    return firstLine;
  }
  return firstLine.substring(0, maxLength - 3) + '...';
}

/**
 * Create scheduled notifications for timeline steps
 */
export function createStepNotifications(
  steps: TimelineStep[],
  baseNotificationId: number
): ScheduledNotification[] {
  const notifications: ScheduledNotification[] = [];

  steps.forEach((step, index) => {
    // Notification when step starts
    // Truncate body to avoid Android notification limits (max ~240 chars visible)
    notifications.push({
      id: `${baseNotificationId}-${index}-start`,
      stepId: step.id,
      triggerTime: step.scheduledTime,
      title: `🍞 Time for: ${step.name}`,
      body: truncateText(step.description, 200),
      sent: false,
    });

    // Notification 5 minutes before important steps
    const importantSteps = ['Mix Final Dough', 'Pre-Shape', 'Final Shape', 'Score & Bake'];
    if (importantSteps.some((s) => step.name.includes(s))) {
      const reminderTime = new Date(step.scheduledTime.getTime() - 5 * 60 * 1000);
      if (reminderTime.getTime() > Date.now()) {
        notifications.push({
          id: `${baseNotificationId}-${index}-reminder`,
          stepId: step.id,
          triggerTime: reminderTime,
          title: `⏰ Coming up in 5 minutes`,
          body: step.name,
          sent: false,
        });
      }
    }
  });

  return notifications;
}

/**
 * Schedule all notifications for a bake timeline
 * Returns true if notifications were scheduled, false if permissions denied
 */
export async function scheduleTimelineNotifications(
  notifications: ScheduledNotification[],
  baseId: number
): Promise<{ success: boolean; permissionDenied: boolean }> {
  // Check permissions first
  const permissions = await checkPermissions();

  if (!permissions.notifications) {
    // Try to request permission
    const granted = await requestNotificationPermission();
    if (!granted) {
      console.log('Notification permission denied - skipping notification scheduling');
      return { success: false, permissionDenied: true };
    }
  }

  let scheduledCount = 0;
  for (let i = 0; i < notifications.length; i++) {
    const notification = notifications[i];
    // Ensure triggerTime is a Date object (it might be a string from IndexedDB)
    const triggerDate = notification.triggerTime instanceof Date
      ? notification.triggerTime
      : new Date(notification.triggerTime);

    // Only schedule if in the future
    if (triggerDate.getTime() > Date.now()) {
      await scheduleNotification(
        baseId + i,
        notification.title,
        notification.body,
        triggerDate
      );
      scheduledCount++;
    } else {
      console.log('Skipping past notification:', notification.title, 'was scheduled for:', triggerDate);
    }
  }
  console.log(`Scheduled ${scheduledCount} of ${notifications.length} notifications`);

  return { success: true, permissionDenied: false };
}

/**
 * Schedule a feeding reminder for a starter.
 *
 * The interval is chosen from the starter's storage location: a room-temp
 * starter uses `roomReminderHours` (the user's configured interval), while a
 * starter in the fridge uses the fixed weekly cadence. This keeps the cadence
 * correct no matter which screen triggers the (re)schedule.
 *
 * @param starter The starter that was just fed (or whose location changed)
 * @param feedingTime When the last feeding occurred (reminder is relative to this)
 * @param roomReminderHours Room-temp interval in hours (from user settings)
 */
export async function scheduleFeedingReminder(
  starter: Starter,
  feedingTime: Date,
  roomReminderHours: number
): Promise<{ success: boolean; permissionDenied: boolean; scheduledTime?: Date }> {
  // Resolve the effective interval from the starter's location.
  const effectiveHours = getFeedingReminderHours(starter.storageLocation, roomReminderHours);

  // Calculate reminder time
  const reminderTime = new Date(feedingTime.getTime() + effectiveHours * 60 * 60 * 1000);

  // Don't schedule if time is in the past
  if (reminderTime.getTime() <= Date.now()) {
    console.log('Skipping feeding reminder - time is in the past');
    return { success: false, permissionDenied: false };
  }

  // Check permissions
  const permissions = await checkPermissions();
  if (!permissions.notifications) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return { success: false, permissionDenied: true };
    }
  }

  // Stable, collision-free per-starter ID (persisted, not hashed).
  const notificationId = await getFeedingReminderId(starter.uuid);

  // Cancel any existing reminder for this starter first
  await cancelFeedingReminder(starter);

  // Tailor the copy to where the starter is kept.
  const elapsed =
    getStorageLocation(starter.storageLocation) === 'fridge'
      ? `${Math.round(effectiveHours / 24)} days`
      : `${effectiveHours} hours`;

  // Schedule the notification with feeding_reminder category
  await scheduleNotification(
    notificationId,
    `🥣 Time to feed ${starter.name}!`,
    `It's been ${elapsed} since the last feeding. Your starter is ready for its next meal.`,
    reminderTime,
    'feeding_reminder'
  );

  console.log(`Scheduled feeding reminder for ${starter.name} at ${reminderTime.toLocaleString()}`);
  return { success: true, permissionDenied: false, scheduledTime: reminderTime };
}

/**
 * Re-evaluate a starter's feeding reminder after something other than a feeding
 * changed — typically a move between room and fridge. Reschedules relative to the
 * starter's last feeding using the location-appropriate interval. If the starter
 * was never fed, or reminders are off, any existing reminder is simply cancelled.
 *
 * @param starter The starter whose location/state changed
 * @param remindersEnabled Whether feeding reminders are enabled in settings
 * @param roomReminderHours Room-temp interval in hours (from user settings)
 */
export async function rescheduleFeedingReminder(
  starter: Starter,
  remindersEnabled: boolean,
  roomReminderHours: number
): Promise<{ success: boolean; permissionDenied: boolean; scheduledTime?: Date }> {
  // Without reminders enabled or a feeding to anchor to, there's nothing to
  // schedule — clear any stale reminder so the cadence doesn't go stale.
  if (!remindersEnabled || !starter.lastFed) {
    await cancelFeedingReminder(starter);
    return { success: false, permissionDenied: false };
  }

  return scheduleFeedingReminder(starter, new Date(starter.lastFed), roomReminderHours);
}

/**
 * Cancel a feeding reminder for a starter
 */
export async function cancelFeedingReminder(starter: Starter): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Would cancel feeding reminder for:', starter.name);
    return;
  }

  // Same stable per-starter ID used when scheduling.
  const notificationId = await getFeedingReminderId(starter.uuid);

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: notificationId }],
    });
    console.log(`Cancelled feeding reminder for ${starter.name}`);
  } catch (error) {
    console.error('Failed to cancel feeding reminder:', error);
  }
}

/**
 * Schedule a one-off "feed now to peak by your target" reminder for a planned
 * feed (Stage 8). Distinct from the recurring feeding reminder. Replaces any
 * prior planned-feed reminder for this starter. No-ops (cancels) if the feed
 * time is in the past.
 *
 * @param starter The starter being planned.
 * @param feedAt  When to feed.
 * @param ratio   Recommended ratio, included in the body.
 * @param targetPeak When it should peak (for the body copy).
 */
export async function schedulePlannedFeedReminder(
  starter: Starter,
  feedAt: Date,
  ratio: string,
  targetPeak: Date
): Promise<{ success: boolean; permissionDenied: boolean }> {
  const id = await getPlannedFeedId(starter.uuid);

  // Always clear a previous planned-feed reminder first.
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch {
      // ignore — nothing scheduled
    }
  }

  if (feedAt.getTime() <= Date.now()) {
    return { success: false, permissionDenied: false };
  }

  const permissions = await checkPermissions();
  if (!permissions.notifications) {
    const granted = await requestNotificationPermission();
    if (!granted) return { success: false, permissionDenied: true };
  }

  const peakLabel = targetPeak.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  await scheduleNotification(
    id,
    `🥣 Feed ${starter.name} now (${ratio})`,
    `Feed at ${ratio} so it peaks around ${peakLabel}.`,
    feedAt,
    'feeding_reminder'
  );
  return { success: true, permissionDenied: false };
}

/**
 * Get pending feeding reminders
 */
export async function getPendingFeedingReminders(): Promise<
  Array<{ id: number; title: string; schedule: Date }>
> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }

  try {
    const pending = await LocalNotifications.getPending();
    return pending.notifications
      .filter((n) => n.id >= FEEDING_REMINDER_MIN && n.id <= FEEDING_REMINDER_MAX)
      .map((n) => ({
        id: n.id,
        title: n.title || '',
        schedule: n.schedule?.at ? new Date(n.schedule.at) : new Date(),
      }));
  } catch (error) {
    console.error('Failed to get pending reminders:', error);
    return [];
  }
}

/**
 * Show the persistent (ongoing) notification for active bakes. Stays visible
 * until the last bake completes or is abandoned. There is a single persistent
 * slot, so when more than one bake is active `activeCount` makes the body
 * summarize them ("2 bakes in progress") while the title shows one bake's name.
 *
 * @param bakeName Name of the bake to feature in the title.
 * @param activeCount Number of bakes currently active (defaults to 1).
 */
export async function showPersistentBakeNotification(
  bakeName: string,
  activeCount = 1
): Promise<void> {
  const body =
    activeCount > 1 ? `${activeCount} bakes in progress` : 'Bake in progress';

  if (!Capacitor.isNativePlatform()) {
    console.log('Would show persistent notification:', bakeName, '—', body);
    return;
  }

  // Check permissions
  const permissions = await checkPermissions();
  if (!permissions.notifications) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      console.log('Notification permission denied');
      return;
    }
  }

  try {
    // Ensure notification channel exists
    await ensureNotificationChannels();

    // Show the persistent notification immediately (no schedule)
    // Uses silent channel to avoid vibration
    await LocalNotifications.schedule({
      notifications: [
        {
          id: PERSISTENT_BAKE_NOTIFICATION_ID,
          title: activeCount > 1 ? `🍞 ${bakeName} +${activeCount - 1} more` : `🍞 ${bakeName}`,
          body,
          ongoing: true, // Makes it persistent (can't be swiped away)
          autoCancel: false, // Don't auto-dismiss when tapped
          channelId: 'levain_persistent', // Silent channel - no vibration
          smallIcon: 'ic_stat_bread',
          largeIcon: 'ic_launcher',
          actionTypeId: 'PERSISTENT_BAKE',
          extra: {
            type: 'persistent_bake',
          },
        },
      ],
    });
    console.log('Showing persistent bake notification:', bakeName, '—', body);
  } catch (error) {
    console.error('Failed to show persistent notification:', error);
  }
}

/**
 * Update the persistent bake notification
 */
export async function updatePersistentBakeNotification(
  bakeName: string
): Promise<void> {
  await showPersistentBakeNotification(bakeName);
}

/**
 * Cancel the persistent bake notification
 */
export async function cancelPersistentBakeNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Would cancel persistent notification');
    return;
  }

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: PERSISTENT_BAKE_NOTIFICATION_ID }],
    });
    console.log('Cancelled persistent bake notification');
  } catch (error) {
    console.error('Failed to cancel persistent notification:', error);
  }
}

/**
 * Get all pending notifications (for debugging)
 */
export async function getPendingNotifications(): Promise<Array<{ id: number; title?: string; body?: string; schedule?: Date }>> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }

  try {
    const pending = await LocalNotifications.getPending();
    console.log('Pending notifications:', JSON.stringify(pending.notifications, null, 2));
    return pending.notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      schedule: n.schedule?.at ? new Date(n.schedule.at) : undefined,
    }));
  } catch (error) {
    console.error('Failed to get pending notifications:', error);
    return [];
  }
}

/**
 * One-time migration to the partitioned notification-ID scheme.
 *
 * Notifications scheduled under the old scheme (uuid-hash feeding IDs,
 * Date.now() timeline bases) can't be cancelled by the new IDs, so we cancel
 * ALL pending notifications once and let the caller rebuild the durable ones
 * (feeding reminders) from app data. In-flight bake step notifications are not
 * reconstructed — an acceptable one-time loss; the persistent bake notification
 * is re-shown by ActiveBakePage on next view.
 *
 * @returns true if the migration ran this call (caller should rebuild reminders).
 */
export async function migrateNotificationScheme(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const KEY = 'notif.idSchemeMigratedV2';
  const { getSetting, setSetting } = await import('./db');
  const alreadyMigrated = await getSetting<boolean>(KEY, false);
  if (alreadyMigrated) return false;

  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    await setSetting(KEY, true);
    console.log('Migrated notification ID scheme (cancelled stale notifications)');
    return true;
  } catch (error) {
    console.error('Notification ID migration failed:', error);
    return false;
  }
}

/**
 * Initialize notifications - call this on app startup
 */
export async function initializeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await ensureNotificationChannels();

  // Add listener for received notifications
  await LocalNotifications.addListener('localNotificationReceived', (notification) => {
    console.log('Notification received:', notification);
  });

  // Add listener for notification actions
  await LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
    console.log('Notification action performed:', notification);
  });

  console.log('Notifications initialized');
}
