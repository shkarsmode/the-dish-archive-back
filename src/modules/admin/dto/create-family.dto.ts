import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFamilyDto {
    @IsString()
    @MinLength(1)
    slug!: string;

    @IsString()
    @MinLength(1)
    name!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    themeColor?: string;

    @IsOptional()
    @IsString()
    ownerUserId?: string;
}
