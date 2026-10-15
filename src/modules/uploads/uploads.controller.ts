import {
    BadRequestException,
    Controller,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';
import { IMAGE_UPLOAD, UploadQuotaService, UploadRateLimitGuard } from './upload-limits';

// Image upload -> { url }, for approved accounts only (a fresh Google sign-in is not
// enough). Public read is handled by Cloudinary.
@Controller('uploads')
@UseGuards(JwtAuthGuard, ApprovedGuard, UploadRateLimitGuard)
export class UploadsController {
    constructor(
        private readonly cloudinary: CloudinaryService,
        private readonly quota: UploadQuotaService,
    ) {}

    @Post('recipe-images')
    @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD))
    async recipeImage(@CurrentUser() user: RequestUser, @UploadedFile() file: Express.Multer.File) {
        return this.upload(user, file, 'dish-archive/recipes');
    }

    @Post('family-covers')
    @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD))
    async familyCover(@CurrentUser() user: RequestUser, @UploadedFile() file: Express.Multer.File) {
        return this.upload(user, file, 'dish-archive/family-covers');
    }

    @Post('family-avatars')
    @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD))
    async familyAvatar(@CurrentUser() user: RequestUser, @UploadedFile() file: Express.Multer.File) {
        return this.upload(user, file, 'dish-archive/family-avatars');
    }

    private async upload(user: RequestUser, file: Express.Multer.File | undefined, folder: string) {
        if (!file) throw new BadRequestException('Файл не надано');
        await this.quota.assertCanUpload(user);
        const { url } = await this.cloudinary.uploadImage(file, folder);
        await this.quota.record(user, folder, file.size);
        return { url };
    }
}
