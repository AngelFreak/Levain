// Full-app backup & restore.
//
// Levain is local-first: all data lives in IndexedDB (Dexie) plus a few
// localStorage keys (user settings, notification-ID counters). A backup must
// capture ALL of it so a wipe or a new phone doesn't lose years of history.
//
// Photo handling is the subtle part: records store device webview paths
// (Capacitor `convertFileSrc` URLs) or, for built-in recipes, remote https URLs
// — neither portable across installs. When `includePhotos` is set we resolve
// each LOCAL photo reference to its bytes and inline it as a `data:` URI so the
// backup is self-contained; remote https URLs and existing data: URIs are left
// as-is. On import we rehydrate inlined photos back to device files.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db, generateUUID, getAllSettings } from './db';
import { useSettingsStore } from '../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../types';
import type {
  Starter,
  Feeding,
  Recipe,
  Bake,
  ActiveTimeline,
  UserSettings,
} from '../types';

/** Bumped whenever the persisted shape changes; import migrates older files. */
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupFile {
  app: 'levain';
  schemaVersion: number;
  exportDate: string;
  includesPhotos: boolean;
  data: {
    starters: Starter[];
    feedings: Feeding[];
    recipes: Recipe[];
    bakes: Bake[];
    activeTimelines: ActiveTimeline[];
  };
  /** User-facing settings (the resolved object, not Zustand's storage wrapper). */
  settings: UserSettings;
  /** Internal Dexie-stored key/values (e.g. notification-ID counters). */
  internal: Record<string, unknown>;
}

// ---- Photo embedding ----------------------------------------------------

/** A reference we should embed: a local file/webview path, not remote or inlined. */
function isLocalPhotoRef(ref: string | undefined): ref is string {
  if (!ref) return false;
  if (ref.startsWith('data:')) return false; // already inlined
  if (/^https?:\/\//i.test(ref)) {
    // Remote URL. Capacitor's convertFileSrc produces http(s) URLs on some
    // platforms (e.g. http://localhost/_capacitor_file_/...), which ARE local.
    return ref.includes('_capacitor_file_') || ref.includes('localhost');
  }
  return true; // blob:, file:, capacitor:, relative — treat as local
}

