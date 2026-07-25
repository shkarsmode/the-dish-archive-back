import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        SharedModule,
        AuthModule,
        // Domain modules (dishes, families, members, ratings, likes, access-requests,
        // admin, changelog, uploads, public, ai) are added in P2/P3/P6.
    ],
    controllers: [HealthController],
})
export class AppModule {}
