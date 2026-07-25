import { FamilyRole } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

// Body for POST families/:familyId/members (add_family_member). `role` defaults
// to 'viewer' in the service when omitted.
export class AddMemberDto {
    @IsString()
    userId!: string;

    @IsOptional()
    @IsIn(['owner', 'admin', 'editor', 'viewer'])
    role?: FamilyRole;
}
