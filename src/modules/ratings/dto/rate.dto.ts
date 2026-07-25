import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Body for PUT dishes/:dishId/ratings/me (was the rate_dish RPC).
export class RateDto {
    @IsInt()
    @Min(1)
    @Max(5)
    rating!: number;

    // Nullable: @IsOptional() skips the remaining validators when comment is
    // null/undefined, so null and string both pass.
    @IsOptional()
    @IsString()
    comment?: string | null;
}
