// Config + safe defaults for the AI recipe-generation feature. Runtime knobs come
// from env vars with these fallbacks. The API key is read from GEMINI_API_KEY only
// in GeminiService and never referenced here.

export const AI_DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const AI_DEFAULT_TIMEOUT_MS = 20000;
export const AI_DEFAULT_MAX_INPUT_LENGTH = 6000;
export const AI_MIN_INPUT_LENGTH = 10;

// The feature is admin-only. Group admins (owner/admin of a family) get a daily
// quota; the super-admin is unlimited.
export const AI_RECIPE_DAILY_LIMIT_DEFAULT = 20;

export const AI_TEMPERATURE = 0.2;
export const AI_MAX_OUTPUT_TOKENS = 4096;

// In-memory per-instance abuse guard for the parse endpoint (soft, not a hard quota).
export const AI_COOLDOWN_MS = 4000;
export const AI_WINDOW_MS = 60000;
export const AI_MAX_PER_WINDOW = 12;

// Structural caps so a malformed/adversarial model response can't produce an
// unbounded payload.
export const AI_MAX_INGREDIENTS = 60;
export const AI_MAX_STEPS = 40;
export const AI_MAX_TAGS = 20;
export const AI_MAX_CATEGORIES = 8;

// Numeric ceilings (kept sane for a recipe).
export const AI_MAX_MINUTES = 6000; // 100h
export const AI_MAX_CALORIES = 100000;
/** One ingredient at its amount (2 kg of butter is ~15000 kcal). */
export const AI_MAX_INGREDIENT_KCAL = 20000;
export const AI_MAX_SERVINGS = 100;
export const AI_MAX_STRING = 400;
export const AI_MAX_DESCRIPTION = 2000;
export const AI_MAX_STEP_TEXT = 2000;

// Taste profile: six dimensions the model estimates, each clamped to 0..AI_TASTE_MAX
// (matches the editor's 0-5 sliders).
export const AI_TASTE_MAX = 5;
export const TASTE_KEYS = ['sweet', 'salty', 'sour', 'bitter', 'spicy', 'umami'] as const;

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const RECIPE_CATEGORIES = [
    'quick',
    'healthy',
    'dessert',
    'everyday',
    'festive',
    'vegetarian',
    'breakfast',
    'lunch',
    'dinner',
    'snack',
    'soup',
    'salad',
    'baking',
] as const;

export const AI_DEFAULT_DIFFICULTY = 'easy';

// Normalized, non-leaking error codes surfaced to the client + stored in AiUsageLog.
export const AI_ERROR = {
    NOT_CONFIGURED: 'GEMINI_NOT_CONFIGURED',
    FORBIDDEN: 'AI_FORBIDDEN',
    DAILY_LIMIT: 'AI_DAILY_LIMIT',
    INPUT_TOO_SHORT: 'INPUT_TOO_SHORT',
    INPUT_TOO_LONG: 'INPUT_TOO_LONG',
    TIMEOUT: 'TIMEOUT',
    RATE_LIMIT: 'RATE_LIMIT',
    INVALID_RESPONSE: 'INVALID_RESPONSE',
    EMPTY_RESULT: 'EMPTY_RESULT',
    GEMINI_ERROR: 'GEMINI_ERROR',
    MEDIA_UNSUPPORTED: 'MEDIA_UNSUPPORTED',
    BAD_URL: 'BAD_URL',
    SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
    SOURCE_EMPTY: 'SOURCE_EMPTY',
    BAD_IMAGE: 'BAD_IMAGE',
} as const;

// Official Gemini free-tier limits per model (static reference for the admin tab).
export const GEMINI_FREE_TIER_LIMITS: Record<string, { rpm: number; rpd: number; tpm: number }> = {
    'gemini-2.5-flash': { rpm: 10, rpd: 250, tpm: 250000 },
    'gemini-2.5-flash-lite': { rpm: 15, rpd: 1000, tpm: 250000 },
    'gemini-3.1-flash-lite': { rpm: 15, rpd: 1000, tpm: 250000 },
    'gemini-2.5-pro': { rpm: 5, rpd: 100, tpm: 250000 },
};
export const GEMINI_LIMITS_SOURCE_URL = 'https://ai.google.dev/gemini-api/docs/rate-limits';
export const GEMINI_QUOTA_DASHBOARD_URL = 'https://aistudio.google.com/rate-limit';

