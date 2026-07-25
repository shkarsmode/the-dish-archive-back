import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { AccessRequestsModule } from './modules/access-requests/access-requests.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChangelogModule } from './modules/changelog/changelog.module';
import { DishesModule } from './modules/dishes/dishes.module';
import { FamiliesModule } from './modules/families/families.module';
import { LikesModule } from './modules/likes/likes.module';
import { MembersModule } from './modules/members/members.module';
import { PublicModule } from './modules/public/public.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        SharedModule,
        AuthModule,
        DishesModule,
        FamiliesModule,
        MembersModule,
        RatingsModule,
        LikesModule,
        AccessRequestsModule,
        AdminModule,
        ChangelogModule,
        UploadsModule,
        PublicModule,
    ],
    controllers: [HealthController],
})
export class AppModule {}
