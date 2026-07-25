import { FamilyRole } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

// Body for POST /access-requests (was the request_access RPC). Both fields are
// optional: a family-less request asks for general access; role defaults to
// 'viewer' in the service.
export class RequestAccessDto {
    @IsOptional()
    @IsString()
    familyId?: string;

    @IsOptional()
    @IsIn(['owner', 'admin', 'editor', 'viewer'])
    role?: FamilyRole;
}
