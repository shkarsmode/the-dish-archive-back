import { ForbiddenException, Injectable } from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isSuperAdmin } from './admin';

// The authorization model the old Supabase RLS policies + SECURITY DEFINER
// predicates encoded, reimplemented in application code. Every domain service
// calls these instead of relying on the (now absent) database RLS.
export type AuthzUser = { id: string; email?: string | null; globalRole?: string | null } | null | undefined;

const EDITOR_ROLES: FamilyRole[] = [FamilyRole.owner, FamilyRole.admin, FamilyRole.editor];
const ADMIN_ROLES: FamilyRole[] = [FamilyRole.owner, FamilyRole.admin];

@Injectable()
export class AuthzService {
    constructor(private readonly prisma: PrismaService) {}

    isSuperAdmin(user: AuthzUser): boolean {
        return isSuperAdmin(user);
    }

    /** The user's role in a family if they have an approved membership, else null. */
    async familyRole(userId: string, familyId: string): Promise<FamilyRole | null> {
        const membership = await this.prisma.familyMember.findFirst({
            where: { userId, familyId, status: 'approved' },
            select: { role: true },
        });
        return membership?.role ?? null;
    }

    async isFamilyMember(userId: string, familyId: string): Promise<boolean> {
        const found = await this.prisma.familyMember.findFirst({
            where: { userId, familyId, status: 'approved' },
            select: { id: true },
        });
        return !!found;
    }

    /** super-admin OR approved owner/admin/editor. */
    async canEditFamily(user: AuthzUser, familyId: string): Promise<boolean> {
        if (isSuperAdmin(user)) return true;
        if (!user) return false;
        const role = await this.familyRole(user.id, familyId);
        return !!role && EDITOR_ROLES.includes(role);
    }

    /** super-admin OR approved owner/admin. */
    async canAdminFamily(user: AuthzUser, familyId: string): Promise<boolean> {
        if (isSuperAdmin(user)) return true;
        if (!user) return false;
        const role = await this.familyRole(user.id, familyId);
        return !!role && ADMIN_ROLES.includes(role);
    }

    /** Mirrors can_view_dish: editors see all; members see published; anyone sees published+public. */
    async canViewDish(user: AuthzUser, dishId: string): Promise<boolean> {
        const dish = await this.prisma.dish.findUnique({
            where: { id: dishId },
            select: { familyId: true, status: true, visibility: true },
        });
        if (!dish) return false;
        if (isSuperAdmin(user)) return true;
        if (user && (await this.canEditFamily(user, dish.familyId))) return true;
        if (dish.status === 'published' && dish.visibility === 'public') return true;
        if (dish.status === 'published' && user && (await this.isFamilyMember(user.id, dish.familyId))) return true;
        return false;
    }

    async canEditDish(user: AuthzUser, dishId: string): Promise<boolean> {
        const dish = await this.prisma.dish.findUnique({ where: { id: dishId }, select: { familyId: true } });
        if (!dish) return false;
        return this.canEditFamily(user, dish.familyId);
    }

    async ownerCount(familyId: string): Promise<number> {
        return this.prisma.familyMember.count({ where: { familyId, role: 'owner', status: 'approved' } });
    }

    /** Rank rule (assert_can_grant_role): only owners/super grant owner/admin; owners+admins grant editor/viewer. */
    async assertCanGrantRole(user: AuthzUser, familyId: string, targetRole: FamilyRole): Promise<void> {
        if (isSuperAdmin(user)) return;
        if (!user) throw new ForbiddenException('Потрібна авторизація');
        const role = await this.familyRole(user.id, familyId);
        if (!role) throw new ForbiddenException('Ви не є учасником цієї родини');
        if (targetRole === 'owner' || targetRole === 'admin') {
            if (role !== 'owner') {
                throw new ForbiddenException('Лише власник може призначати власників або адмінів');
            }
        } else if (role !== 'owner' && role !== 'admin') {
            throw new ForbiddenException('Недостатньо прав для призначення ролі');
        }
    }

    /** Assert helpers that throw a 403 instead of returning false. */
    async assertCanEditFamily(user: AuthzUser, familyId: string): Promise<void> {
        if (!(await this.canEditFamily(user, familyId))) {
            throw new ForbiddenException('Недостатньо прав для редагування цієї родини');
        }
    }

    async assertCanAdminFamily(user: AuthzUser, familyId: string): Promise<void> {
        if (!(await this.canAdminFamily(user, familyId))) {
            throw new ForbiddenException('Потрібні права власника або адміністратора родини');
        }
    }
}
