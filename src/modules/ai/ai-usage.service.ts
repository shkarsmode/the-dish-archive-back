import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolvePage } from '../../shared/pagination';
import {
    aiModel,
    AI_OPERATION,
    GEMINI_FREE_TIER_LIMITS,
    GEMINI_LIMITS_SOURCE_URL,
    GEMINI_QUOTA_DASHBOARD_URL,
} from './ai.constants';
import { GeminiService } from './gemini.service';

export interface AiUsageEntry {
    userId: string | null;
    operation: string;
    model: string;
    status: 'success' | 'error';
    errorCode?: string | null;
    errorMessage?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    cachedTokens?: number | null;
    thoughtsTokens?: number | null;
    durationMs?: number | null;
    inputLength?: number | null;
    recognizedIngredients?: number | null;
    recognizedSteps?: number | null;
    warningsCount?: number | null;
}

type Period = 'today' | '7d' | '30d' | 'all';

export interface StatisticsQuery {
    period?: Period;
    status?: 'success' | 'error' | 'all';
    model?: string;
    userId?: string;
    page?: number | string;
    pageSize?: number | string;
}

@Injectable()
export class AiUsageService implements OnModuleInit {
    private readonly logger = new Logger(AiUsageService.name);
    private tableReady = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly gemini: GeminiService,
    ) {}

    async onModuleInit() {
        await this.ensureTable();
    }

    // Idempotent table creation for serverless Postgres where the pooled connection
    // can't run migration DDL. Best-effort — the log path degrades gracefully.
    async ensureTable() {
        if (this.tableReady) return;
        try {
            await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiUsageLog" (
                "id" TEXT NOT NULL,
                "userId" TEXT,
                "operation" TEXT NOT NULL,
                "model" TEXT NOT NULL,
                "status" TEXT NOT NULL,
                "errorCode" TEXT,
                "errorMessage" TEXT,
                "inputTokens" INTEGER,
                "outputTokens" INTEGER,
                "totalTokens" INTEGER,
                "cachedTokens" INTEGER,
                "thoughtsTokens" INTEGER,
                "durationMs" INTEGER,
                "inputLength" INTEGER,
                "recognizedIngredients" INTEGER,
                "recognizedSteps" INTEGER,
                "warningsCount" INTEGER,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
            )`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog" ("createdAt")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_idx" ON "AiUsageLog" ("userId")`);
            await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsageLog_status_idx" ON "AiUsageLog" ("status")`);
            this.tableReady = true;
        } catch (error) {
            this.logger.warn(`ensureTable failed: ${(error as Error).message}`);
        }
    }

    // Fire-and-forget audit write. Never throws into the request path.
    async log(entry: AiUsageEntry): Promise<void> {
        try {
            await this.ensureTable();
            await this.prisma.aiUsageLog.create({
                data: {
                    userId: entry.userId ?? null,
                    operation: entry.operation,
                    model: entry.model,
                    status: entry.status,
                    errorCode: entry.errorCode ?? null,
                    errorMessage: entry.errorMessage ? entry.errorMessage.slice(0, 300) : null,
                    inputTokens: entry.inputTokens ?? null,
                    outputTokens: entry.outputTokens ?? null,
                    totalTokens: entry.totalTokens ?? null,
                    cachedTokens: entry.cachedTokens ?? null,
                    thoughtsTokens: entry.thoughtsTokens ?? null,
                    durationMs: entry.durationMs ?? null,
                    inputLength: entry.inputLength ?? null,
                    recognizedIngredients: entry.recognizedIngredients ?? null,
                    recognizedSteps: entry.recognizedSteps ?? null,
                    warningsCount: entry.warningsCount ?? null,
                },
            });
        } catch (error) {
            this.logger.warn(`Failed to write AiUsageLog: ${(error as Error).message}`);
        }
    }

    // Successful recipe generations by this user today — drives the daily quota.
    async countTodaySuccess(userId: string): Promise<number> {
        try {
            await this.ensureTable();
            return await this.prisma.aiUsageLog.count({
                where: { userId, operation: AI_OPERATION, status: 'success', createdAt: { gte: startOfToday() } },
            });
        } catch (error) {
            this.logger.warn(`countTodaySuccess failed: ${(error as Error).message}`);
            return 0;
        }
    }

    async summary(query: StatisticsQuery) {
        await this.ensureTable();
        const period = query.period || '30d';
        const [today, last7Days, last30Days, total] = await Promise.all([
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfToday() } } }),
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: daysAgo(7) } } }),
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: daysAgo(30) } } }),
            this.prisma.aiUsageLog.count(),
        ]);

        const rows = await this.prisma.aiUsageLog.findMany({
            where: this.buildWhere({ ...query, status: 'all' }),
            select: {
                status: true,
                model: true,
                inputTokens: true,
                outputTokens: true,
                totalTokens: true,
                cachedTokens: true,
                thoughtsTokens: true,
                durationMs: true,
            },
        });

        const success = rows.filter((r) => r.status === 'success').length;
        const modelMap = new Map<string, { requests: number; totalTokens: number }>();
        let inputTokens = 0;
        let outputTokens = 0;
        let totalTokens = 0;
        let latencySum = 0;
        let latencyCount = 0;
        let maxLatencyMs = 0;
        for (const r of rows) {
            inputTokens += r.inputTokens || 0;
            outputTokens += r.outputTokens || 0;
            totalTokens += r.totalTokens || 0;
            if (typeof r.durationMs === 'number') {
                latencySum += r.durationMs;
                latencyCount += 1;
                maxLatencyMs = Math.max(maxLatencyMs, r.durationMs);
            }
            const bucket = modelMap.get(r.model) || { requests: 0, totalTokens: 0 };
            bucket.requests += 1;
            bucket.totalTokens += r.totalTokens || 0;
            modelMap.set(r.model, bucket);
        }

        return {
            counts: { today, last7Days, last30Days, total },
            period: {
                key: period,
                requests: rows.length,
                success,
                errors: rows.length - success,
                successRate: rows.length ? Math.round((success / rows.length) * 1000) / 10 : 0,
                inputTokens,
                outputTokens,
                totalTokens,
                avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : 0,
                maxLatencyMs,
            },
            models: [...modelMap.entries()]
                .map(([model, v]) => ({ model, requests: v.requests, totalTokens: v.totalTokens }))
                .sort((a, b) => b.requests - a.requests),
        };
    }

    // Daily buckets for the chart (last 30 days for "all").
    async usage(query: StatisticsQuery) {
        await this.ensureTable();
        const from = periodStart(query.period || '30d') || daysAgo(30);
        const rows = await this.prisma.aiUsageLog.findMany({
            where: { ...this.buildWhere(query), createdAt: { gte: from } },
            select: { createdAt: true, inputTokens: true, outputTokens: true, totalTokens: true },
            orderBy: { createdAt: 'asc' },
        });
        const buckets = new Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number }>();
        for (const r of rows) {
            const day = r.createdAt.toISOString().slice(0, 10);
            const b = buckets.get(day) || { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
            b.requests += 1;
            b.inputTokens += r.inputTokens || 0;
            b.outputTokens += r.outputTokens || 0;
            b.totalTokens += r.totalTokens || 0;
            buckets.set(day, b);
        }
        return { days: [...buckets.entries()].map(([date, v]) => ({ date, ...v })) };
    }

    // Paginated "who used how much" table (this is the P7 pagination the gymos
    // version lacked — real page/pageSize/total).
    async requests(query: StatisticsQuery) {
        await this.ensureTable();
        const { page, pageSize, skip, take } = resolvePage(query);
        const where = this.buildWhere(query);
        const [rows, total] = await Promise.all([
            this.prisma.aiUsageLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
            this.prisma.aiUsageLog.count({ where }),
        ]);

        const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))];
        const users = userIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } })
            : [];
        const userMap = new Map(users.map((u) => [u.id, u]));

        return {
            items: rows.map((r) => ({
                id: r.id,
                createdAt: r.createdAt.toISOString(),
                userId: r.userId,
                userName: r.userId ? userMap.get(r.userId)?.displayName || '—' : '—',
                userEmail: r.userId ? userMap.get(r.userId)?.email || '' : '',
                operation: r.operation,
                model: r.model,
                status: r.status,
                errorCode: r.errorCode,
                totalTokens: r.totalTokens,
                inputTokens: r.inputTokens,
                outputTokens: r.outputTokens,
                durationMs: r.durationMs,
                inputLength: r.inputLength,
                recognizedIngredients: r.recognizedIngredients,
                recognizedSteps: r.recognizedSteps,
                warningsCount: r.warningsCount,
            })),
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
    }

    async limits() {
        await this.ensureTable();
        const model = aiModel();
        const official = GEMINI_FREE_TIER_LIMITS[model] || null;
        const [requestsToday, tokensTodayAgg] = await Promise.all([
            this.prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfToday() }, status: 'success' } }),
            this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: startOfToday() } }, _sum: { totalTokens: true } }),
        ]);
        return {
            model,
            configured: this.gemini.isConfigured(),
            official,
            allModels: GEMINI_FREE_TIER_LIMITS,
            usage: { requestsToday, totalTokensToday: tokensTodayAgg._sum.totalTokens || 0 },
            sources: { limitsDoc: GEMINI_LIMITS_SOURCE_URL, quotaDashboard: GEMINI_QUOTA_DASHBOARD_URL },
        };
    }

    private buildWhere(query: StatisticsQuery) {
        const where: Record<string, unknown> = {};
        const from = periodStart(query.period || 'all');
        if (from) where.createdAt = { gte: from };
        if (query.status && query.status !== 'all') where.status = query.status;
        if (query.model) where.model = query.model;
        if (query.userId) where.userId = query.userId;
        return where;
    }
}

function startOfToday(): Date {
    return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}
function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
function periodStart(period: Period): Date | null {
    if (period === 'today') return startOfToday();
    if (period === '7d') return daysAgo(7);
    if (period === '30d') return daysAgo(30);
    return null;
}
