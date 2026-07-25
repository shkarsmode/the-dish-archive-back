import { Prisma } from '@prisma/client';

// Prisma include that pulls a dish with everything the API response needs.
export const DISH_INCLUDE = {
    images: true,
    ingredients: true,
    steps: true,
    family: { select: { name: true, slug: true, themeColor: true } },
} satisfies Prisma.DishInclude;

export type DishWithChildren = Prisma.DishGetPayload<{ include: typeof DISH_INCLUDE }>;

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

// Prisma row → the camelCase `Dish` shape the Angular app expects (nested
// price / cookingTime / tasteProfile, sorted children, denormalized family info).
// This replaces the SPA's supabase-mappers.mapDish.
export function toApiDish(dish: DishWithChildren) {
    return {
        id: dish.id,
        title: dish.title,
        slug: dish.slug,
        description: dish.description ?? '',
        images: (dish.images ?? []).slice().sort(bySortOrder).map((img) => ({
            url: img.url,
            alt: img.alt ?? '',
            isPrimary: img.isPrimary,
        })),
        rating: dish.rating,
        price: { amount: dish.priceAmount, currency: dish.priceCurrency },
        cookingTime: { preparation: dish.prepTime, cooking: dish.cookTime, total: dish.totalTime },
        calories: dish.calories,
        servings: dish.servings,
        difficulty: dish.difficulty,
        tags: dish.tags ?? [],
        categories: dish.categories ?? [],
        tasteProfile: {
            sweet: dish.tasteSweet,
            salty: dish.tasteSalty,
            sour: dish.tasteSour,
            bitter: dish.tasteBitter,
            spicy: dish.tasteSpicy,
            umami: dish.tasteUmami,
        },
        ingredients: (dish.ingredients ?? []).slice().sort(bySortOrder).map((ing) => ({
            name: ing.name,
            amount: ing.amount ?? '',
            unit: ing.unit ?? '',
            optional: ing.optional,
        })),
        steps: (dish.steps ?? [])
            .slice()
            .sort((a, b) => a.stepOrder - b.stepOrder)
            .map((step) => ({
                order: step.stepOrder,
                description: step.description ?? '',
                duration: step.duration ?? undefined,
                imageUrl: step.imageUrl ?? undefined,
            })),
        notes: dish.notes ?? '',
        sourceUrl: dish.sourceUrl ?? '',
        familyId: dish.familyId,
        createdByUserId: dish.createdByUserId ?? null,
        updatedByUserId: dish.updatedByUserId ?? null,
        visibility: dish.visibility,
        status: dish.status,
        ratingCount: dish.ratingCount,
        ratingAverage: dish.ratingAverage,
        likeCount: dish.likeCount,
        viewCount: dish.viewCount,
        cookedCount: dish.cookedCount,
        createdAt: dish.createdAt.toISOString(),
        updatedAt: dish.updatedAt.toISOString(),
        familyName: dish.family?.name,
        familySlug: dish.family?.slug,
        familyThemeColor: dish.family?.themeColor ?? null,
    };
}

// Incoming API `Partial<Dish>` → the writable dish scalar columns. Read-only /
// server-owned columns (id, familyId, createdBy/updatedBy, createdAt, aggregates)
// are intentionally NOT mapped here (pinned server-side).
export function toDishScalars(data: any): Prisma.DishUpdateInput {
    const row: Record<string, unknown> = {};
    if (data.title !== undefined) row.title = data.title;
    if (data.slug !== undefined) row.slug = data.slug;
    if (data.description !== undefined) row.description = data.description;
    if (data.rating !== undefined) row.rating = Number(data.rating);
    if (data.price !== undefined) {
        row.priceAmount = Number(data.price.amount) || 0;
        row.priceCurrency = data.price.currency ?? 'UAH';
    }
    if (data.cookingTime !== undefined) {
        row.prepTime = Number(data.cookingTime.preparation) || 0;
        row.cookTime = Number(data.cookingTime.cooking) || 0;
        row.totalTime = Number(data.cookingTime.total) || 0;
    }
    if (data.calories !== undefined) row.calories = Number(data.calories) || 0;
    if (data.servings !== undefined) row.servings = Number(data.servings) || 0;
    if (data.difficulty !== undefined) row.difficulty = data.difficulty;
    if (data.tags !== undefined) row.tags = data.tags;
    if (data.categories !== undefined) row.categories = data.categories;
    if (data.tasteProfile !== undefined) {
        row.tasteSweet = Number(data.tasteProfile.sweet) || 0;
        row.tasteSalty = Number(data.tasteProfile.salty) || 0;
        row.tasteSour = Number(data.tasteProfile.sour) || 0;
        row.tasteBitter = Number(data.tasteProfile.bitter) || 0;
        row.tasteSpicy = Number(data.tasteProfile.spicy) || 0;
        row.tasteUmami = Number(data.tasteProfile.umami) || 0;
    }
    if (data.notes !== undefined) row.notes = data.notes;
    if (data.sourceUrl !== undefined) row.sourceUrl = data.sourceUrl;
    if (data.visibility !== undefined) row.visibility = data.visibility;
    if (data.status !== undefined) row.status = data.status;
    return row as Prisma.DishUpdateInput;
}

// Child rows (images / ingredients / steps) mapped from the API arrays.
export function toImageRows(dishId: string, images: any[]) {
    return (images ?? []).map((img, index) => ({
        dishId,
        url: img.url,
        alt: img.alt ?? '',
        isPrimary: !!img.isPrimary,
        sortOrder: index,
    }));
}

export function toIngredientRows(dishId: string, ingredients: any[]) {
    return (ingredients ?? []).map((ing, index) => ({
        dishId,
        name: ing.name,
        amount: ing.amount ?? '',
        unit: ing.unit ?? '',
        optional: !!ing.optional,
        sortOrder: index,
    }));
}

export function toStepRows(dishId: string, steps: any[]) {
    return (steps ?? []).map((step, index) => ({
        dishId,
        stepOrder: step.order ?? index + 1,
        description: step.description ?? '',
        duration: step.duration ?? null,
        imageUrl: step.imageUrl ?? null,
    }));
}
