/**
 * One-shot ETL: copy all data from the old Supabase Postgres into the new
 * Prisma-backed database. Run once against a fresh target DB:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... \
 *   DATABASE_URL_UNPOOLED=... npm run migrate:from-supabase
 *
 * Reads Supabase via the REST API with the SERVICE ROLE key (bypasses RLS so
 * private families/dishes/users all come across). Writes via Prisma.
 *
 * User identity: Supabase profile ids (uuid) are NOT preserved — new User rows
 * are created (cuid) and every foreign key is remapped by email. Dish ids
 * (dish-NNN text) ARE preserved so slugs/routes/children line up 1:1.
 *
 * Idempotent-ish: parents use upsert on their natural keys (email / slug /
 * dish id / composite uniques); a dish's children are cleared + reinserted, so
 * re-running refreshes rather than duplicates.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

async function sbGet<T = any>(table: string, query = ''): Promise<T[]> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${query}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    return res.json() as Promise<T[]>;
}

const date = (v: any): Date | null => (v ? new Date(v) : null);
const dateReq = (v: any): Date => (v ? new Date(v) : new Date());

async function main() {
    const userByOldId = new Map<string, string>();
    const familyByOldId = new Map<string, string>();
    const mapUser = (oldId: any): string | null => (oldId ? userByOldId.get(oldId) ?? null : null);
    const mapFamily = (oldId: any): string | null => (oldId ? familyByOldId.get(oldId) ?? null : null);

    // 1) profiles → User
    const profiles = await sbGet('profiles');
    for (const p of profiles) {
        const email = String(p.email).toLowerCase();
        const u = await prisma.user.upsert({
            where: { email },
            update: {
                displayName: p.display_name ?? null,
                avatarUrl: p.avatar_url ?? null,
                globalRole: p.global_role ?? 'user',
            },
            create: {
                email,
                displayName: p.display_name ?? null,
                avatarUrl: p.avatar_url ?? null,
                globalRole: p.global_role ?? 'user',
                lastLoginAt: date(p.last_login_at),
                createdAt: dateReq(p.created_at),
            },
        });
        userByOldId.set(p.id, u.id);
    }
    console.log(`users: ${profiles.length}`);

    // 2) families → Family
    const families = await sbGet('families');
    for (const f of families) {
        const fam = await prisma.family.upsert({
            where: { slug: f.slug },
            update: {},
            create: {
                slug: f.slug,
                name: f.name,
                description: f.description ?? null,
                coverImageUrl: f.cover_image_url ?? null,
                avatarImageUrl: f.avatar_image_url ?? null,
                themeColor: f.theme_color ?? null,
                isPublicVisible: !!f.is_public_visible,
                status: f.status ?? 'active',
                createdByUserId: mapUser(f.created_by_user_id),
                createdAt: dateReq(f.created_at),
                updatedAt: dateReq(f.updated_at),
            },
        });
        familyByOldId.set(f.id, fam.id);
    }
    console.log(`families: ${families.length}`);

    // 3) family_members
    const members = await sbGet('family_members');
    let memberCount = 0;
    for (const m of members) {
        const familyId = mapFamily(m.family_id);
        const userId = mapUser(m.user_id);
        if (!familyId || !userId) continue;
        await prisma.familyMember.upsert({
            where: { familyId_userId: { familyId, userId } },
            update: {},
            create: {
                familyId,
                userId,
                role: m.role,
                status: m.status,
                approvedByUserId: mapUser(m.approved_by_user_id),
                approvedAt: date(m.approved_at),
                createdAt: dateReq(m.created_at),
                updatedAt: dateReq(m.updated_at),
            },
        });
        memberCount++;
    }
    console.log(`family_members: ${memberCount}`);

    // 4) dishes (preserve text id)
    const dishes = await sbGet('dishes');
    let dishCount = 0;
    for (const d of dishes) {
        const familyId = mapFamily(d.family_id);
        if (!familyId) continue;
        await prisma.dish.upsert({
            where: { id: d.id },
            update: {},
            create: {
                id: d.id,
                familyId,
                createdByUserId: mapUser(d.created_by_user_id),
                updatedByUserId: mapUser(d.updated_by_user_id),
                title: d.title,
                slug: d.slug,
                description: d.description ?? '',
                rating: Number(d.rating ?? 0),
                ratingAverage: Number(d.rating_average ?? 0),
                ratingCount: d.rating_count ?? 0,
                likeCount: d.like_count ?? 0,
                priceAmount: d.price_amount ?? 0,
                priceCurrency: d.price_currency ?? 'UAH',
                prepTime: d.prep_time ?? 0,
                cookTime: d.cook_time ?? 0,
                totalTime: d.total_time ?? 0,
                calories: d.calories ?? 0,
                servings: d.servings ?? 0,
                difficulty: d.difficulty ?? 'easy',
                tags: d.tags ?? [],
                categories: d.categories ?? [],
                tasteSweet: d.taste_sweet ?? 0,
                tasteSalty: d.taste_salty ?? 0,
                tasteSour: d.taste_sour ?? 0,
                tasteBitter: d.taste_bitter ?? 0,
                tasteSpicy: d.taste_spicy ?? 0,
                tasteUmami: d.taste_umami ?? 0,
                notes: d.notes ?? '',
                sourceUrl: d.source_url ?? '',
                visibility: d.visibility ?? 'family',
                status: d.status ?? 'draft',
                viewCount: d.view_count ?? 0,
                cookedCount: d.cooked_count ?? 0,
                createdAt: dateReq(d.created_at),
                updatedAt: dateReq(d.updated_at),
            },
        });
        dishCount++;
    }
    console.log(`dishes: ${dishCount}`);

    // 5) dish children — clear + reinsert per dish so re-runs don't duplicate.
    const images = await sbGet('dish_images');
    const ingredients = await sbGet('ingredients');
    const steps = await sbGet('cooking_steps');
    const dishIds = new Set(dishes.map((d: any) => d.id));

    await prisma.dishImage.deleteMany({ where: { dishId: { in: [...dishIds] } } });
    await prisma.dishImage.createMany({
        data: images
            .filter((r: any) => dishIds.has(r.dish_id))
            .map((r: any) => ({
                dishId: r.dish_id,
                url: r.url,
                alt: r.alt ?? null,
                isPrimary: !!r.is_primary,
                sortOrder: r.sort_order ?? 0,
            })),
    });
    await prisma.ingredient.deleteMany({ where: { dishId: { in: [...dishIds] } } });
    await prisma.ingredient.createMany({
        data: ingredients
            .filter((r: any) => dishIds.has(r.dish_id))
            .map((r: any) => ({
                dishId: r.dish_id,
                name: r.name,
                amount: r.amount ?? '',
                unit: r.unit ?? '',
                optional: !!r.optional,
                sortOrder: r.sort_order ?? 0,
            })),
    });
    await prisma.cookingStep.deleteMany({ where: { dishId: { in: [...dishIds] } } });
    await prisma.cookingStep.createMany({
        data: steps
            .filter((r: any) => dishIds.has(r.dish_id))
            .map((r: any) => ({
                dishId: r.dish_id,
                stepOrder: r.step_order ?? 0,
                description: r.description ?? '',
                duration: r.duration ?? null,
                imageUrl: r.image_url ?? null,
            })),
    });
    console.log(`images: ${images.length}, ingredients: ${ingredients.length}, steps: ${steps.length}`);

    // 6) ratings + likes
    const ratings = await sbGet('recipe_ratings');
    for (const r of ratings) {
        const userId = mapUser(r.user_id);
        const familyId = mapFamily(r.family_id);
        if (!userId || !familyId || !dishIds.has(r.dish_id)) continue;
        await prisma.recipeRating.upsert({
            where: { dishId_userId: { dishId: r.dish_id, userId } },
            update: {},
            create: {
                dishId: r.dish_id,
                userId,
                familyId,
                rating: r.rating,
                comment: r.comment ?? null,
                createdAt: dateReq(r.created_at),
                updatedAt: dateReq(r.updated_at),
            },
        });
    }
    const likes = await sbGet('dish_likes');
    for (const l of likes) {
        const userId = mapUser(l.user_id);
        if (!userId || !dishIds.has(l.dish_id)) continue;
        await prisma.dishLike.upsert({
            where: { dishId_userId: { dishId: l.dish_id, userId } },
            update: {},
            create: { dishId: l.dish_id, userId, createdAt: dateReq(l.created_at) },
        });
    }
    console.log(`ratings: ${ratings.length}, likes: ${likes.length}`);

    // 7) access_requests + activity_log + changelog (best-effort; skip on empty target)
    const accessRequests = await sbGet('access_requests');
    for (const a of accessRequests) {
        await prisma.accessRequest.create({
            data: {
                email: a.email,
                familyId: mapFamily(a.family_id),
                requestedRole: a.requested_role ?? null,
                status: a.status ?? 'pending',
                requestedByUserId: mapUser(a.requested_by_user_id),
                reviewedByUserId: mapUser(a.reviewed_by_user_id),
                reviewNote: a.review_note ?? null,
                createdAt: dateReq(a.created_at),
                updatedAt: dateReq(a.updated_at),
            },
        });
    }
    const changelog = await sbGet('changelog');
    for (const c of changelog) {
        await prisma.changelogEntry.create({
            data: {
                familyId: mapFamily(c.family_id),
                version: c.version ?? '',
                title: c.title ?? '',
                description: c.description ?? null,
                action: c.action ?? 'improved',
                dishId: c.dish_id ?? null,
                dishTitle: c.dish_title ?? null,
                changes: c.changes ?? [],
                date: dateReq(c.date),
            },
        });
    }
    console.log(`access_requests: ${accessRequests.length}, changelog: ${changelog.length}`);
    console.log('✅ migration complete');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
