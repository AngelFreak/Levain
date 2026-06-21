import Dexie, { type EntityTable } from 'dexie';
import type {
  Starter,
  Feeding,
  Recipe,
  Bake,
  ActiveTimeline,
  Settings,
} from '../types';

// Levain local database using Dexie (IndexedDB wrapper)
class LevainDatabase extends Dexie {
  starters!: EntityTable<Starter, 'id'>;
  feedings!: EntityTable<Feeding, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  bakes!: EntityTable<Bake, 'id'>;
  activeTimelines!: EntityTable<ActiveTimeline, 'id'>;
  settings!: EntityTable<Settings, 'key'>;

  constructor() {
    super('LevainDB');

    this.version(1).stores({
      // Primary key is 'id' (auto-increment), indexes after comma
      starters: '++id, uuid, name, isActive, lastFed, createdDate',
      feedings: '++id, uuid, starterId, timestamp, [starterId+timestamp]',
      recipes: '++id, uuid, name, category, isFavorite, lastUsed, createdAt',
      bakes: '++id, uuid, recipeId, starterId, date, isFavorite, *tags',
      activeTimelines: '++id, uuid, status, startTime',
      settings: 'key',
    });
  }
}

export const db = new LevainDatabase();

// Helper functions for common operations

// Generate UUID for new records
export function generateUUID(): string {
  return crypto.randomUUID();
}

// Starter operations
export async function createStarter(starter: Omit<Starter, 'id' | 'uuid'>): Promise<number | undefined> {
  return db.starters.add({
    ...starter,
    uuid: generateUUID(),
  } as Starter);
}

export async function getActiveStarters(): Promise<Starter[]> {
  // Note: Dexie doesn't support boolean index queries directly
  // Using filter for boolean fields (acceptable for small datasets like starters)
  return db.starters.filter((s) => s.isActive === true).toArray();
}

export async function getStarterWithFeedings(starterId: number) {
  const starter = await db.starters.get(starterId);
  if (!starter) return null;

  const feedings = await db.feedings
    .where('starterId')
    .equals(starter.uuid)
    .toArray();
  // Sort by timestamp descending (newest first)
  feedings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { starter, feedings };
}

// Feeding operations
export async function logFeeding(feeding: Omit<Feeding, 'id' | 'uuid'>): Promise<number | undefined> {
  const id = await db.feedings.add({
    ...feeding,
    uuid: generateUUID(),
  } as Feeding);

  // Update starter's lastFed
  await db.starters
    .where('uuid')
    .equals(feeding.starterId)
    .modify({ lastFed: feeding.timestamp });

  return id;
}

export async function getRecentFeedings(starterId: string, limit = 10): Promise<Feeding[]> {
  const feedings = await db.feedings
    .where('starterId')
    .equals(starterId)
    .toArray();
  // Sort by timestamp descending (newest first) and limit
  return feedings
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

// Recipe operations
export async function createRecipe(recipe: Omit<Recipe, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>): Promise<number | undefined> {
  const now = new Date();
  return db.recipes.add({
    ...recipe,
    uuid: generateUUID(),
    createdAt: now,
    updatedAt: now,
  } as Recipe);
}

export async function getFavoriteRecipes(): Promise<Recipe[]> {
  // Note: Dexie doesn't support boolean index queries directly
  return db.recipes.filter((r) => r.isFavorite === true).toArray();
}

export async function getRecipesByCategory(category: string): Promise<Recipe[]> {
  return db.recipes.where('category').equals(category).toArray();
}

// Bake operations
export async function logBake(bake: Omit<Bake, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>): Promise<number | undefined> {
  const now = new Date();
  return db.bakes.add({
    ...bake,
    uuid: generateUUID(),
    createdAt: now,
    updatedAt: now,
  } as Bake);
}

export async function getRecentBakes(limit = 20): Promise<Bake[]> {
  return db.bakes.orderBy('date').reverse().limit(limit).toArray();
}

export async function getBakesByRecipe(recipeId: string): Promise<Bake[]> {
  return db.bakes.where('recipeId').equals(recipeId).toArray();
}

// Timeline operations
export async function getActiveTimeline(): Promise<ActiveTimeline | undefined> {
  return db.activeTimelines.where('status').equals('active').first();
}

// Create a Bake journal entry from a completed ActiveTimeline
export async function createBakeFromTimeline(
  timeline: ActiveTimeline,
  overallRating: 1 | 2 | 3 | 4 | 5,
  notes: string
): Promise<number | undefined> {
  // Get recipe if available for more details
  const recipe = timeline.recipeId
    ? await db.recipes.where('uuid').equals(timeline.recipeId).first()
    : undefined;

  return logBake({
    date: new Date(timeline.startTime),
    recipeName: timeline.name,
    recipeId: timeline.recipeId,
    ingredients: {
      totalFlour: recipe?.totalFlour || 500,
      hydration: recipe?.hydration || 75,
      starterPercent: recipe?.starterPercent || 20,
      saltPercent: recipe?.saltPercent || 2,
      flourBreakdown: recipe?.flourBreakdown || [],
      additions: recipe?.additions || [],
    },
    process: {
      bulkTime: 4,
      bulkTemp: 24,
      folds: 4,
      foldMethod: 'stretch_fold',
      proofMethod: 'room_temp',
      proofTime: 2,
      proofTemp: 24,
      shapeType: 'boule',
    },
    baking: {
      ovenTemp: 245,
      steamMethod: 'Dutch oven',
      coveredTime: 20,
      uncoveredTime: 25,
    },
    environment: {
      ambientTemp: 22,
    },
    results: {
      overall: overallRating,
      ovenSpring: overallRating,
      crumbStructure: overallRating,
      crust: overallRating,
      flavor: overallRating,
      sourness: 3,
      whatWorked: '',
      toImprove: '',
    },
    photos: timeline.photos?.map((p) => ({
      id: p.stepId,
      type: 'other' as const,
      uri: p.uri,
      timestamp: new Date(p.timestamp),
    })) || [],
    notes: notes || timeline.notes || '',
    tags: [],
    isFavorite: false,
  });
}

export async function createTimeline(
  timeline: Omit<ActiveTimeline, 'id' | 'uuid'>
): Promise<number | undefined> {
  return db.activeTimelines.add({
    ...timeline,
    uuid: generateUUID(),
  } as ActiveTimeline);
}

// Settings operations
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const setting = await db.settings.get(key);
  return setting ? (setting.value as T) : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const settings = await db.settings.toArray();
  return settings.reduce(
    (acc, { key, value }) => ({ ...acc, [key]: value }),
    {}
  );
}
