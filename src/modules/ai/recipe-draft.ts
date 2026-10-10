import {
    AI_DEFAULT_DIFFICULTY,
    AI_MAX_CALORIES,
    AI_MAX_CATEGORIES,
    AI_MAX_DESCRIPTION,
    AI_MAX_INGREDIENTS,
    AI_MAX_MINUTES,
    AI_MAX_SERVINGS,
    AI_MAX_STEP_TEXT,
    AI_MAX_STEPS,
    AI_MAX_STRING,
    AI_MAX_TAGS,
    AI_TASTE_MAX,
    DIFFICULTIES,
    RECIPE_CATEGORIES,
} from './ai.constants';
import { GeminiRecipePayload, RecipeDraft } from './ai.types';

// Shared by the free-text parse and the link/photo import: coerce, clamp and
// validate a model payload into a draft the editor can merge into its form.

export function normalizeInput(text: unknown): string {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Trim and cap a model string; long dashes become plain hyphens (house style). */
export function cleanString(value: unknown, max: number): string {
    return String(value ?? '')
        .replace(/\s*[\u2013\u2014]\s*/g, ' - ')
        .trim()
        .slice(0, max);
}

export function clampInt(value: unknown, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
}

/** Tolerant JSON parse: strips ```json fences, never throws. */
export function safeParse<T = GeminiRecipePayload>(text: string): T | null {
    if (!text) return null;
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' ? (parsed as T) : null;
    } catch {
        return null;
    }
}

export function buildDraft(payload: GeminiRecipePayload): RecipeDraft {
    const prep = clampInt(payload.prepTime, 0, AI_MAX_MINUTES) ?? 0;
    const cook = clampInt(payload.cookTime, 0, AI_MAX_MINUTES) ?? 0;
    let total = clampInt(payload.totalTime, 0, AI_MAX_MINUTES) ?? 0;
    if (!total && (prep || cook)) total = prep + cook;

    const difficulty = DIFFICULTIES.includes(payload.difficulty as never)
        ? (payload.difficulty as string)
        : AI_DEFAULT_DIFFICULTY;

    const categories = [
        ...new Set((payload.categories || []).filter((c) => RECIPE_CATEGORIES.includes(c as never))),
    ].slice(0, AI_MAX_CATEGORIES);

    const tags = [...new Set((payload.tags || []).map((t) => cleanString(t, 60)).filter(Boolean))].slice(
        0,
        AI_MAX_TAGS,
    );

    const ingredients = (Array.isArray(payload.ingredients) ? payload.ingredients : [])
        .slice(0, AI_MAX_INGREDIENTS)
        .map((ing) => ({
            name: cleanString(ing?.name, AI_MAX_STRING),
            amount: cleanString(ing?.amount, 60),
            unit: cleanString(ing?.unit, 40),
            optional: !!ing?.optional,
        }))
        .filter((ing) => ing.name.length > 0);

    const steps = (Array.isArray(payload.steps) ? payload.steps : [])
        .slice(0, AI_MAX_STEPS)
        .map((step, index) => {
            const duration = clampInt(step?.duration, 0, AI_MAX_MINUTES);
            return {
                order: index + 1,
                description: cleanString(step?.description, AI_MAX_STEP_TEXT),
                ...(duration ? { duration } : {}),
            };
        })
        .filter((step) => step.description.length > 0)
        .map((step, index) => ({ ...step, order: index + 1 }));

    const warnings = (Array.isArray(payload.warnings) ? payload.warnings : [])
        .map((w) => cleanString(w, 200))
        .filter(Boolean)
        .slice(0, 20);

    const t = payload.taste || {};
    const taste = {
        sweet: clampInt(t.sweet, 0, AI_TASTE_MAX) ?? 0,
        salty: clampInt(t.salty, 0, AI_TASTE_MAX) ?? 0,
        sour: clampInt(t.sour, 0, AI_TASTE_MAX) ?? 0,
        bitter: clampInt(t.bitter, 0, AI_TASTE_MAX) ?? 0,
        spicy: clampInt(t.spicy, 0, AI_TASTE_MAX) ?? 0,
        umami: clampInt(t.umami, 0, AI_TASTE_MAX) ?? 0,
    };

    return {
        title: cleanString(payload.title, AI_MAX_STRING),
        description: cleanString(payload.description, AI_MAX_DESCRIPTION),
        servings: clampInt(payload.servings, 1, AI_MAX_SERVINGS) ?? 0,
        cookingTime: { preparation: prep, cooking: cook, total },
        calories: clampInt(payload.calories, 0, AI_MAX_CALORIES) ?? 0,
        difficulty,
        categories,
        tags,
        ingredients,
        steps,
        taste,
        notes: cleanString(payload.notes, AI_MAX_DESCRIPTION),
        warnings,
        meta: { model: '', dailyLimit: null, dailyUsed: null, dailyRemaining: null },
    };
}
