import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AiAccessService } from './ai-access.service';
import { AiController } from './ai.controller';
import { AiRecipeService } from './ai-recipe.service';
import { AiUsageService } from './ai-usage.service';
import { GeminiService } from './gemini.service';
import { SourceExtractor } from './import/source-extractor';
import { RecipeImportService } from './recipe-import.service';

// PrismaModule is @Global, so PrismaService is injected without importing it.
@Module({
    imports: [UploadsModule],
    controllers: [AiController],
    providers: [AiRecipeService, RecipeImportService, SourceExtractor, AiAccessService, GeminiService, AiUsageService],
})
export class AiModule {}
