import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DISH_INCLUDE, toApiDish } from '../dishes/dish.serializer';

// Unauthenticated, published+public-only reads for SEO/link-preview (the api/ssr
// Vercel functions consume these). Never leaks drafts or family-private recipes.
@Injectable()
export class PublicService {
    constructor(private readonly prisma: PrismaService) {}

    async getBySlug(slug: string) {
        const dish = await this.prisma.dish.findFirst({
            where: { slug, status: 'published', visibility: 'public' },
            include: DISH_INCLUDE,
        });
        if (!dish) throw new NotFoundException('Страву не знайдено');
        return toApiDish(dish);
    }

    async list() {
        const rows = await this.prisma.dish.findMany({
            where: { status: 'published', visibility: 'public' },
            select: { slug: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
        });
        return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
    }
}
