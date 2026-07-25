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
export const AI_MAX_SERVINGS = 100;
export const AI_MAX_STRING = 400;
export const AI_MAX_DESCRIPTION = 2000;
export const AI_MAX_STEP_TEXT = 2000;

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
