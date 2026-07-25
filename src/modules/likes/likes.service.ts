import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService } from '../../shared/authz.service';
import { RequestUser } from '../../shared/current-user.decorator';

// Per-user dish likes. Authorization mirrors the old dish_likes RLS: a caller may
// only like a dish they are allowed to view (canViewDish), derived from the dish
// row — never from a client-supplied familyId.
@Injectable()
export class LikesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    // The dish ids the caller has liked, as a plain string[].
    async myLikes(user: RequestUser): Promise<string[]> {
        const rows = await this.prisma.dishLike.findMany({
            where: { userId: user.id },
            select: { dishId: true },
        });
        return rows.map((row) => row.dishId);
    }

    async like(user: RequestUser, dishId: string): Promise<{ ok: true; likeCount: number }> {
        if (!(await this.authz.canViewDish(user, dishId))) {
            throw new ForbiddenException('Немає доступу до цієї страви');
        }
        // Idempotent: [dishId,userId] is unique — upsert swallows a duplicate like.
        await this.prisma.dishLike.upsert({
            where: { dishId_userId: { dishId, userId: user.id } },
            create: { dishId, userId: user.id },
            update: {},
        });
        const likeCount = await this.recomputeLikeCount(dishId);

        const dish = await this.prisma.dish.findUnique({ where: { id: dishId }, select: { familyId: true } });
        await this.activity.log({
            actorUserId: user.id,
            familyId: dish?.familyId ?? null,
            entityType: 'dish',
            entityId: dishId,
            action: 'liked',
        });
        return { ok: true, likeCount };
    }

    async unlike(user: RequestUser, dishId: string): Promise<{ ok: true; likeCount: number }> {
        // Only ever removes the caller's own like; a no-op if none exists.
        await this.prisma.dishLike.deleteMany({ where: { dishId, userId: user.id } });
        const likeCount = await this.recomputeLikeCount(dishId);

        const dish = await this.prisma.dish.findUnique({ where: { id: dishId }, select: { familyId: true } });
        await this.activity.log({
            actorUserId: user.id,
            familyId: dish?.familyId ?? null,
            entityType: 'dish',
            entityId: dishId,
            action: 'unliked',
        });
        return { ok: true, likeCount };
    }

    // Sync Dish.likeCount to the true like count with a raw UPDATE so Prisma's
    // @updatedAt does NOT get bumped — a like must never look like a recipe edit.
    private async recomputeLikeCount(dishId: string): Promise<number> {
        const likeCount = await this.prisma.dishLike.count({ where: { dishId } });
        await this.prisma.$executeRaw`UPDATE "Dish" SET "likeCount" = ${likeCount} WHERE "id" = ${dishId}`;
        return likeCount;
    }
}
