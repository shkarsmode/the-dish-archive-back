import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangelogEntry, CookingStep, Dish, DishImage, Ingredient } from '../database/entities';
import { CloudinaryService } from './cloudinary.service';
import { DishesController } from './dishes.controller';
import { DishesService } from './dishes.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Dish, DishImage, Ingredient, CookingStep, ChangelogEntry]),
    ],
    controllers: [DishesController],
    providers: [DishesService, CloudinaryService],
    exports: [DishesService],
})
export class DishesModule {}
