// Claude (Anthropic) integration for levain.
//
// Transport: direct-from-device, bring-your-own API key. The user pastes their
// Anthropic API key in Settings; it's stored locally and sent straight to
// api.anthropic.com from the device. This is the simplest model for a
// local-first app with no backend. If a server proxy is added later, only
// `createClient()` below needs to change (point it at the proxy URL and drop
// the in-browser key).
//
// NOTE: a Claude Max / Pro consumer subscription CANNOT be used here — it
// authenticates via claude.ai OAuth and is not licensed for embedding in
// third-party apps. This requires a pay-as-you-go API key (sk-ant-...).

import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { useSettingsStore } from '../stores/settingsStore';
import type { PhotoBase64 } from './photos';
import type { StarterAnalysis, StarterAnalysisContext, CrumbAnalysis } from '../types';
import { classifyStage } from './starterStages';

// Re-exported for callers that import the context type from here.
export type { StarterAnalysisContext } from '../types';

// Cloud "deep analysis" model. Haiku 4.5 is the cheapest Claude vision model
// and is well-suited to single-image scoring + short advice; a single starter
// analysis costs a fraction of a cent. The free on-device path
// (src/lib/starterVision.ts) remains the default, so this only runs when the
// user opts in with their own API key.
const MODEL = 'claude-haiku-4-5';

/** Thrown when analysis is attempted without an API key configured. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('No Claude API key set. Add one in Settings → AI Features to enable photo analysis.');
    this.name = 'MissingApiKeyError';
  }
}

/** Read the BYO key from the settings store (outside React). */
function getApiKey(): string {
  const key = useSettingsStore.getState().settings.claudeApiKey?.trim();
  if (!key) throw new MissingApiKeyError();
  return key;
}

function createClient(): Anthropic {
  return new Anthropic({
    apiKey: getApiKey(),
    // Required to call the API directly from a browser/WebView context. Safe
    // here because the key is the user's own, entered on their own device.
    dangerouslyAllowBrowser: true,
  });
}

/** Quick sanity check of the configured key. Returns true if it authenticates. */
export async function testApiKey(): Promise<boolean> {
  const client = createClient();
  // A tiny, cheap request just to confirm the key authenticates.
  await client.messages.create({
    model: MODEL,
    max_tokens: 8,
    messages: [{ role: 'user', content: 'ping' }],
  });
  return true;
}

// JSON schema mirroring StarterAnalysis. Scores are 0-100 integers; the
// `readyToBake` flag and qualitative arrays come straight from the model.
const STARTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: 'One or two sentence overall assessment.' },
    activity: { type: 'integer', description: 'Fermentation activity score, 0-100.' },
    health: { type: 'integer', description: 'Overall health score, 0-100.' },
    readiness: { type: 'integer', description: 'Readiness-to-bake score, 0-100.' },
    estimatedHoursSinceFeed: {
      type: 'string',
      description: 'Best guess of hours since the last feed based on the photo, e.g. "4-6 hours".',
    },
    readyToBake: { type: 'boolean', description: 'Whether the starter looks ready to use in a bake now.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    observations: {
      type: 'array',
      items: { type: 'string' },
      description: 'What is visible in the photo (bubbles, dome, surface, etc.).',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Actionable next steps for the baker.',
    },
  },
  required: [
    'summary',
    'activity',
    'health',
    'readiness',
    'estimatedHoursSinceFeed',
    'readyToBake',
    'confidence',
    'observations',
    'suggestions',
  ],
} as const;

function buildPrompt(ctx: StarterAnalysisContext): string {
  const fed =
    ctx.hoursSinceFeed === undefined
      ? 'unknown time since last feeding'
      : `about ${Math.round(ctx.hoursSinceFeed)} hours since last feeding`;
  const temp =
    ctx.ambientTemp === undefined ? 'unknown' : `about ${Math.round(ctx.ambientTemp)}°C`;

  // Time/temperature-based stage hint from the shared model (no photo signals —
  // Claude judges the photo itself, but this anchors the feed-cycle framing).
  const stageHint = classifyStage(ctx);
  const stageLine =
    stageHint.stage === 'unknown'
      ? 'No feed time logged, so the feeding-cycle stage is unknown from timing alone.'
      : `Based on time since feeding and temperature, the starter is likely in its "${stageHint.label}" stage. Use the photo to confirm or correct this.`;

  return [
    'You are an expert sourdough baker assessing a sourdough starter from a photo.',
    'Judge fermentation activity, health, and readiness to bake.',
    '',
    'A fed starter passes through stages: just-fed (weakest) → rising → peak (best to bake) → falling/past-peak → hungry (collapsed, may show hooch). A starter is only "ready to bake" at or just before its peak — a freshly-fed starter is NOT ready even if it already shows bubbles.',
    '',
    'Context about this starter:',
    `- Age: ${ctx.ageDays} day(s) old`,
    `- Hydration: ${ctx.hydration}%`,
    `- Primary flour: ${ctx.flourType}`,
    `- Feeding: ${fed}`,
    `- Ambient temperature: ${temp}`,
    `- ${stageLine}`,
    '',
    'Look at rise/dome, bubble size and distribution, surface texture, and any liquid (hooch).',
    'Score activity, health, and readiness from 0 to 100. Set readyToBake true only if it is at/just-before peak. Be specific and practical in observations and suggestions.',
  ].join('\n');
}

const RATINGS = [1, 2, 3, 4, 5] as const;
type Rating = (typeof RATINGS)[number];

