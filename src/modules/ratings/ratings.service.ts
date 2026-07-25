import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService, AuthzUser } from '../../shared/authz.service';
import { RequestUser } from '../../shared/current-user.decorator';
import { RateDto } from './dto/rate.dto';

// Only the profile columns the response needs alongside each rating.
const RATING_INCLUDE = { user: { select: { displayName: true, avatarUrl: true } } } as const;

type RatingWithProfile = Prisma.RecipeRatingGetPayload<{ include: typeof RATING_INCLUDE }>;

@Injectable()
export class RatingsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    // All ratings for a dish the caller may view (mirrors the recipe_ratings_select
    // RLS policy, which is gated on can_view_dish).
    async list(user: AuthzUser, dishId: string) {
        if (!(await this.authz.canViewDish(user, dishId))) {
            throw new NotFoundException('Страву не знайдено');
        }
        const ratings = await this.prisma.recipeRating.findMany({
            where: { dishId },
            include: RATING_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
        return ratings.map((r) => this.toApiRating(r));
    }

    // Upsert the caller's single rating for a dish (was the rate_dish RPC), then
    // recompute the denormalized aggregate without bumping dish.updatedAt.
    async rate(user: RequestUser, dishId: string, body: RateDto) {
        // Derive familyId from the dish — never trust a client-supplied value.
        const dish = await this.prisma.dish.findUnique({ where: { id: dishId }, select: { familyId: true } });
        if (!dish) throw new NotFoundException('Страву не знайдено');

        const canView = await this.authz.canViewDish(user, dishId);
        const isMember = this.authz.isSuperAdmin(user) || (await this.authz.isFamilyMember(user.id, dish.familyId));
        if (!canView || !isMember) {
            throw new ForbiddenException('Оцінювати рецепти можуть лише учасники цієї родини');
        }

        const comment = body.comment ?? null;
        const saved = await this.prisma.recipeRating.upsert({
            where: { dishId_userId: { dishId, userId: user.id } },
            update: { rating: body.rating, comment },
            create: {
                dishId,
                userId: user.id,
                familyId: dish.familyId,
                rating: body.rating,
                comment,
            },
            include: RATING_INCLUDE,
        });

        // Recompute ratingAverage/ratingCount, then write them with a raw UPDATE so
        // the @updatedAt auto-bump on Dish is NOT triggered by this social action.
        const agg = await this.prisma.recipeRating.aggregate({
            where: { dishId },
            _count: true,
            _avg: { rating: true },
        });
        const ratingCount = agg._count;
        const avg = agg._avg.rating;
        const ratingAverage = avg != null ? Math.round(avg * 100) / 100 : 0;
        await this.prisma
            .$executeRaw`UPDATE "Dish" SET "ratingAverage" = ${ratingAverage}, "ratingCount" = ${ratingCount} WHERE "id" = ${dishId}`;

        await this.activity.log({
            actorUserId: user.id,
            familyId: dish.familyId,
            entityType: 'rating',
            entityId: saved.id,
            action: 'rated',
            metadata: { dishId, rating: body.rating },
        });

        return this.toApiRating(saved);
    }

    private toApiRating(r: RatingWithProfile) {
        return {
            id: r.id,
            dishId: r.dishId,
            userId: r.userId,
            familyId: r.familyId,
            rating: r.rating,
            comment: r.comment ?? null,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            displayName: r.user?.displayName ?? null,
            avatarUrl: r.user?.avatarUrl ?? null,
        };
    }
}
