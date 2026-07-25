import { FamilyRole } from '@prisma/client';
import { IsIn } from 'class-validator';

// Body for PATCH families/:familyId/members/:memberId/role (set_member_role).
export class SetRoleDto {
    @IsIn(['owner', 'admin', 'editor', 'viewer'])
    role!: FamilyRole;
}