export const AI_OPERATION = 'parse_recipe';
export const AI_IMPORT_OPERATION = 'import_recipe';
/** Every operation that spends the per-user daily AI quota. */
export const AI_QUOTA_OPERATIONS = [AI_OPERATION, AI_IMPORT_OPERATION];

// ── Recipe import (link / photo / text) ──────────────────────────────────────

/** Generous timeouts: a link import reads a whole page, a video import watches it. */
export const AI_IMPORT_TIMEOUT_MS = 55000;
export const AI_IMPORT_VIDEO_TIMEOUT_MS = 110000;
export const AI_IMPORT_MAX_OUTPUT_TOKENS = 8192;
export const AI_IMPORT_MAX_IMAGES = 4;
/** Decoded bytes per attached photo (the client downsizes before sending). */
export const AI_IMPORT_MAX_IMAGE_BYTES = 1_600_000;
/** Source text handed to the model (caption + structured data + page text). */
export const AI_IMPORT_MAX_SOURCE_CHARS = 16000;
/** A post's own video file is sent inline only up to this size (Gemini's inline cap is ~20 MB). */
export const AI_IMPORT_MAX_VIDEO_BYTES = 14_000_000;
/** The model watches at most this much of a YouTube video (longer ones: description only when known). */
export const AI_IMPORT_MAX_VIDEO_SECONDS = 20 * 60;

export function aiImportModel(): string {
    return (process.env.GEMINI_IMPORT_MODEL || '').trim() || aiModel();
}

// USD per 1M tokens (paid tier, ai.google.dev/gemini-api/docs/pricing, checked
// 2026-10-10). Thinking tokens bill at the output rate. Unknown models fall back to
// the default model's price so the estimate never silently reads as free.
export const GEMINI_PRICES_USD_PER_M: Record<string, { input: number; audioInput: number; output: number }> = {
    'gemini-3.1-flash-lite': { input: 0.25, audioInput: 0.5, output: 1.5 },
    'gemini-3.5-flash-lite': { input: 0.3, audioInput: 0.3, output: 2.5 },
    'gemini-3.6-flash': { input: 0.75, audioInput: 0.75, output: 3.75 },
    'gemini-3.8-flash': { input: 0.75, audioInput: 0.75, output: 3.75 },
    'gemini-3-flash-preview': { input: 0.5, audioInput: 1.0, output: 3.0 },
    'gemini-2.5-flash-lite': { input: 0.1, audioInput: 0.3, output: 0.4 },
    'gemini-2.5-flash': { input: 0.3, audioInput: 1.0, output: 2.5 },
};

export function estimateCostUsd(
    model: string,
    usage: { inputTokens?: number | null; outputTokens?: number | null; thoughtsTokens?: number | null; audioInputTokens?: number | null },
): number {
    const price = GEMINI_PRICES_USD_PER_M[model] || GEMINI_PRICES_USD_PER_M[AI_DEFAULT_MODEL];
    const audio = Math.max(0, usage.audioInputTokens || 0);
    const input = Math.max(0, (usage.inputTokens || 0) - audio);
    const output = Math.max(0, (usage.outputTokens || 0) + (usage.thoughtsTokens || 0));
    const cost = (input * price.input + audio * price.audioInput + output * price.output) / 1_000_000;
    return Math.round(cost * 1_000_000) / 1_000_000;
}

export function aiModel(): string {
    return (process.env.GEMINI_MODEL || '').trim() || AI_DEFAULT_MODEL;
}

export function aiTimeoutMs(): number {
    const value = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : AI_DEFAULT_TIMEOUT_MS;
}

export function aiMaxInputLength(): number {
    const value = Number(process.env.GEMINI_MAX_INPUT_LENGTH);
    return Number.isFinite(value) && value > 0 ? value : AI_DEFAULT_MAX_INPUT_LENGTH;
}

export function aiDailyLimit(): number {
    const value = Number(process.env.AI_RECIPE_DAILY_LIMIT);
    return Number.isFinite(value) && value > 0 ? value : AI_RECIPE_DAILY_LIMIT_DEFAULT;
}
