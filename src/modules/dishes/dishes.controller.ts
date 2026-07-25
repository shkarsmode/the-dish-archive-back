import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../shared/optional-jwt-auth.guard';
import { DishesService } from './dishes.service';

@Controller('dishes')
export class DishesController {
    constructor(private readonly dishes: DishesService) {}

    // Reads: optional auth — an anonymous caller sees only published+public dishes,
    // a member sees their family's set (mirrors the old RLS-scoped select).
    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    list(@CurrentUser() user: RequestUser | null) {
        return this.dishes.list(user);
    }

    @Get('slug/:slug')
    @UseGuards(OptionalJwtAuthGuard)
    getBySlug(@CurrentUser() user: RequestUser | null, @Param('slug') slug: string) {
        return this.dishes.getBySlug(user, slug);
    }

    @Post('make-all-public')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    makeAllPublic(@CurrentUser() user: RequestUser) {
        return this.dishes.makeAllPublic(user);
    }

    @Post()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    create(@CurrentUser() user: RequestUser, @Body() body: any) {
        return this.dishes.create(user, body);
    }

    @Get(':id')
    @UseGuards(OptionalJwtAuthGuard)
    getById(@CurrentUser() user: RequestUser | null, @Param('id') id: string) {
        return this.dishes.getById(user, id);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: any) {
        return this.dishes.update(user, id, body);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
        return this.dishes.remove(user, id);
    }
}