/** Read a local photo reference into a `data:` URI, or null if unreadable. */
async function photoRefToDataUri(ref: string): Promise<string | null> {
  try {
    // Native file:// path → read via Filesystem as base64.
    if (Capacitor.isNativePlatform() && (ref.startsWith('file://') || ref.startsWith('/'))) {
      const file = await Filesystem.readFile({ path: ref });
      const b64 = typeof file.data === 'string' ? file.data : '';
      return b64 ? `data:image/jpeg;base64,${b64}` : null;
    }
    // Otherwise fetch the URL (works for convertFileSrc URLs and blob:/web paths).
    const res = await fetch(ref);
    const blob = await res.blob();
    return await blobToDataUri(blob);
  } catch (error) {
    console.warn('Could not read photo for backup:', ref, error);
    return null;
  }
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Photos are inherently dynamic (string fields + a nested array), so the
// photo walkers operate on loosely-typed rows. Public functions stay typed.
type AnyRow = Record<string, unknown>;

/** Photo-bearing flat fields per entity. Bake photos (nested array) handled separately. */
const PHOTO_FIELDS = {
  starters: ['photoUri'],
  feedings: ['photoBefore', 'photoAtPeak', 'photoAfter'],
  recipes: ['photo'],
  bakes: [] as string[],
};

/** Replace local photo refs in a record array with inlined data: URIs (copies). */
async function embedPhotos(rows: AnyRow[], fields: string[]): Promise<AnyRow[]> {
  const out: AnyRow[] = [];
  for (const row of rows) {
    const copy: AnyRow = { ...row };
    for (const f of fields) {
      const ref = copy[f] as string | undefined;
      if (isLocalPhotoRef(ref)) {
        const dataUri = await photoRefToDataUri(ref);
        if (dataUri) copy[f] = dataUri;
      }
    }
    if (Array.isArray(copy.photos)) {
      copy.photos = await Promise.all(
        (copy.photos as Array<{ uri?: string }>).map(async (p) => {
          if (isLocalPhotoRef(p.uri)) {
            const dataUri = await photoRefToDataUri(p.uri as string);
            return dataUri ? { ...p, uri: dataUri } : p;
          }
          return p;
        })
      );
    }
    out.push(copy);
  }
  return out;
}

// ---- Export -------------------------------------------------------------

/**
 * Build a complete, portable backup object. With `includePhotos` (default),
 * local photos are inlined as data: URIs so the file restores on any device.
 */
export async function exportAllData(includePhotos = true): Promise<BackupFile> {
  const [starters, feedings, recipes, bakes, activeTimelines, internal] = await Promise.all([
    db.starters.toArray(),
    db.feedings.toArray(),
    db.recipes.toArray(),
    db.bakes.toArray(),
    db.activeTimelines.toArray(),
    getAllSettings(), // Dexie settings table (notification counters, migration flags)
  ]);

  const embed = async <T>(rows: T[], fields: string[]): Promise<T[]> =>
    includePhotos ? ((await embedPhotos(rows as AnyRow[], fields)) as T[]) : rows;

  const data: BackupFile['data'] = {
    starters: await embed(starters, PHOTO_FIELDS.starters),
    feedings: await embed(feedings, PHOTO_FIELDS.feedings),
    recipes: await embed(recipes, PHOTO_FIELDS.recipes),
    bakes: await embed(bakes, PHOTO_FIELDS.bakes), // nested photos handled inside embedPhotos
    activeTimelines,
  };

  return {
    app: 'levain',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportDate: new Date().toISOString(),
    includesPhotos: includePhotos,
    data,
    settings: useSettingsStore.getState().settings,
    internal,
  };
}

/** Rough byte size of a backup, for warning the user before they share it. */
export function estimateBackupSize(backup: BackupFile): number {
  return new Blob([JSON.stringify(backup)]).size;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Write a backup to a file the user can keep/share. On native, writes to the
 * app cache and opens the share sheet; on web, triggers a JSON download.
 * Returns a short human description of where it went.
 */
export async function saveAndShareBackup(backup: BackupFile): Promise<string> {
  const json = JSON.stringify(backup);
  const filename = `levain-backup-${backup.exportDate.split('T')[0]}.json`;

  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({
        title: 'Levain backup',
        text: 'Your Levain data backup',
        url: written.uri,
        dialogTitle: 'Save or share your Levain backup',
      });
      return 'Backup ready — choose where to save it.';
    } catch {
      // User dismissed the share sheet, or sharing unsupported. File still exists.
      return `Backup saved to app storage (${filename}).`;
    }
  }

  // Web fallback: anchor download.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'Backup downloaded.';
}

/**
 * Open a file picker and read the chosen backup file as text. Resolves to null
 * if the user cancels. Uses a hidden <input type=file>, which works in both the
 * browser and the Capacitor webview.
 */
export function pickAndReadBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    // If the dialog is cancelled, onchange may not fire; we simply never resolve
    // with a value in that case (the promise stays pending until GC). To avoid a
    // leak, resolve(null) on window focus returning without a selection.
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) resolve(null);
        window.removeEventListener('focus', onFocus);
      }, 500);
    };
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

// ---- Validation & date revival -----------------------------------------

export class BackupValidationError extends Error {}

/** Date-bearing fields to revive (ISO strings → Date) after JSON parse. */
const DATE_FIELDS: Record<string, string[]> = {
  starters: ['createdDate', 'lastFed', 'syncedAt'],
  feedings: ['timestamp', 'peakTime', 'syncedAt'],
  recipes: ['lastUsed', 'createdAt', 'updatedAt', 'syncedAt'],
  bakes: ['date', 'createdAt', 'updatedAt', 'syncedAt'],
  activeTimelines: ['startTime'],
};

function reviveDates(rows: Record<string, unknown>[], fields: string[]): void {
  for (const row of rows) {
    for (const f of fields) {
      if (typeof row[f] === 'string') row[f] = new Date(row[f] as string);
    }
  }
}

