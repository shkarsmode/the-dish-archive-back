import { FamilyRole } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

// Body for POST /admin/access-requests/:id/approve (was approve_access_request).
// familyId is only consulted when the request itself carries no family; role
// defaults to 'viewer' in the service.
export class ApproveDto {
    @IsOptional()
    @IsString()
    familyId?: string;

    @IsOptional()
    @IsIn(['owner', 'admin', 'editor', 'viewer'])
    role?: FamilyRole;
}
