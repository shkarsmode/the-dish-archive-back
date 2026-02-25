import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/admin.guard';
import { CloudinaryService } from './cloudinary.service';
import { DishesService } from './dishes.service';

@Controller('dishes')
export class DishesController {
    constructor(
        private readonly dishesService: DishesService,
        private readonly cloudinaryService: CloudinaryService,
    ) {}

    @Get()
    getAll() {
        return this.dishesService.getAllDishes();
    }

    @Get(':id')
    getOne(@Param('id') id: string) {
        return this.dishesService.getDishById(id);
    }

    @Put(':id')
    @UseGuards(AdminGuard)
    update(@Param('id') id: string, @Body() body: any) {
        return this.dishesService.updateDish(id, body);
    }

    @Post()
    @UseGuards(AdminGuard)
    create(@Body() body: any) {
        return this.dishesService.createDish(body);
    }

    @Delete(':id')
    @UseGuards(AdminGuard)
    remove(@Param('id') id: string) {
        this.dishesService.deleteDish(id);
        return { success: true };
    }

    @Post('upload')
    @UseGuards(AdminGuard)
    @UseInterceptors(
        FileInterceptor('image', {
            storage: memoryStorage(),
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
            fileFilter: (_req, file, cb) => {
                if (!file.mimetype.match(/^image\/(jpeg|png|webp|avif)$/)) {
                    return cb(new Error('Підтримуються лише зображення (JPEG, PNG, WebP, AVIF)'), false);
                }
                cb(null, true);
            },
        }),
    )
    async uploadImage(@UploadedFile() file: Express.Multer.File) {
        const result = await this.cloudinaryService.uploadImage(file);
        return {
            url: result.url,
            publicId: result.publicId,
        };
    }
}
