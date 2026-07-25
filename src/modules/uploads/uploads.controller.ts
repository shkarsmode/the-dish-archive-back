import {
    BadRequestException,
    Controller,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';

// Authenticated image upload -> { url }. Public read is handled by Cloudinary.
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
    constructor(private readonly cloudinary: CloudinaryService) {}

    @Post('recipe-images')
    @UseInterceptors(FileInterceptor('file'))
    async recipeImage(@UploadedFile() file: Express.Multer.File) {
        return this.upload(file, 'dish-archive/recipes');
    }

    @Post('family-covers')
    @UseInterceptors(FileInterceptor('file'))
    async familyCover(@UploadedFile() file: Express.Multer.File) {
        return this.upload(file, 'dish-archive/family-covers');
    }

    @Post('family-avatars')
    @UseInterceptors(FileInterceptor('file'))
    async familyAvatar(@UploadedFile() file: Express.Multer.File) {
        return this.upload(file, 'dish-archive/family-avatars');
    }

    private async upload(file: Express.Multer.File | undefined, folder: string) {
        if (!file) throw new BadRequestException('Файл не надано');
        const { url } = await this.cloudinary.uploadImage(file, folder);
        return { url };
    }
}
