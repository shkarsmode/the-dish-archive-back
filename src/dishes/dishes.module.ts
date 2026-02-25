import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { DishesController } from './dishes.controller';
import { DishesService } from './dishes.service';

@Module({
    controllers: [DishesController],
    providers: [DishesService, CloudinaryService],
    exports: [DishesService],
})
export class DishesModule {}
