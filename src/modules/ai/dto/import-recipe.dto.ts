import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { AI_IMPORT_MAX_IMAGES } from '../ai.constants';

// A recipe import needs at least one of: a link, photos (data URLs, downsized by the
// client) or a free-text description. The service checks that combination.
export class ImportRecipeDto {
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    url?: string;

    @IsOptional()
    @IsString()
    @MaxLength(6000)
    text?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_IMPORT_MAX_IMAGES)
    @IsString({ each: true })
    @MaxLength(2_300_000, { each: true })
    images?: string[];
}

export class PreviewImportDto {
    @IsString()
    @MaxLength(2000)
    url!: string;
}
