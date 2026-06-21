// Levain - Type Definitions

// ============================================================================
// Starter Types
// ============================================================================

export interface Starter {
  id?: number;
  uuid: string;
  name: string;
  flourType: string;
  hydration: number;
  createdDate: Date;
  isActive: boolean;
  notes: string;
  photoUri?: string;
  lastFed?: Date;
  healthScore?: number;
  averagePeakTime?: number;
  /** Most recent Claude photo analysis of this starter (if any). */
  lastAnalysis?: StarterAnalysis;
  syncedAt?: Date;
}

export interface Feeding {
  id?: number;
  uuid: string;
  starterId: string;
  timestamp: Date;
  ratio: string;
  starterWeight: number;
  flourWeight: number;
  waterWeight: number;
  flourType: string;
  waterTemp?: number;
  ambientTemp?: number;
  peakTime?: Date;
  peakHeight?: number;
  photoBefore?: string;
  photoAtPeak?: string;
  photoAfter?: string;
  aiAnalysis?: AIAnalysis;
  notes: string;
  syncedAt?: Date;
}

export interface FeedingSchedule {
  frequency: 'twice_daily' | 'daily' | 'every_other_day' | 'weekly' | 'as_needed';
  preferredTimes: string[];
  notificationsEnabled: boolean;
  autoAdjustForTemp: boolean;
}

// ============================================================================
// Recipe Types
// ============================================================================

export interface Recipe {
  id?: number;
  uuid: string;
  name: string;
  description: string;
  category: RecipeCategory;
  totalFlour: number;
  hydration: number;
  starterPercent: number;
  saltPercent: number;
  flourBreakdown: FlourComponent[];
  additions: Addition[];
  method: MethodStep[];
  timing: RecipeTiming;
  sourceUrl?: string;
  sourceAttribution?: string;
  photo?: string;
  notes: string;
  isFavorite: boolean;
  isBuiltIn?: boolean; // true for default recipes, false/undefined for user-created
  timesUsed: number;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
}

export type RecipeCategory =
  | 'country_loaf'
  | 'sandwich'
  | 'focaccia'
  | 'enriched'
  | 'whole_grain'
  | 'specialty'
  | 'buns'
  | 'pizza'
  | 'rye'
  | 'discard';

export interface FlourComponent {
  type: string;
  percent: number;
  grams?: number;
}

export interface Addition {
  name: string;
  percent: number;
  grams?: number;
  addAt?: string;
}

export interface MethodStep {
  order: number;
  step: string;
  description: string;
  duration: number;
  waitTime: number;
  tips?: string;
}

export interface RecipeTiming {
  totalTime: string;
  handsOnTime: string;
  bestFor: string;
}

// ============================================================================
// Bake (Journal) Types
// ============================================================================

export interface Bake {
  id?: number;
  uuid: string;
  date: Date;
  recipeName: string;
  recipeId?: string;
  starterId?: string;
  ingredients: BakeIngredients;
  process: BakeProcess;
  baking: BakingDetails;
  environment: BakeEnvironment;
  results: BakeResults;
  photos: BakePhoto[];
  aiAnalysis?: BakeAIAnalysis;
  notes: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
}

export interface BakeIngredients {
  totalFlour: number;
  hydration: number;
  starterPercent: number;
  saltPercent: number;
  flourBreakdown: FlourComponent[];
  additions: Addition[];
}

export interface BakeProcess {
  autolyseTime?: number;
  bulkTime: number;
  bulkTemp: number;
  folds: number;
  foldMethod: FoldMethod;
  proofMethod: ProofMethod;
  proofTime: number;
  proofTemp: number;
  shapeType: ShapeType;
}

export type FoldMethod = 'stretch_fold' | 'coil_fold' | 'lamination' | 'slap_fold';
export type ProofMethod = 'room_temp' | 'cold_retard' | 'proofbox';
export type ShapeType = 'boule' | 'batard' | 'baguette' | 'focaccia' | 'other';

export interface BakingDetails {
  ovenTemp: number;
  steamMethod: string;
  coveredTime: number;
  uncoveredTime: number;
  finalInternalTemp?: number;
}

export interface BakeEnvironment {
  ambientTemp: number;
  humidity?: number;
  notes?: string;
}

export interface BakeResults {
  ovenSpring: Rating;
  crumbStructure: Rating;
  crust: Rating;
  flavor: Rating;
  sourness: Rating;
  overall: Rating;
  whatWorked: string;
  toImprove: string;
}

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface BakePhoto {
  id: string;
  type: 'dough' | 'shaped' | 'scored' | 'baked' | 'crumb' | 'other';
  uri: string;
  timestamp: Date;
  caption?: string;
}

export interface BakeAIAnalysis {
  timestamp: Date;
  overallAssessment: string;
  strengths: string[];
  improvements: string[];
  nextBakeSuggestions: string[];
}

// ============================================================================
// Timeline Types
// ============================================================================

export interface ActiveTimeline {
  id?: number;
  uuid: string;
  name: string;
  recipeId?: string;
  startTime: Date;
  steps: TimelineStep[];
  currentStepIndex: number;
  status: TimelineStatus;
  notifications: ScheduledNotification[];
  notificationBaseId?: number; // Base ID used for scheduling notifications
  photos: TimelinePhoto[];
  notes: string;
}