/**
 * Parse + validate a backup file's text. Throws BackupValidationError on
 * anything unexpected so callers never write garbage. Returns a normalized
 * BackupFile with Dates revived.
 */
export function parseBackup(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupValidationError('That file is not valid JSON.');
  }
  const b = json as Partial<BackupFile>;
  if (!b || b.app !== 'levain' || typeof b.schemaVersion !== 'number' || !b.data) {
    throw new BackupValidationError('This does not look like a Levain backup.');
  }
  if (b.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupValidationError(
      'This backup was made by a newer version of Levain. Please update the app first.'
    );
  }
  const d = b.data as Record<string, unknown>;
  for (const key of ['starters', 'feedings', 'recipes', 'bakes', 'activeTimelines']) {
    if (d[key] !== undefined && !Array.isArray(d[key])) {
      throw new BackupValidationError(`Backup field "${key}" is malformed.`);
    }
    if (d[key] === undefined) d[key] = [];
    reviveDates(d[key] as Record<string, unknown>[], DATE_FIELDS[key]);
  }
  return b as BackupFile;
}

// ---- Photo rehydration (import) ----------------------------------------

/**
 * Turn an inlined data: URI back into a stored photo, returning the reference
 * to persist. On native this writes a file and returns a webview path; on web
 * (or non-data refs) it returns the value unchanged.
 */
async function rehydratePhotoRef(ref: string | undefined): Promise<string | undefined> {
  if (!ref || !ref.startsWith('data:')) return ref;
  if (!Capacitor.isNativePlatform()) return ref; // web can render data: URIs directly
  try {
    const comma = ref.indexOf(',');
    const base64 = ref.slice(comma + 1);
    const filename = `imported/${generateUUID()}.jpeg`;
    const saved = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    return Capacitor.convertFileSrc(saved.uri);
  } catch (error) {
    console.warn('Could not rehydrate photo on import:', error);
    return ref; // fall back to the data: URI (still renders, just larger)
  }
}

/** Rehydrate inlined photos in-place on loosely-typed rows. */
async function rehydrateRows(rows: AnyRow[], fields: string[]): Promise<void> {
  for (const row of rows) {
    for (const f of fields) {
      row[f] = await rehydratePhotoRef(row[f] as string | undefined);
    }
    if (Array.isArray(row.photos)) {
      row.photos = await Promise.all(
        (row.photos as Array<{ uri?: string }>).map(async (p) => ({
          ...p,
          uri: await rehydratePhotoRef(p.uri),
        }))
      );
    }
  }
}

async function rehydrateAllPhotos(data: BackupFile['data']): Promise<void> {
  await rehydrateRows(data.starters as unknown as AnyRow[], PHOTO_FIELDS.starters);
  await rehydrateRows(data.feedings as unknown as AnyRow[], PHOTO_FIELDS.feedings);
  await rehydrateRows(data.recipes as unknown as AnyRow[], PHOTO_FIELDS.recipes);
  await rehydrateRows(data.bakes as unknown as AnyRow[], PHOTO_FIELDS.bakes);
}

// ---- Import -------------------------------------------------------------

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  starters: number;
  feedings: number;
  recipes: number;
  bakes: number;
  activeTimelines: number;
}

/** Apply user settings + internal key/values from a backup. */
async function applySettingsAndInternal(backup: BackupFile): Promise<void> {
  if (backup.settings) {
    // Merge onto defaults so missing keys from older backups get sane values.
    useSettingsStore.getState().updateSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
  }
  if (backup.internal) {
    for (const [key, value] of Object.entries(backup.internal)) {
      await db.settings.put({ key, value });
    }
  }
}

/**
 * Restore from a parsed backup.
 *
 * - 'merge'  : upsert rows by uuid (recipes also keyed by slug); existing data kept.
 * - 'replace': clear everything, then load only the backup. Photos are rehydrated
 *   BEFORE the DB transaction, and user settings are applied only AFTER the DB
 *   write succeeds, so a failure leaves existing data intact (no partial wipe).
 *
 * Active timelines are restored as 'paused' to avoid resurrecting stale
 * step notifications from another device/time.
 */
