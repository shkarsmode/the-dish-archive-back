import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../shared/optional-jwt-auth.guard';
import { RateDto } from './dto/rate.dto';
import { RatingsService } from './ratings.service';

@Controller('dishes/:dishId/ratings')
export class RatingsController {
    constructor(private readonly ratings: RatingsService) {}

    // Public-ish read: an anonymous caller sees ratings only for published+public
    // dishes; canViewDish decides (NotFound otherwise).
    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    list(@CurrentUser() user: RequestUser | null, @Param('dishId') dishId: string) {
        return this.ratings.list(user, dishId);
    }

    // Upsert the caller's own rating for the dish.
    @Put('me')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    rate(@CurrentUser() user: RequestUser, @Param('dishId') dishId: string, @Body() body: RateDto) {
        return this.ratings.rate(user, dishId, body);
    }
}
