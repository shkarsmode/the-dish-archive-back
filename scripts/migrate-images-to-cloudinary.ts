/**
 * One-shot: move every image still hosted on Supabase Storage over to Cloudinary,
 * then rewrite the DB URL so nothing points at Supabase any more. Cloudinary fetches
 * each public Supabase URL directly (no local download needed).
 *
 *   DRY_RUN=1 npm run migrate:images   # list what would move
 *   npm run migrate:images             # actually move + rewrite
 *
 * Needs: STORAGE_DATABASE_URL[_UNPOOLED] (Prisma) + CLOUDINARY_CLOUD_NAME / API_KEY /
 * API_SECRET. Idempotent: once a URL is on Cloudinary it no longer matches, so
 * re-running only touches whatever is still on Supabase.
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

const prisma = new PrismaClient();
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    api_key: process.env.CLOUDINARY_API_KEY ?? '',
    api_secret: process.env.CLOUDINARY_API_SECRET ?? '',
});

const SUPA = 'supabase.co/storage';
const DRY = process.env.DRY_RUN === '1';
const isSupa = (u?: string | null): u is string => !!u && u.includes(SUPA);

let moved = 0;
let failed = 0;

async function toCloudinary(url: string): Promise<string> {
    const res = await cloudinary.uploader.upload(url, {
        folder: 'dish-archive',
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });
    return res.secure_url;
}

async function main() {
    console.log(DRY ? '— DRY RUN (no changes) —' : '— LIVE (uploading + rewriting) —');

    // 1) DishImage.url
    const dishImages = await prisma.dishImage.findMany({ where: { url: { contains: SUPA } } });
    console.log(`DishImage on Supabase: ${dishImages.length}`);
    for (const img of dishImages) {
        try {
            if (DRY) { console.log(`  would move dishImage ${img.id}: ${img.url}`); continue; }
            const url = await toCloudinary(img.url);
            await prisma.dishImage.update({ where: { id: img.id }, data: { url } });
            moved++;
            console.log(`  ✓ dishImage ${img.id} → ${url}`);
        } catch (e) { failed++; console.error(`  ✗ dishImage ${img.id}: ${String(e)}`); }
    }

    // 2) CookingStep.imageUrl
    const steps = await prisma.cookingStep.findMany({ where: { imageUrl: { contains: SUPA } } });
    console.log(`CookingStep on Supabase: ${steps.length}`);
    for (const s of steps) {
        try {
            if (DRY) { console.log(`  would move step ${s.id}: ${s.imageUrl}`); continue; }
            const imageUrl = await toCloudinary(s.imageUrl as string);
            await prisma.cookingStep.update({ where: { id: s.id }, data: { imageUrl } });
            moved++;
            console.log(`  ✓ step ${s.id} → ${imageUrl}`);
        } catch (e) { failed++; console.error(`  ✗ step ${s.id}: ${String(e)}`); }
    }

    // 3) Family cover + avatar
    const families = await prisma.family.findMany({
        where: { OR: [{ coverImageUrl: { contains: SUPA } }, { avatarImageUrl: { contains: SUPA } }] },
    });
    console.log(`Family images on Supabase: ${families.length}`);
    for (const f of families) {
        try {
            const data: { coverImageUrl?: string; avatarImageUrl?: string } = {};
            if (isSupa(f.coverImageUrl)) {
                if (DRY) console.log(`  would move family ${f.id} cover: ${f.coverImageUrl}`);
                else data.coverImageUrl = await toCloudinary(f.coverImageUrl);
            }
            if (isSupa(f.avatarImageUrl)) {
                if (DRY) console.log(`  would move family ${f.id} avatar: ${f.avatarImageUrl}`);
                else data.avatarImageUrl = await toCloudinary(f.avatarImageUrl);
            }
            if (!DRY && Object.keys(data).length) {
                await prisma.family.update({ where: { id: f.id }, data });
                moved++;
                console.log(`  ✓ family ${f.id} images updated`);
            }
        } catch (e) { failed++; console.error(`  ✗ family ${f.id}: ${String(e)}`); }
    }

    // 4) User.avatarUrl (only Supabase-hosted ones; Google avatars are left alone)
    const users = await prisma.user.findMany({ where: { avatarUrl: { contains: SUPA } } });
    console.log(`User avatars on Supabase: ${users.length}`);
    for (const u of users) {
        try {
            if (DRY) { console.log(`  would move user ${u.id} avatar: ${u.avatarUrl}`); continue; }
            const avatarUrl = await toCloudinary(u.avatarUrl as string);
            await prisma.user.update({ where: { id: u.id }, data: { avatarUrl } });
            moved++;
        } catch (e) { failed++; console.error(`  ✗ user ${u.id}: ${String(e)}`); }
    }

    // Final tally of anything still pointing at Supabase.
    const remaining =
        (await prisma.dishImage.count({ where: { url: { contains: SUPA } } })) +
        (await prisma.cookingStep.count({ where: { imageUrl: { contains: SUPA } } })) +
        (await prisma.family.count({ where: { OR: [{ coverImageUrl: { contains: SUPA } }, { avatarImageUrl: { contains: SUPA } }] } })) +
        (await prisma.user.count({ where: { avatarUrl: { contains: SUPA } } }));

    console.log(`\nmoved=${moved} failed=${failed} remainingSupabaseRefs=${remaining} dryRun=${DRY}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
