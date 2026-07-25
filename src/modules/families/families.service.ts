import { Injectable, NotFoundException } from '@nestjs/common';
import { FamilyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService, AuthzUser } from '../../shared/authz.service';
import { toFamily } from './family.serializer';
import type { UpdateFamilyDto } from './families.controller';

@Injectable()
export class FamiliesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    // Families the caller may see (mirrors the families_select RLS policy).
    // Super-admin: all. Member: public OR any family they're an approved member of.
    // Anon: public only. Optional ?status filter narrows the set.
    async list(user: AuthzUser, status?: string) {
        const where: Prisma.FamilyWhereInput = {};
        if (status) where.status = status as FamilyStatus;

        if (!this.authz.isSuperAdmin(user)) {
            const memberFamilyIds: string[] = user
                ? (
                      await this.prisma.familyMember.findMany({
                          where: { userId: user.id, status: 'approved' },
                          select: { familyId: true },
                      })
                  ).map((m) => m.familyId)
                : [];

            const or: Prisma.FamilyWhereInput[] = [{ isPublicVisible: true }];
            if (memberFamilyIds.length) or.push({ id: { in: memberFamilyIds } });
            where.OR = or;
        }

        const families = await this.prisma.family.findMany({
            where,
            orderBy: { name: 'asc' },
        });
        return families.map(toFamily);
    }

    // Update family metadata. Authz never trusts a client-supplied familyId — the
    // id comes from the route and admin rights are asserted against the DB entity.
    async update(user: AuthzUser, id: string, dto: UpdateFamilyDto) {
        await this.authz.assertCanAdminFamily(user, id);

        const existing = await this.prisma.family.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new NotFoundException('Родину не знайдено');

        const data: Prisma.FamilyUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
        if (dto.avatarImageUrl !== undefined) data.avatarImageUrl = dto.avatarImageUrl;
        if (dto.themeColor !== undefined) data.themeColor = dto.themeColor;
        if (dto.isPublicVisible !== undefined) data.isPublicVisible = dto.isPublicVisible;

        const family = await this.prisma.family.update({ where: { id }, data });

        await this.activity.log({
            actorUserId: user!.id,
            familyId: id,
            entityType: 'family',
            entityId: id,
            action: 'updated',
        });
        return toFamily(family);
    }
}
