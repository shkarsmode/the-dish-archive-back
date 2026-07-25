import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class StatisticsQueryDto {
    @IsOptional()
    @IsIn(['today', '7d', '30d', 'all'])
    period?: 'today' | '7d' | '30d' | 'all';

    @IsOptional()
    @IsIn(['success', 'error', 'all'])
    status?: 'success' | 'error' | 'all';

    @IsOptional()
    @IsString()
    @MaxLength(80)
    model?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    userId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number;
}
