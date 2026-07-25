import { Type } from '@google/genai';
import { DIFFICULTIES, RECIPE_CATEGORIES } from './ai.constants';

// Thrown inside the AI pipeline with a normalized, non-leaking code. The controller
// maps it to the right HTTP status; the code is also persisted in AiUsageLog.
export class AiError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly httpStatus = 502,
    ) {
        super(message);
        this.name = 'AiError';
    }
}

// The raw shape we ask Gemini to return. Everything except the arrays is nullable
// so the model is never forced to invent a value it wasn't given.
export interface GeminiIngredient {
    name?: string | null;
    amount?: string | null;
    unit?: string | null;
    optional?: boolean | null;
}

export interface GeminiStep {
    description?: string | null;
    duration?: number | null;
}

export interface GeminiRecipePayload {
    title?: string | null;
    description?: string | null;
    servings?: number | null;
    prepTime?: number | null;
    cookTime?: number | null;
    totalTime?: number | null;
    calories?: number | null;
    difficulty?: string | null;
    categories?: string[] | null;
    tags?: string[] | null;
    ingredients?: GeminiIngredient[] | null;
    steps?: GeminiStep[] | null;
    taste?: GeminiTaste | null;
    notes?: string | null;
    warnings?: string[] | null;
}

export interface GeminiTaste {
    sweet?: number | null;
    salty?: number | null;
    sour?: number | null;
    bitter?: number | null;
    spicy?: number | null;
    umami?: number | null;
}

export interface TasteProfile {
    sweet: number;
    salty: number;
    sour: number;
    bitter: number;
    spicy: number;
    umami: number;
}

// The safe, validated draft returned to the frontend. Shaped to merge straight into
// a Partial<Dish> for the normal create flow (nested cookingTime, etc.).
export interface RecipeDraft {
    title: string;
    description: string;
    servings: number;
    cookingTime: { preparation: number; cooking: number; total: number };
    calories: number;
    difficulty: string;
    categories: string[];
    tags: string[];
    ingredients: { name: string; amount: string; unit: string; optional: boolean }[];
    steps: { order: number; description: string; duration?: number }[];
    taste: TasteProfile;
    notes: string;
    warnings: string[];
    meta: {
        model: string;
        dailyLimit: number | null;
        dailyUsed: number | null;
        dailyRemaining: number | null;
    };
}

// Gemini structured-output schema. Enums are hints only — the backend re-validates
// and clamps every field regardless of what the model returns.
export const AI_RECIPE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, nullable: true, description: 'Short dish name if stated/derivable, else null' },
        description: { type: Type.STRING, nullable: true, description: 'One or two sentence appetising description' },
        servings: { type: Type.INTEGER, nullable: true, description: 'Number of servings/portions if stated, else null' },
        prepTime: { type: Type.INTEGER, nullable: true, description: 'Preparation minutes if stated, else null' },
        cookTime: { type: Type.INTEGER, nullable: true, description: 'Cooking minutes if stated, else null' },
        totalTime: { type: Type.INTEGER, nullable: true, description: 'Total minutes if stated or = prep+cook, else null' },
        calories: { type: Type.INTEGER, nullable: true, description: 'Approx kcal per serving if derivable, else null' },
        difficulty: { type: Type.STRING, nullable: true, enum: [...DIFFICULTIES], description: 'easy | medium | hard' },
        categories: {
            type: Type.ARRAY,
            items: { type: Type.STRING, enum: [...RECIPE_CATEGORIES] },
            description: 'Zero or more categories from the allowed list',
        },
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Short free-form tags in the user language' },
        ingredients: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: 'Ingredient name' },
                    amount: { type: Type.STRING, nullable: true, description: 'Quantity as text (e.g. "2", "2-3", "за смаком"), else null' },
                    unit: { type: Type.STRING, nullable: true, description: 'Unit (г, мл, шт, ст.л. …), else null' },
                    optional: { type: Type.BOOLEAN, nullable: true },
                },
                required: ['name'],
            },
        },
        steps: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    description: { type: Type.STRING, description: 'The step instruction' },
                    duration: { type: Type.INTEGER, nullable: true, description: 'Minutes this step takes if stated, else null' },
                },
                required: ['description'],
            },
        },
        taste: {
            type: Type.OBJECT,
            description:
                'Estimated taste profile of the finished dish. ALWAYS fill all six as integers 0-5 ' +
                '(0 = none, 5 = very strong), inferring reasonable values from the ingredients and dish type.',
            properties: {
                sweet: { type: Type.INTEGER, description: 'Sweetness 0-5' },
                salty: { type: Type.INTEGER, description: 'Saltiness 0-5' },
                sour: { type: Type.INTEGER, description: 'Sourness 0-5' },
                bitter: { type: Type.INTEGER, description: 'Bitterness 0-5' },
                spicy: { type: Type.INTEGER, description: 'Spiciness 0-5' },
                umami: { type: Type.INTEGER, description: 'Umami/savouriness 0-5' },
            },
            required: ['sweet', 'salty', 'sour', 'bitter', 'spicy', 'umami'],
        },
        notes: { type: Type.STRING, nullable: true, description: 'Extra tips / notes if any' },
        warnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Short notes about anything ambiguous' },
    },
    required: ['ingredients', 'steps', 'taste'],
} as const;