export type TimelineStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface TimelineStep {
  id: string;
  name: string;
  description: string;
  scheduledTime: Date;
  actualStartTime?: Date;
  duration: number;
  actualDuration?: number;
  status: StepStatus;
  notes?: string;
  photos?: string[];
  photoPrompt?: string;
}

export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export interface TimelinePhoto {
  stepId: string;
  uri: string;
  timestamp: Date;
}

export interface ScheduledNotification {
  id: string;
  stepId: string;
  triggerTime: Date;
  title: string;
  body: string;
  sent: boolean;
}

// ============================================================================
// Calculator Types
// ============================================================================

export interface ReverseCalculatorInput {
  desiredReadyTime: Date;
  ambientTemperature: number;
  flourType: FlourType;
  wholeGrainPercentage: number;
  starterHydration: number;
  starterStrength: StarterStrength;
  includeColdRetard: boolean;
  coldRetardDuration?: number;
  includeAutolyse: boolean;
  preferredBulkLocation: BulkLocation;
  avoidNightHours?: boolean; // Avoid scheduling tasks between sleep hours
  nightStartHour?: number; // Default 23 (11pm)
  nightEndHour?: number; // Default 7 (7am)
  bakeType?: 'bread' | 'rolls'; // Type of bake - affects shaping/baking steps
}

export type FlourType = 'bread' | 'allpurpose' | 'wholewheat' | 'rye' | 'mixed';
export type StarterStrength = 'weak' | 'developing' | 'normal' | 'strong' | 'vigorous';
export type BulkLocation = 'counter' | 'proofbox' | 'oven_light' | 'fridge';

export interface ReverseCalculatorOutput {
  feasible: boolean;
  recommendedInoculation: number;
  recommendedStarterRatio: string;
  schedule: ScheduleStep[];
  totalHours: number;
  warnings: string[];
  alternatives: AlternativeSchedule[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ScheduleStep {
  id: string;
  step: string;
  time: Date;
  duration: number;
  description: string;
  tips?: string;
  notifyBefore?: number;
  photoPrompt?: string;
}

export interface AlternativeSchedule {
  description: string;
  inoculation: number;
  totalHours: number;
  startTime: Date;
}

export interface BakersCalcInput {
  mode: 'from_flour' | 'from_loaf_weight';
  totalFlour?: number;
  desiredLoafWeight?: number;
  numberOfLoaves?: number;
  hydration: number;
  starterPercent: number;
  saltPercent: number;
  starterHydration: number;
  additions?: Addition[];
}

export interface BakersCalcOutput {
  flour: number;
  water: number;
  starter: number;
  salt: number;
  additions: { name: string; grams: number }[];
  totalDoughWeight: number;
  trueHydration: number;
  prefermentedFlour: number;
  inoculation: number;
  weightPerLoaf?: number;
}

export interface DDTInput {
  desiredDoughTemp: number;
  roomTemp: number;
  flourTemp: number;
  starterTemp: number;
  frictionFactor: number;
}

export interface DDTOutput {
  waterTemp: number;
  warnings: string[];
}

// ============================================================================
// AI Analysis Types
// ============================================================================

export interface AIAnalysis {
  timestamp: Date;
  type: 'starter' | 'crumb' | 'dough' | 'ear';
  summary: string;
  scores?: Record<string, number>;
  observations: string[];
  suggestions: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface StarterAnalysis extends AIAnalysis {
  type: 'starter';
  scores: {
    activity: number;
    health: number;
    readiness: number;
  };
  estimatedHoursSinceFeed: string;
  readyToBake: boolean;
}

export interface CrumbAnalysis extends AIAnalysis {
  type: 'crumb';
  scores: {
    openness: number;
    evenness: number;
    fermentation: number;
    gluten: number;
  };
  proofingAssessment: 'under' | 'good' | 'over';
}

// ============================================================================
// Settings Types
// ============================================================================

export interface Settings {
  key: string;
  value: unknown;
}

export interface UserSettings {
  units: 'metric' | 'imperial';
  temperatureUnit: 'celsius' | 'fahrenheit';
  timeFormat: '12h' | '24h';
  defaultHydration: number;
  defaultStarterPercent: number;
  defaultSaltPercent: number;
  defaultStarterHydration: number;
  defaultAmbientTemp: number;
  notificationsEnabled: boolean;
  hapticFeedbackEnabled: boolean;
  darkMode: 'system' | 'light' | 'dark';
  claudeApiKey?: string;
  syncEnabled: boolean;
  syncUrl?: string;
  // Feeding reminder settings
  feedingRemindersEnabled: boolean;
  feedingReminderHours: number; // Hours after feeding to remind
}

export const DEFAULT_SETTINGS: UserSettings = {
  units: 'metric',
  temperatureUnit: 'celsius',
  timeFormat: '24h',
  defaultHydration: 75,
  defaultStarterPercent: 20,
  defaultSaltPercent: 2,
  defaultStarterHydration: 100,
  defaultAmbientTemp: 23,
  notificationsEnabled: true,
  hapticFeedbackEnabled: true,
  darkMode: 'system',
  syncEnabled: false,
  feedingRemindersEnabled: true,
  feedingReminderHours: 12, // Default: remind 12 hours after feeding
};

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  | 'feeding_reminder'
  | 'starter_peak'
  | 'step_upcoming'
  | 'step_now'
  | 'bulk_check'
  | 'preheat_oven'
  | 'timer_complete'
  | 'bake_complete';
