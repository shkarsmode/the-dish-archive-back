import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Thin wrapper around the generated Prisma client. The schema itself is created
// and evolved with `prisma db push` / `prisma migrate` against DATABASE_URL_UNPOOLED
// (Neon's pooled endpoint can't run DDL). At runtime we only connect.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit() {
        try {
            await this.$connect();
        } catch (error) {
            // Don't crash the whole lambda on a cold DB — log and let the first
            // query surface the error with proper HTTP handling.
            this.logger.error('Prisma failed to connect on init', error as Error);
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
