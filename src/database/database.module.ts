import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangelogEntry, CookingStep, Dish, DishImage, Ingredient } from './entities';

const DATABASE_URL = process.env['DATABASE_URL'];

@Module({
    imports: [
        TypeOrmModule.forRoot({
            type: 'postgres',
            url: DATABASE_URL,
            ssl: DATABASE_URL?.includes('neon.tech') || DATABASE_URL?.includes('supabase')
                ? { rejectUnauthorized: false }
                : false,
            entities: [Dish, DishImage, Ingredient, CookingStep, ChangelogEntry],
            synchronize: true, // auto-create tables (disable in production later)
            logging: process.env['NODE_ENV'] !== 'production',
        }),
    ],
})
export class DatabaseModule {}
