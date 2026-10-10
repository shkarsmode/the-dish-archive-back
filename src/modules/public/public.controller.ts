import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PublicService } from './public.service';

const PUBLIC_CACHE = 'public, s-maxage=120, stale-while-revalidate=600';

// No guards — public by design (only published+public dishes are ever returned).
@Controller('public')
export class PublicController {
    constructor(private readonly publicService: PublicService) {}

    // Shared links, the sitemap and OG previews: let Vercel's CDN absorb repeat hits.
    // Only successful answers are cached (a 404 for a just-published recipe must not
    // stick), and briefly, so a recipe made private disappears within minutes.
    @Get('dishes')
    async list(@Res({ passthrough: true }) response: Response) {
        const dishes = await this.publicService.list();
        response.setHeader('Cache-Control', PUBLIC_CACHE);
        return dishes;
    }

    @Get('dishes/:slug')
    async getBySlug(@Param('slug') slug: string, @Res({ passthrough: true }) response: Response) {
        const dish = await this.publicService.getBySlug(slug);
        response.setHeader('Cache-Control', PUBLIC_CACHE);
        return dish;
    }
}
