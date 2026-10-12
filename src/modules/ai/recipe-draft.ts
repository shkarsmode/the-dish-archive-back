import {
    AI_DEFAULT_DIFFICULTY,
    AI_MAX_CALORIES,
    AI_MAX_CATEGORIES,
    AI_MAX_DESCRIPTION,
    AI_MAX_INGREDIENT_KCAL,
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
import { ESTIMABLE_FIELDS, EstimableField, GeminiRecipePayload, RecipeDraft } from './ai.types';

// Shared by the free-text parse and the link/photo import: coerce, clamp and
// validate a model payload into a draft the editor can merge into its form.

// Does the material itself state the number? A number with its unit, or the label
// with a number: "на 4 порції", "Порцій: 4", "30 хв", "1 год", "350 ккал", "serves 4".
// JS \b is ASCII-only, so Cyrillic word ends are checked with \p{L}.
const STATES_SERVINGS =
    /\d+\s*(?:порц\p{L}*|осіб|особ\p{L}*|персон\p{L}*|людин\p{L}*|servings?|people|persons)(?!\p{L})|(?:порц\p{L}*|serves|servings?|yield|makes)\s*[-:]?\s*\d/iu;
const STATES_CALORIES =
    /\d+\s*(?:ккал|кал(?!\p{L})|kcal|cal(?!\p{L})|калор\p{L}*|calor\p{L}*)|(?:ккал|kcal|калор\p{L}*|calories)\s*[-:]?\s*\d/iu;
const STATES_TIME = /\d+\s*(?:хв\p{L}*|мин\p{L}*|min\p{L}*|год\p{L}*|час(?:а|ов)?|hours?|hrs?|h)(?!\p{L})/iu;

export interface BuildDraftOptions {
    /**
     * The whole material, when it is text only (no photo or video the server cannot
     * read). A number the text never mentions has to be an estimate, whatever the
     * model reported, so the cook still sees it marked.
     */
    sourceText?: string;
}

/** Estimated kcal read as estimates (whole tens); tiny values stay exact. */
export function roundKcal(value: number): number {
    if (!(value > 0)) return 0;
    return value >= 50 ? Math.round(value / 10) * 10 : Math.max(1, Math.round(value));
}

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

export function buildDraft(payload: GeminiRecipePayload, options: BuildDraftOptions = {}): RecipeDraft {
    const estimated = new Set<EstimableField>(
        (Array.isArray(payload.estimated) ? payload.estimated : []).filter((field): field is EstimableField =>
            ESTIMABLE_FIELDS.includes(field as EstimableField),
        ),
    );
    if (options.sourceText !== undefined) {
        const text = options.sourceText;
        if (!STATES_SERVINGS.test(text)) estimated.add('servings');
        if (!STATES_CALORIES.test(text)) estimated.add('calories');
        if (!STATES_TIME.test(text)) {
            estimated.add('prepTime');
            estimated.add('cookTime');
            estimated.add('totalTime');
        }
    }

    const prep = clampInt(payload.prepTime, 0, AI_MAX_MINUTES) ?? 0;
    const cook = clampInt(payload.cookTime, 0, AI_MAX_MINUTES) ?? 0;
    let total = clampInt(payload.totalTime, 0, AI_MAX_MINUTES) ?? 0;
    if (!total && (prep || cook)) {
        total = prep + cook;
        // A total built from estimated parts is an estimate too.
        if (estimated.has('prepTime') || estimated.has('cookTime')) estimated.add('totalTime');
    }
    // An estimated total never undercuts its own parts.
    if (estimated.has('totalTime') && total < prep + cook) total = prep + cook;

    // 0 = unknown (the import review reports it), not "1 serving".
    const servings = clampInt(payload.servings, 0, AI_MAX_SERVINGS) ?? 0;

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

    const rows = (Array.isArray(payload.ingredients) ? payload.ingredients : [])
        .slice(0, AI_MAX_INGREDIENTS)
        .map((ing) => ({
            name: cleanString(ing?.name, AI_MAX_STRING),
            amount: cleanString(ing?.amount, 60),
            unit: cleanString(ing?.unit, 40),
            optional: !!ing?.optional,
            kcal: clampInt(ing?.kcal, 0, AI_MAX_INGREDIENT_KCAL) ?? 0,
        }))
        .filter((ing) => ing.name.length > 0);
    const ingredients = rows.map((ing) => ({ name: ing.name, amount: ing.amount, unit: ing.unit, optional: ing.optional }));
    // Optional extras (garnish, "for serving") are not on every plate.
    const caloriesTotal = rows.reduce((sum, ing) => (ing.optional ? sum : sum + ing.kcal), 0);

    let calories = clampInt(payload.calories, 0, AI_MAX_CALORIES) ?? 0;
    // Left empty while the ingredients add up: an estimate the server can make itself.
    if (!calories && caloriesTotal) estimated.add('calories');
    if (estimated.has('calories')) {
        // Summing per-ingredient estimates and dividing here is exact arithmetic the
        // model often fumbles, and it stays consistent with the servings shown.
        calories = Math.min(
            AI_MAX_CALORIES,
            caloriesTotal > 0 && servings > 0 ? roundKcal(caloriesTotal / servings) : roundKcal(calories),
        );
    }
    const values: Record<EstimableField, number> = {
        servings,
        prepTime: prep,
        cookTime: cook,
        totalTime: total,
        calories,
    };

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
        servings,
        cookingTime: { preparation: prep, cooking: cook, total },
        calories,
        caloriesTotal,
        // An empty number is a gap for the review, not an estimate.
        estimated: ESTIMABLE_FIELDS.filter((field) => estimated.has(field) && values[field] > 0),
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
