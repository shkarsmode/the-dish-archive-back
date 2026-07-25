import { Module } from '@nestjs/common';
import { AccessRequestsController, AdminAccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';

@Module({
    controllers: [AccessRequestsController, AdminAccessRequestsController],
    providers: [AccessRequestsService],
    exports: [AccessRequestsService],
})
export class AccessRequestsModule {}
