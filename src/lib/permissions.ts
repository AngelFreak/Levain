import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface PermissionStatus {
  notifications: boolean;
  exactAlarms: boolean;
}

/**
 * Check current permission status
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  // Default to granted for web platform
  if (!Capacitor.isNativePlatform()) {
    return { notifications: true, exactAlarms: true };
  }

  try {
    const result = await LocalNotifications.checkPermissions();
    // Check exact alarm setting (Android 12+)
    let exactAlarms = true;
    try {
      const exactResult = await LocalNotifications.checkExactNotificationSetting();
      exactAlarms = exactResult.exact_alarm === 'granted';
    } catch {
      // Older Android versions don't have this, assume granted
      exactAlarms = true;
    }
    return {
      notifications: result.display === 'granted',
      exactAlarms,
    };
  } catch (error) {
    console.error('Failed to check permissions:', error);
    return { notifications: false, exactAlarms: false };
  }
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // On web, always return true
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
}

/**
 * Check if this is the first app launch (permission prompt not yet shown)
 */
export function hasShownPermissionPrompt(): boolean {
  return localStorage.getItem('permission_prompt_shown') === 'true';
}

/**
 * Mark that permission prompt has been shown
 */
export function markPermissionPromptShown(): void {
  localStorage.setItem('permission_prompt_shown', 'true');
}

/**
 * Whether the first-run onboarding walkthrough has been completed (or skipped).
 * A truly fresh install has neither this flag nor the permission-prompt flag, so
 * it gets onboarding; existing users keep their (already-set) permission flag and
 * never see onboarding retroactively.
 *
 * The `permission_prompt_shown` check is the existing-user sentinel: an install
 * that predates onboarding already set that flag, so we treat it as "done" rather
 * than dropping such users into a first-run flow on their next launch.
 */
export function hasCompletedOnboarding(): boolean {
  return (
    localStorage.getItem('onboarding_complete') === 'true' ||
    localStorage.getItem('permission_prompt_shown') === 'true'
  );
}

/**
 * Mark onboarding finished. Also marks the standalone permission prompt as shown,
 * since onboarding asks for notification permission itself — this prevents the bare
 * PermissionPrompt from appearing right after onboarding.
 */
export function markOnboardingComplete(): void {
  localStorage.setItem('onboarding_complete', 'true');
  markPermissionPromptShown();
}
