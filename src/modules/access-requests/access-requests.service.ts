import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FamilyMember, FamilyRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService } from '../../shared/authz.service';
import { RequestUser } from '../../shared/current-user.decorator';
import { ApproveDto } from './dto/approve.dto';
import { RejectDto } from './dto/reject.dto';
import { RequestAccessDto } from './dto/request-access.dto';

// Pulls the related family + requesting-user context every response needs
// (familyName/slug + displayName/avatarUrl on the requester).
const ACCESS_REQUEST_INCLUDE = {
    family: { select: { name: true, slug: true } },
    requestedByUser: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.AccessRequestInclude;

type AccessRequestWithContext = Prisma.AccessRequestGetPayload<{ include: typeof ACCESS_REQUEST_INCLUDE }>;

// Prisma row → the camelCase AccessRequestWithContext shape the Angular app expects.
function toApiAccessRequest(row: AccessRequestWithContext) {
    return {
        id: row.id,
        email: row.email,
        familyId: row.familyId ?? null,
        requestedRole: row.requestedRole ?? null,
        status: row.status,
        requestedByUserId: row.requestedByUserId ?? null,
        reviewedByUserId: row.reviewedByUserId ?? null,
        reviewNote: row.reviewNote ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        familyName: row.family?.name ?? null,
        familySlug: row.family?.slug ?? null,
        displayName: row.requestedByUser?.displayName ?? null,
        avatarUrl: row.requestedByUser?.avatarUrl ?? null,
    };
}

// The membership row returned by approve (mirrors auth.service's toMembership scalars).
function toApiMembership(m: FamilyMember) {
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
    };
}

@Injectable()
export class AccessRequestsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    // request_access RPC: any logged-in user files a pending request for a family
    // (or general access). Email is read from the User row, not the client.
    async requestAccess(user: RequestUser, dto: RequestAccessDto) {
        const dbUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { email: true },
        });
        if (!dbUser) throw new NotFoundException('Користувача не знайдено');

        const familyId = dto.familyId ?? null;
        const role: FamilyRole = dto.role ?? 'viewer';

        const created = await this.prisma.accessRequest.create({
            data: {
                email: dbUser.email,
                familyId,
                requestedRole: role,
                status: 'pending',
                requestedByUserId: user.id,
            },
            include: ACCESS_REQUEST_INCLUDE,
        });

        await this.activity.log({
            actorUserId: user.id,
            familyId,
            entityType: 'access_request',
            entityId: created.id,
            action: 'requested',
            metadata: { requestedRole: role },
        });
        return toApiAccessRequest(created);
    }

    // Visible requests: super-admin sees all; otherwise the caller's own requests
    // plus any request scoped to a family the caller can admin (owner/admin).
    async listForAdmin(user: RequestUser) {
        let where: Prisma.AccessRequestWhereInput;
        if (this.authz.isSuperAdmin(user)) {
            where = {};
        } else {
            const admin = await this.prisma.familyMember.findMany({
                where: { userId: user.id, status: 'approved', role: { in: ['owner', 'admin'] } },
                select: { familyId: true },
            });
            const adminFamilyIds = admin.map((m) => m.familyId);
            const or: Prisma.AccessRequestWhereInput[] = [{ requestedByUserId: user.id }];
            if (adminFamilyIds.length) or.push({ familyId: { in: adminFamilyIds } });
            where = { OR: or };
        }

        const rows = await this.prisma.accessRequest.findMany({
            where,
            include: ACCESS_REQUEST_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
        return rows.map(toApiAccessRequest);
    }

    // approve_access_request RPC: grant an approved membership and mark the request approved.
    async approve(user: RequestUser, id: string, dto: ApproveDto) {
        const request = await this.prisma.accessRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Запит не знайдено');
        if (request.status !== 'pending') throw new BadRequestException('Запит уже оброблено');

        const target = request.familyId ?? dto.familyId;
        if (!target) throw new BadRequestException('Потрібно вказати родину для підтвердження');

        const role: FamilyRole = dto.role ?? 'viewer';

        if (!this.authz.isSuperAdmin(user) && !(await this.authz.canAdminFamily(user, target))) {
            throw new ForbiddenException('Потрібні права власника або адміністратора родини');
        }
        await this.authz.assertCanGrantRole(user, target, role);

        // Resolve the person the request is for: their existing user row, else by
        // email once they have logged in at least once.
        let requesterId = request.requestedByUserId;
        if (!requesterId) {
            const found = await this.prisma.user.findUnique({
                where: { email: request.email },
                select: { id: true },
            });
            if (!found) throw new BadRequestException('Користувач ще не увійшов');
            requesterId = found.id;
        }

        const now = new Date();
        const membership = await this.prisma.$transaction(async (tx) => {
            const m = await tx.familyMember.upsert({
                where: { familyId_userId: { familyId: target, userId: requesterId! } },
                update: { role, status: 'approved', approvedByUserId: user.id, approvedAt: now },
                create: {
                    familyId: target,
                    userId: requesterId!,
                    role,
                    status: 'approved',
                    approvedByUserId: user.id,
                    approvedAt: now,
                },
            });
            await tx.accessRequest.update({
                where: { id },
                data: { status: 'approved', reviewedByUserId: user.id },
            });
            return m;
        });

        await this.activity.log({
            actorUserId: user.id,
            familyId: target,
            entityType: 'family_member',
            entityId: membership.id,
            action: 'approved',
            metadata: { accessRequestId: id, userId: requesterId, role },
        });
        return toApiMembership(membership);
    }

    // reject_access_request RPC: mark the request rejected with an optional note.
    async reject(user: RequestUser, id: string, dto: RejectDto) {
        const request = await this.prisma.accessRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Запит не знайдено');

        const allowed =
            this.authz.isSuperAdmin(user) ||
            (!!request.familyId && (await this.authz.canAdminFamily(user, request.familyId)));
        if (!allowed) throw new ForbiddenException('Недостатньо прав для відхилення цього запиту');

        const updated = await this.prisma.accessRequest.update({
            where: { id },
            data: { status: 'rejected', reviewedByUserId: user.id, reviewNote: dto.note ?? null },
            include: ACCESS_REQUEST_INCLUDE,
        });

        await this.activity.log({
            actorUserId: user.id,
            familyId: request.familyId,
            entityType: 'access_request',
            entityId: id,
            action: 'rejected',
            metadata: dto.note ? { note: dto.note } : {},
        });
        return toApiAccessRequest(updated);
    }
}
