import { Family } from '@prisma/client';

// Prisma `Family` row → the camelCase `Family` shape the Angular app expects.
// Dates become ISO strings; nullables collapse to null. Exported so other
// modules can serialize families consistently (mirrors auth.service.toFamily).
export function toFamily(f: Family) {
    return {
        id: f.id,
        slug: f.slug,
        name: f.name,
        description: f.description ?? null,
        coverImageUrl: f.coverImageUrl ?? null,
        avatarImageUrl: f.avatarImageUrl ?? null,
        themeColor: f.themeColor ?? null,
        isPublicVisible: f.isPublicVisible,
        status: f.status,
        createdByUserId: f.createdByUserId ?? null,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
    };
}
