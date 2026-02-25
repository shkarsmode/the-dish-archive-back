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
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { AdminGuard } from '../auth/admin.guard';
import { DishesService } from './dishes.service';

const uploadsDir = process.env['VERCEL']
    ? '/tmp/uploads'
    : join(process.cwd(), 'uploads');

@Controller('dishes')
export class DishesController {
    constructor(private readonly dishesService: DishesService) {}

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
            storage: diskStorage({
                destination: (_req, _file, cb) => {
                    if (!existsSync(uploadsDir)) {
                        mkdirSync(uploadsDir, { recursive: true });
                    }
                    cb(null, uploadsDir);
                },
                filename: (_req, file, cb) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                    const ext = extname(file.originalname);
                    cb(null, `dish-${uniqueSuffix}${ext}`);
                },
            }),
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
            fileFilter: (_req, file, cb) => {
                if (!file.mimetype.match(/^image\/(jpeg|png|webp|avif)$/)) {
                    return cb(new Error('Підтримуються лише зображення (JPEG, PNG, WebP, AVIF)'), false);
                }
                cb(null, true);
            },
        }),
    )
    uploadImage(@UploadedFile() file: Express.Multer.File) {
        return {
            url: `/api/uploads/${file.filename}`,
            filename: file.filename,
        };
    }
}
