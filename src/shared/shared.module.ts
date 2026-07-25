import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { AuthzService } from './authz.service';

// Cross-cutting services every domain module needs. Global so they don't have to
// be re-imported everywhere. (PrismaModule is already @Global.)
@Global()
@Module({
    providers: [AuthzService, ActivityService],
    exports: [AuthzService, ActivityService],
})
export class SharedModule {}
