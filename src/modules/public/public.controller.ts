import { Controller, Get, Param } from '@nestjs/common';
import { PublicService } from './public.service';

// No guards — public by design (only published+public dishes are ever returned).
@Controller('public')
export class PublicController {
    constructor(private readonly publicService: PublicService) {}

    @Get('dishes')
    list() {
        return this.publicService.list();
    }

    @Get('dishes/:slug')
    getBySlug(@Param('slug') slug: string) {
        return this.publicService.getBySlug(slug);
    }
}