/** Map a 0-100 score to the 1-5 Rating scale used by AIAnalysis.scores. */
function toRating(score: number): Rating {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const idx = Math.min(4, Math.floor(clamped / 20)); // 0-19→0 ... 80-100→4
  return RATINGS[idx];
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface StarterAnalysisResult {
  /** Full analysis to store on Starter.lastAnalysis. */
  analysis: StarterAnalysis;
  /** 0-100 health score for the Starter.healthScore card. */
  healthScore: number;
}

/**
 * Analyze a starter photo with Claude vision. Throws MissingApiKeyError if no
 * key is configured, or surfaces the SDK's typed API errors (RateLimitError,
 * AuthenticationError, etc.).
 */
export async function analyzeStarter(
  photo: PhotoBase64,
  ctx: StarterAnalysisContext
): Promise<StarterAnalysisResult> {
  const client = createClient();

  const message = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: jsonSchemaOutputFormat(STARTER_SCHEMA) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: photo.mediaType, data: photo.data },
          },
          { type: 'text', text: buildPrompt(ctx) },
        ],
      },
    ],
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error('Claude returned an unexpected response. Please try again.');
  }

  // Stage for the badge: prefer the time/temp-based hint; if timing is unknown
  // but Claude judged it bake-ready from the photo, treat that as peak.
  const stageHint = classifyStage(ctx);
  const stage =
    stageHint.stage !== 'unknown'
      ? stageHint.stage
      : parsed.readyToBake
        ? 'peak'
        : 'unknown';
  const stageLabel = stage === 'peak' && stageHint.stage === 'unknown' ? 'Peak — bake now' : stageHint.label;

  const analysis: StarterAnalysis = {
    timestamp: new Date(),
    type: 'starter',
    source: 'claude',
    stage,
    stageLabel,
    summary: parsed.summary,
    scores: {
      activity: toRating(parsed.activity),
      health: toRating(parsed.health),
      readiness: toRating(parsed.readiness),
    },
    estimatedHoursSinceFeed: parsed.estimatedHoursSinceFeed,
    readyToBake: parsed.readyToBake,
    observations: parsed.observations ?? [],
    suggestions: parsed.suggestions ?? [],
    confidence: parsed.confidence,
  };

  return { analysis, healthScore: clamp100(parsed.health) };
}

// ============================================================================
// Crumb analysis
// ============================================================================

/** Optional context to sharpen the crumb assessment. */
export interface CrumbAnalysisContext {
  hydration?: number;
  flourNote?: string;
}

// JSON schema mirroring CrumbAnalysis. Scores 0-100; proofing is a 3-way verdict.
const CRUMB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: 'One or two sentence overall assessment of the crumb.' },
    openness: { type: 'integer', description: 'How open/airy the crumb is, 0-100.' },
    evenness: { type: 'integer', description: 'How even the hole distribution is, 0-100.' },
    fermentation: { type: 'integer', description: 'Apparent fermentation quality, 0-100.' },
    gluten: { type: 'integer', description: 'Apparent gluten development / structure, 0-100.' },
    proofingAssessment: {
      type: 'string',
      enum: ['under', 'good', 'over'],
      description: 'Whether the loaf looks under-proofed, well-proofed, or over-proofed.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    observations: {
      type: 'array',
      items: { type: 'string' },
      description: 'What is visible in the crumb (hole size/distribution, gumminess, walls, etc.).',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Actionable next steps to improve the crumb.',
    },
  },
  required: [
    'summary',
    'openness',
    'evenness',
    'fermentation',
    'gluten',
    'proofingAssessment',
    'confidence',
    'observations',
    'suggestions',
  ],
} as const;

function buildCrumbPrompt(ctx: CrumbAnalysisContext): string {
  const hyd = ctx.hydration != null ? `${ctx.hydration}% hydration` : 'unknown hydration';
  return [
    'You are an expert sourdough baker assessing the CRUMB of a baked loaf from a cross-section photo.',
    'Judge how the bake turned out and whether the dough was under-, well-, or over-proofed.',
    '',
    'Signals to read:',
    '- Hole size and distribution (open vs tight; even vs irregular tunnels/voids)',
    '- Gumminess or dense gummy line (under-baked / under-proofed)',
    '- Thin shiny cell walls and a slightly collapsed, very open structure (over-proofed)',
    '- Overall fermentation and gluten development',
    '',
    `Context: ${hyd}.${ctx.flourNote ? ' ' + ctx.flourNote : ''}`,
    '',
    'Score openness, evenness, fermentation, and gluten from 0 to 100. Give a single proofing verdict (under/good/over). Be specific and practical in observations and suggestions.',
  ].join('\n');
}

/**
 * Analyze a crumb photo with Claude vision. Throws MissingApiKeyError if no key
 * is configured, or surfaces the SDK's typed API errors.
 */
export async function analyzeCrumb(
  photo: PhotoBase64,
  ctx: CrumbAnalysisContext = {}
): Promise<CrumbAnalysis> {
  const client = createClient();

  const message = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: jsonSchemaOutputFormat(CRUMB_SCHEMA) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: photo.mediaType, data: photo.data },
          },
          { type: 'text', text: buildCrumbPrompt(ctx) },
        ],
      },
    ],
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error('Claude returned an unexpected response. Please try again.');
  }

  return {
    timestamp: new Date(),
    type: 'crumb',
    source: 'claude',
    summary: parsed.summary,
    scores: {
      openness: toRating(parsed.openness),
      evenness: toRating(parsed.evenness),
      fermentation: toRating(parsed.fermentation),
      gluten: toRating(parsed.gluten),
    },
    proofingAssessment: parsed.proofingAssessment,
    observations: parsed.observations ?? [],
    suggestions: parsed.suggestions ?? [],
    confidence: parsed.confidence,
  };
}
