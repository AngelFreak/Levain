// Starter storage-location helpers.
// One source of truth for how a starter's location affects its feeding cadence,
// shared by the UI (Starters list, StarterDetail, EditStarterModal) and the
// notification scheduler.

import type { StorageLocation } from '../types';

/**
 * Fixed feeding interval for a starter kept in the fridge.
 * A cold starter ferments far slower, so weekly feeding is the common guidance.
 * Change this single constant to tune the fridge cadence.
 */
export const FRIDGE_FEEDING_INTERVAL_DAYS = 7;
export const FRIDGE_FEEDING_INTERVAL_HOURS = FRIDGE_FEEDING_INTERVAL_DAYS * 24;

/** Default location for starters created before the field existed. */
export const DEFAULT_STORAGE_LOCATION: StorageLocation = 'room';

/** Normalize a possibly-undefined location (legacy records) to a concrete value. */
export function getStorageLocation(
  location: StorageLocation | undefined
): StorageLocation {
  return location ?? DEFAULT_STORAGE_LOCATION;
}

/**
 * The feeding-reminder interval (in hours) for a starter, given its location.
 * Room temp uses the user's configured interval; the fridge uses the fixed
 * weekly cadence regardless of the room setting.
 */
export function getFeedingReminderHours(
  location: StorageLocation | undefined,
  roomReminderHours: number
): number {
  return getStorageLocation(location) === 'fridge'
    ? FRIDGE_FEEDING_INTERVAL_HOURS
    : roomReminderHours;
}

interface StorageLocationMeta {
  value: StorageLocation;
  /** Short label, e.g. for chips. */
  label: string;
  /** Longer description for settings rows / edit modal. */
  description: string;
}

export const STORAGE_LOCATION_META: Record<StorageLocation, StorageLocationMeta> = {
  room: {
    value: 'room',
    label: 'Room',
    description: 'Out on the counter — feed often (uses your reminder interval)',
  },
  fridge: {
    value: 'fridge',
    label: 'Fridge',
    description: `Cold storage — feed about every ${FRIDGE_FEEDING_INTERVAL_DAYS} days`,
  },
};

export function getStorageLocationMeta(
  location: StorageLocation | undefined
): StorageLocationMeta {
  return STORAGE_LOCATION_META[getStorageLocation(location)];
}
