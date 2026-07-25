import { Body, Controller, Get, HttpException, Post, Query, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { SuperAdminGuard } from '../../shared/super-admin.guard';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { AiRecipeService } from './ai-recipe.service';
import { AiUsageService } from './ai-usage.service';
import { AiError } from './ai.types';
import { ParseRecipeDto } from './dto/parse-recipe.dto';
import { StatisticsQueryDto } from './dto/statistics-query.dto';

// Auth + approval required for every route. Generation is admin-only (enforced in
// the service: super-admin or a family owner/admin); statistics are super-admin only.
@Controller('ai')
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class AiController {
    constructor(
        private readonly aiRecipe: AiRecipeService,
        private readonly usage: AiUsageService,
    ) {}

    @Post('recipes/parse')
    @UseGuards(AiRateLimitGuard)
    async parse(@CurrentUser() user: RequestUser, @Body() dto: ParseRecipeDto) {
        try {
            return await this.aiRecipe.parse(user, dto.text);
        } catch (error) {
            if (error instanceof AiError) {
                throw new HttpException({ code: error.code, message: error.message }, error.httpStatus);
            }
            throw error;
        }
    }

    @Get('statistics/summary')
    @UseGuards(SuperAdminGuard)
    summary(@Query() query: StatisticsQueryDto) {
        return this.usage.summary(query);
    }

    @Get('statistics/usage')
    @UseGuards(SuperAdminGuard)
    usageStats(@Query() query: StatisticsQueryDto) {
        return this.usage.usage(query);
    }

    @Get('statistics/requests')
    @UseGuards(SuperAdminGuard)
    requests(@Query() query: StatisticsQueryDto) {
        return this.usage.requests(query);
    }

    @Get('statistics/limits')
    @UseGuards(SuperAdminGuard)
    limits() {
        return this.usage.limits();
    }
}
