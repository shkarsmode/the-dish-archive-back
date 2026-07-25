import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiRecipeService } from './ai-recipe.service';
import { AiUsageService } from './ai-usage.service';
import { GeminiService } from './gemini.service';

// PrismaModule is @Global, so PrismaService is injected without importing it.
@Module({
    controllers: [AiController],
    providers: [AiRecipeService, GeminiService, AiUsageService],
})
export class AiModule {}
