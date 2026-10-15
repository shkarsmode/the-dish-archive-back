import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { UploadQuotaService, UploadRateLimitGuard } from './upload-limits';
import { UploadsController } from './uploads.controller';

@Module({
    controllers: [UploadsController],
    providers: [CloudinaryService, UploadQuotaService, UploadRateLimitGuard],
    exports: [CloudinaryService],
})
export class UploadsModule {}
