import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isSuperAdmin } from '../../shared/admin';
import { RequestUser } from '../../shared/current-user.decorator';
import { AI_ERROR, aiDailyLimit } from './ai.constants';
import { AiUsageService } from './ai-usage.service';
import { AiError } from './ai.types';

export interface AiQuota {
    isSuper: boolean;
    dailyLimit: number | null;
    dailyUsed: number;
}

/** Family roles that may use AI, overridable with AI_ALLOWED_ROLES (comma-separated). */
export function aiAllowedRoles(): string[] {
    const roles = String(process.env.AI_ALLOWED_ROLES || 'owner,admin,editor')
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean);
    return roles.length ? roles : ['owner', 'admin'];
}

// Who may spend AI calls, and how many are left today. Anyone who can write
// recipes in a family gets the daily quota; the super-admin is unlimited.
@Injectable()
export class AiAccessService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly usage: AiUsageService,
    ) {}

    async assertAllowed(user: RequestUser, options: { skipQuota?: boolean } = {}): Promise<AiQuota> {
        if (isSuperAdmin(user)) {
            return { isSuper: true, dailyLimit: null, dailyUsed: 0 };
        }
        const membership = await this.prisma.familyMember.findFirst({
            where: { userId: user.id, status: 'approved', role: { in: aiAllowedRoles() as never[] } },
            select: { id: true },
        });
        if (!membership) {
            throw new AiError(AI_ERROR.FORBIDDEN, 'AI доступний лише тим, хто може додавати рецепти в родину.', 403);
        }
        const dailyLimit = aiDailyLimit();
        if (options.skipQuota) return { isSuper: false, dailyLimit, dailyUsed: 0 };
        const dailyUsed = await this.usage.countTodaySuccess(user.id);
        if (dailyUsed >= dailyLimit) {
            throw new AiError(AI_ERROR.DAILY_LIMIT, `Ліміт ${dailyLimit} AI-рецептів на день вичерпано. Спробуйте завтра.`, 429);
        }
        return { isSuper: false, dailyLimit, dailyUsed };
    }
}
