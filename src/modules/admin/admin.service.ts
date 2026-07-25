import { Injectable } from '@nestjs/common';
import { ActivityLog, Family, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toFamily } from '../families/family.serializer';

// Super-admin dashboard reads: platform-wide stats, families, users and the
// audit trail. Every route is gated by SuperAdminGuard at the controller, so
// these methods don't re-check authz — they just serialize.
@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) {}

    async stats() {
        const [families, dishes, users, pendingRequests] = await Promise.all([
            this.prisma.family.count(),
            this.prisma.dish.count(),
            this.prisma.user.count(),
            this.prisma.accessRequest.count({ where: { status: 'pending' } }),
        ]);
        return { families, dishes, users, pendingRequests };
    }

    async families() {
        const rows = await this.prisma.family.findMany({ orderBy: { createdAt: 'desc' } });
        return rows.map(toFamily);
    }

    async users() {
        const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
        return rows.map((u) => this.toUserProfile(u));
    }

    async activity(limitRaw?: string) {
        const parsed = Number.parseInt(String(limitRaw ?? ''), 10);
        const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 60;

        const rows = await this.prisma.activityLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                actor: { select: { displayName: true, email: true } },
                family: { select: { name: true } },
            },
        });
        return rows.map((row) => this.toActivityEntry(row));
    }

    private toUserProfile(u: User) {
        return {
            id: u.id,
            email: u.email,
            displayName: u.displayName ?? null,
            avatarUrl: u.avatarUrl ?? null,
            globalRole: u.globalRole,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        };
    }

    private toActivityEntry(
        row: ActivityLog & {
            actor: Pick<User, 'displayName' | 'email'> | null;
            family: Pick<Family, 'name'> | null;
        },
    ) {
        return {
            id: row.id,
            actorUserId: row.actorUserId ?? null,
            familyId: row.familyId ?? null,
            entityType: row.entityType,
            entityId: row.entityId ?? null,
            action: row.action,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
            actorDisplayName: row.actor?.displayName ?? null,
            actorEmail: row.actor?.email ?? null,
            familyName: row.family?.name ?? null,
        };
    }
}
