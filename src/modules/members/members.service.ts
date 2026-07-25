import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FamilyMember, FamilyRole, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService, AuthzUser } from '../../shared/authz.service';
import { AddMemberDto } from './dto/add-member.dto';
import { SetRoleDto } from './dto/set-role.dto';

// The membership row with its related User flattened onto the response.
type FamilyMemberWithProfile = {
    id: string;
    familyId: string;
    userId: string;
    role: FamilyRole;
    status: string;
    approvedByUserId: string | null;
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
};

type MemberWithUser = FamilyMember & { user: User };

// Reimplements the family-membership SECURITY DEFINER RPCs (list / add / set role
// / remove). Every authz rule the old RLS + assert_* predicates encoded is
// re-checked in code, and every mutation writes the audit trail.
@Injectable()
export class MembersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    // List every non-removed member of a family (admin-only view).
    async list(user: AuthzUser, familyId: string): Promise<FamilyMemberWithProfile[]> {
        await this.authz.assertCanAdminFamily(user, familyId);
        const members = await this.prisma.familyMember.findMany({
            where: { familyId, status: { not: 'removed' } },
            include: { user: true },
            orderBy: { createdAt: 'asc' },
        });
        return members.map((m) => this.toMember(m));
    }

    // add_family_member: upsert an approved membership at the requested role.
    async add(user: AuthzUser, familyId: string, dto: AddMemberDto): Promise<FamilyMemberWithProfile> {
        await this.authz.assertCanAdminFamily(user, familyId);
        const role: FamilyRole = dto.role ?? 'viewer';
        await this.authz.assertCanGrantRole(user, familyId, role);

        const now = new Date();
        const member = await this.prisma.familyMember.upsert({
            where: { familyId_userId: { familyId, userId: dto.userId } },
            update: { role, status: 'approved', approvedByUserId: user!.id, approvedAt: now },
            create: {
                familyId,
                userId: dto.userId,
                role,
                status: 'approved',
                approvedByUserId: user!.id,
                approvedAt: now,
            },
            include: { user: true },
        });

        await this.activity.log({
            actorUserId: user!.id,
            familyId,
            entityType: 'family_member',
            entityId: member.id,
            action: 'added',
            metadata: { userId: dto.userId, role },
        });
        return this.toMember(member);
    }

    // set_member_role: change an existing member's role, subject to the rank rules.
    async setRole(
        user: AuthzUser,
        familyId: string,
        memberId: string,
        dto: SetRoleDto,
    ): Promise<FamilyMemberWithProfile> {
        const member = await this.prisma.familyMember.findFirst({
            where: { id: memberId, familyId },
            include: { user: true },
        });
        if (!member) throw new NotFoundException('Учасника не знайдено');

        await this.authz.assertCanAdminFamily(user, familyId);

        const isSuper = this.authz.isSuperAdmin(user);

        // Cannot change your own role unless super-admin.
        if (member.userId === user!.id && !isSuper) {
            throw new ForbiddenException('Не можна змінювати власну роль');
        }
        // Only an owner (or super-admin) may modify an existing owner.
        if (member.role === 'owner' && !isSuper) {
            const callerRole = await this.authz.familyRole(user!.id, familyId);
            if (callerRole !== 'owner') {
                throw new ForbiddenException('Лише власник може змінювати роль власника');
            }
        }

        const newRole = dto.role;
        await this.authz.assertCanGrantRole(user, familyId, newRole);

        // Cannot demote the last remaining owner.
        if (member.role === 'owner' && newRole !== 'owner' && (await this.authz.ownerCount(familyId)) <= 1) {
            throw new ForbiddenException('Не можна змінити роль останнього власника');
        }

        const updated = await this.prisma.familyMember.update({
            where: { id: member.id },
            data: { role: newRole },
            include: { user: true },
        });

        await this.activity.log({
            actorUserId: user!.id,
            familyId,
            entityType: 'family_member',
            entityId: member.id,
            action: 'role_changed',
            metadata: { userId: member.userId, from: member.role, to: newRole },
        });
        return this.toMember(updated);
    }

    // remove_member: soft delete (status 'removed'), never a hard delete.
    async remove(user: AuthzUser, familyId: string, memberId: string): Promise<FamilyMemberWithProfile> {
        const member = await this.prisma.familyMember.findFirst({
            where: { id: memberId, familyId },
            include: { user: true },
        });
        if (!member) throw new NotFoundException('Учасника не знайдено');

        await this.authz.assertCanAdminFamily(user, familyId);

        // Removing an owner requires owner/super and is blocked if it's the last one.
        if (member.role === 'owner') {
            if (!this.authz.isSuperAdmin(user)) {
                const callerRole = await this.authz.familyRole(user!.id, familyId);
                if (callerRole !== 'owner') {
                    throw new ForbiddenException('Лише власник може видалити власника');
                }
            }
            if ((await this.authz.ownerCount(familyId)) <= 1) {
                throw new ForbiddenException('Не можна видалити останнього власника');
            }
        }

        const updated = await this.prisma.familyMember.update({
            where: { id: member.id },
            data: { status: 'removed' },
            include: { user: true },
        });

        await this.activity.log({
            actorUserId: user!.id,
            familyId,
            entityType: 'family_member',
            entityId: member.id,
            action: 'removed',
            metadata: { userId: member.userId, role: member.role },
        });
        return this.toMember(updated);
    }

    // Flatten the related User (relation "MemberUser") onto the membership row,
    // dates -> ISO strings, nullables -> ?? null.
    private toMember(m: MemberWithUser): FamilyMemberWithProfile {
        return {
            id: m.id,
            familyId: m.familyId,
            userId: m.userId,
            role: m.role,
            status: m.status,
            approvedByUserId: m.approvedByUserId ?? null,
            approvedAt: m.approvedAt ? m.approvedAt.toISOString() : null,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
            email: m.user.email,
            displayName: m.user.displayName ?? null,
            avatarUrl: m.user.avatarUrl ?? null,
        };
    }
}
