// Single owner of local-notification ID allocation.
//
// Android/iOS notification IDs are 32-bit integers. To guarantee no two
// entities ever share an ID we partition the integer space into fixed ranges
// and allocate within them from PERSISTED counters — never by hashing UUIDs
// into a finite space (which collides) or by Date.now() (which collides when
// two things are created in the same millisecond).
//
// Ranges:
//   1                      persistent "ongoing" bake notification (singleton)
//   100   .. 99_999        feeding reminders — one stable ID per starter
//   100_000 .. 1_999_999   timeline blocks — a reserved block per timeline
//
// Allocated IDs are stored so an entity always maps back to the same ID and a
// freed range is never reused for a different entity within a session's needs.

import { getSetting, setSetting } from './db';

/** Singleton persistent bake notification. */
export const PERSISTENT_BAKE_NOTIFICATION_ID = 1;

// ---- Feeding reminders: one persisted ID per starter UUID ----
export const FEEDING_REMINDER_MIN = 100;
export const FEEDING_REMINDER_MAX = 99_999;
const FEEDING_REMINDER_MAP_KEY = 'notif.feedingReminderIds'; // Record<uuid, id>
const FEEDING_REMINDER_NEXT_KEY = 'notif.feedingReminderNext'; // next free id

/**
 * Stable notification ID for a starter's feeding reminder. Assigns a fresh
 * sequential ID the first time, then returns the same ID forever. Persisted in
 * the Dexie settings store (distinct from user settings in localStorage).
 */
export async function getFeedingReminderId(starterUuid: string): Promise<number> {
  const map = await getSetting<Record<string, number>>(FEEDING_REMINDER_MAP_KEY, {});
  const existing = map[starterUuid];
  if (existing !== undefined) return existing;

  const next = await getSetting<number>(FEEDING_REMINDER_NEXT_KEY, FEEDING_REMINDER_MIN);
  const id = Math.min(next, FEEDING_REMINDER_MAX);

  map[starterUuid] = id;
  await setSetting(FEEDING_REMINDER_MAP_KEY, map);
  await setSetting(FEEDING_REMINDER_NEXT_KEY, id + 1);
  return id;
}

/** Release a starter's feeding-reminder ID (e.g. when the starter is deleted). */
export async function releaseFeedingReminderId(starterUuid: string): Promise<void> {
  const map = await getSetting<Record<string, number>>(FEEDING_REMINDER_MAP_KEY, {});
  if (map[starterUuid] === undefined) return;
  delete map[starterUuid];
  await setSetting(FEEDING_REMINDER_MAP_KEY, map);
}

// ---- Timeline blocks: a reserved contiguous block per timeline ----
const TIMELINE_BLOCK_MIN = 100_000;
const TIMELINE_BLOCK_MAX = 1_999_999;
/**
 * IDs reserved per timeline. A timeline schedules one notification per step
 * plus optional 5-minute reminders, so 1000 comfortably covers any real bake
 * while keeping blocks easy to reason about.
 */
export const TIMELINE_BLOCK_SIZE = 1000;
const TIMELINE_NEXT_KEY = 'notif.timelineNextBase'; // next free block base

/**
 * Allocate a fresh notification base ID for a timeline. Each call returns a
 * base that is TIMELINE_BLOCK_SIZE apart from the previous one, so a timeline's
 * step IDs (base + index) never overlap another timeline's block. Wraps back to
 * the start of the range if it is ever exhausted (far beyond realistic use).
 */
export async function allocateTimelineBaseId(): Promise<number> {
  const next = await getSetting<number>(TIMELINE_NEXT_KEY, TIMELINE_BLOCK_MIN);
  const base = next + TIMELINE_BLOCK_SIZE > TIMELINE_BLOCK_MAX ? TIMELINE_BLOCK_MIN : next;
  await setSetting(TIMELINE_NEXT_KEY, base + TIMELINE_BLOCK_SIZE);
  return base;
}
