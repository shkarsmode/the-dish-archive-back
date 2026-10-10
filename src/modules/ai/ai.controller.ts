import { Body, Controller, Get, HttpException, Post, Query, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { SuperAdminGuard } from '../../shared/super-admin.guard';
import { AiPreviewRateLimitGuard, AiRateLimitGuard } from './ai-rate-limit.guard';
import { AiRecipeService } from './ai-recipe.service';
import { AiUsageService } from './ai-usage.service';
import { AiError } from './ai.types';
import { ImportRecipeDto, PreviewImportDto } from './dto/import-recipe.dto';
import { ParseRecipeDto } from './dto/parse-recipe.dto';
import { RecipeImportService } from './recipe-import.service';
import { StatisticsQueryDto } from './dto/statistics-query.dto';

// Auth + approval required for every route. Generation needs a family writer role
// (enforced in AiAccessService, daily quota for everyone but the super-admin);
// statistics are super-admin only.
@Controller('ai')
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class AiController {
    constructor(
        private readonly aiRecipe: AiRecipeService,
        private readonly importer: RecipeImportService,
        private readonly usage: AiUsageService,
    ) {}

    @Post('recipes/parse')
    @UseGuards(AiRateLimitGuard)
    async parse(@CurrentUser() user: RequestUser, @Body() dto: ParseRecipeDto) {
        return this.handle(() => this.aiRecipe.parse(user, dto.text));
    }

    // Link / photo / text -> recipe draft with a review of what is missing or unclear.
    @Post('recipes/import')
    @UseGuards(AiRateLimitGuard)
    async import(@CurrentUser() user: RequestUser, @Body() dto: ImportRecipeDto) {
        return this.handle(() => this.importer.import(user, dto));
    }

    // AI-free look at a link (platform, title, cover) shown while the import runs.
    @Post('recipes/import/preview')
    @UseGuards(AiPreviewRateLimitGuard)
    async preview(@CurrentUser() user: RequestUser, @Body() dto: PreviewImportDto) {
        return this.handle(() => this.importer.preview(user, dto.url));
    }

    private async handle<T>(run: () => Promise<T>): Promise<T> {
        try {
            return await run();
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
