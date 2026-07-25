import { Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { LikesService } from './likes.service';

// Full explicit paths (no controller prefix): the like routes live under /dishes,
// while the caller's own like list lives under /me.
@Controller()
export class LikesController {
    constructor(private readonly likes: LikesService) {}

    @Get('me/likes')
    @UseGuards(JwtAuthGuard)
    myLikes(@CurrentUser() user: RequestUser) {
        return this.likes.myLikes(user);
    }

    @Put('dishes/:dishId/like')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    like(@CurrentUser() user: RequestUser, @Param('dishId') dishId: string) {
        return this.likes.like(user, dishId);
    }

    @Delete('dishes/:dishId/like')
    @UseGuards(JwtAuthGuard)
    unlike(@CurrentUser() user: RequestUser, @Param('dishId') dishId: string) {
        return this.likes.unlike(user, dishId);
    }
}
