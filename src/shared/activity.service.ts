import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Writes the audit trail (was the log_activity SECURITY DEFINER RPC). Every
// privileged mutation records who did what to which entity in which family.
@Injectable()
export class ActivityService {
    private readonly logger = new Logger(ActivityService.name);

    constructor(private readonly prisma: PrismaService) {}

    async log(entry: {
        actorUserId?: string | null;
        familyId?: string | null;
        entityType: string;
        entityId?: string | null;
        action: string;
        metadata?: Prisma.InputJsonValue;
    }): Promise<void> {
        try {
            await this.prisma.activityLog.create({
                data: {
                    actorUserId: entry.actorUserId ?? null,
                    familyId: entry.familyId ?? null,
                    entityType: entry.entityType,
                    entityId: entry.entityId ?? null,
                    action: entry.action,
                    metadata: entry.metadata ?? {},
                },
            });
        } catch (error) {
            // Audit failures must never break the user's request.
            this.logger.error('Failed to write activity log', error as Error);
        }
    }
}
