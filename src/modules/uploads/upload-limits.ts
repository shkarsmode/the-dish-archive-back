import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService } from '../../shared/authz.service';
import { RequestUser } from '../../shared/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

// Every upload spends Cloudinary credits, so uploads are bounded three ways: images only,
// at most 5 MB each (multer refuses before a byte reaches Cloudinary), and a per-user pace
// plus a daily count. Without these, any Google account could fill the free quota in hours.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/;

export const IMAGE_UPLOAD: MulterOptions = {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 },
    fileFilter: (_req, file, cb) =>
        IMAGE_TYPES.test(file.mimetype)
            ? cb(null, true)
            : cb(new BadRequestException('Можна завантажувати лише зображення (JPG, PNG, WebP, GIF, AVIF, HEIC)'), false),
};

// Burst guard: 10 uploads a minute per user. In-memory and per instance, like the AI guard —
// the daily count below is the real limit.
@Injectable()
export class UploadRateLimitGuard implements CanActivate {
    private readonly hits = new Map<string, number[]>();

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const key = request.user?.id || request.ip || 'anon';
        const now = Date.now();
        const stamps = (this.hits.get(key) || []).filter((stamp) => now - stamp < 60_000);
        if (stamps.length >= 10) {
            throw new HttpException(
                { code: 'UPLOAD_RATE_LIMIT', message: 'Забагато завантажень. Спробуйте за хвилину.', retryAfterMs: 60_000 - (now - stamps[0]) },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        stamps.push(now);
        this.hits.set(key, stamps);
        if (this.hits.size > 1000) this.hits.clear();
        return true;
    }
}

// Daily count from the audit trail (no extra table): uploads in the last 24 hours per user,
// UPLOADS_DAILY_LIMIT (default 50). The super-admin is not counted.
@Injectable()
export class UploadQuotaService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    private limit(): number {
        const n = Number(process.env.UPLOADS_DAILY_LIMIT);
        return Number.isFinite(n) && n > 0 ? n : 50;
    }

    async assertCanUpload(user: RequestUser): Promise<void> {
        if (this.authz.isSuperAdmin(user)) return;
        const since = new Date(Date.now() - 24 * 3600_000);
        const used = await this.prisma.activityLog.count({
            where: { actorUserId: user.id, entityType: 'upload', createdAt: { gte: since } },
        });
        if (used >= this.limit()) {
            throw new HttpException(
                { code: 'UPLOAD_LIMIT', message: `Ліміт завантажень на добу вичерпано (${this.limit()}). Спробуйте завтра.` },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    record(user: RequestUser, folder: string, bytes: number): Promise<void> {
        return this.activity.log({ actorUserId: user.id, entityType: 'upload', action: 'uploaded', metadata: { folder, bytes } });
    }
}
