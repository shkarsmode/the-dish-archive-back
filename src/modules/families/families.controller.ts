import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../shared/optional-jwt-auth.guard';
import { FamiliesService } from './families.service';

// PATCH body — every field optional; only provided fields are written.
export class UpdateFamilyDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    coverImageUrl?: string;

    @IsOptional()
    @IsString()
    avatarImageUrl?: string;

    @IsOptional()
    @IsString()
    themeColor?: string;

    @IsOptional()
    @IsBoolean()
    isPublicVisible?: boolean;
}

@Controller('families')
export class FamiliesController {
    constructor(private readonly families: FamiliesService) {}

    // Reads: optional auth — anon sees only public families, a member also sees
    // their own; super-admin sees all (mirrors the old RLS-scoped select).
    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    list(@CurrentUser() user: RequestUser | null, @Query('status') status?: string) {
        return this.families.list(user, status);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: UpdateFamilyDto) {
        return this.families.update(user, id, body);
    }
}