export async function importAllData(
  backup: BackupFile,
  mode: ImportMode
): Promise<ImportResult> {
  // Rehydrate photos first (filesystem writes — cannot be inside a Dexie tx).
  await rehydrateAllPhotos(backup.data);

  const { starters, feedings, recipes, bakes, activeTimelines } = backup.data;
  const pausedTimelines = activeTimelines.map((t) =>
    t.status === 'active' ? { ...t, status: 'paused' as const } : t
  );

  if (mode === 'replace') {
    // Single transaction across all tables: atomic — a failure rolls back and
    // leaves the original data intact. Settings/internal applied only after.
    await db.transaction(
      'rw',
      [db.starters, db.feedings, db.recipes, db.bakes, db.activeTimelines],
      async () => {
        await Promise.all([
          db.starters.clear(),
          db.feedings.clear(),
          db.recipes.clear(),
          db.bakes.clear(),
          db.activeTimelines.clear(),
        ]);
        await db.starters.bulkAdd(stripIds(starters));
        await db.feedings.bulkAdd(stripIds(feedings));
        await db.recipes.bulkAdd(stripIds(recipes));
        await db.bakes.bulkAdd(stripIds(bakes));
        await db.activeTimelines.bulkAdd(stripIds(pausedTimelines));
      }
    );
    await applySettingsAndInternal(backup);
  } else {
    // Merge: upsert by uuid (recipes also dedupe by slug). Outside a single big
    // transaction is fine — merge never destroys existing data.
    for (const row of starters) await upsertStarter(row);
    for (const row of feedings) await upsertByUuid(db.feedings, row);
    for (const row of recipes) await upsertRecipe(row);
    for (const row of bakes) await upsertByUuid(db.bakes, row);
    for (const row of pausedTimelines) await upsertByUuid(db.activeTimelines, row);
    await applySettingsAndInternal(backup);
  }

  return {
    starters: starters.length,
    feedings: feedings.length,
    recipes: recipes.length,
    bakes: bakes.length,
    activeTimelines: activeTimelines.length,
  };
}

/** Return a copy of a row without its auto-increment id (Dexie assigns fresh). */
function withoutId<T extends { id?: number }>(row: T): T {
  const copy = { ...row };
  delete copy.id;
  return copy;
}

/** Drop auto-increment ids so Dexie assigns fresh ones (avoids id clashes). */
function stripIds<T extends { id?: number }>(rows: T[]): T[] {
  return rows.map(withoutId);
}

// Minimal shape every entity table shares (Dexie EntityTable satisfies this).
interface UuidTable<T extends { id?: number; uuid: string }> {
  where(index: 'uuid'): { equals(v: string): { first(): Promise<T | undefined> } };
  update(key: number, changes: Partial<T>): Promise<number>;
  add(row: T): Promise<number | undefined>;
}

async function upsertByUuid<T extends { id?: number; uuid: string }>(
  table: UuidTable<T>,
  row: T
): Promise<void> {
  const existing = await table.where('uuid').equals(row.uuid).first();
  const rest = withoutId(row);
  if (existing?.id !== undefined) {
    await table.update(existing.id, rest as Partial<T>);
  } else {
    await table.add(rest);
  }
}

// Starter has the same uuid-upsert semantics; named for clarity at call site.
async function upsertStarter(row: Starter): Promise<void> {
  await upsertByUuid(db.starters, row);
}

/** Recipe upsert by uuid, but also dedupe on slug to match seeding semantics. */
async function upsertRecipe(row: Recipe): Promise<void> {
  let existing = await db.recipes.where('uuid').equals(row.uuid).first();
  if (!existing && row.slug) {
    existing = await db.recipes.filter((r) => r.slug === row.slug).first();
  }
  const rest = withoutId(row);
  if (existing?.id !== undefined) {
    await db.recipes.update(existing.id, rest as Partial<Recipe>);
  } else {
    await db.recipes.add(rest);
  }
}
