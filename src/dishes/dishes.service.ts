import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangelogEntry } from '../database/entities/changelog.entity';
import { CookingStep } from '../database/entities/cooking-step.entity';
import { DishImage } from '../database/entities/dish-image.entity';
import { Dish } from '../database/entities/dish.entity';
import { Ingredient } from '../database/entities/ingredient.entity';

export interface DishApiResponse {
    version: string;
    lastUpdated: string;
    dishes: any[];
}

@Injectable()
export class DishesService {
    private readonly logger = new Logger(DishesService.name);

    constructor(
        @InjectRepository(Dish)
        private readonly dishRepo: Repository<Dish>,
        @InjectRepository(DishImage)
        private readonly imageRepo: Repository<DishImage>,
        @InjectRepository(Ingredient)
        private readonly ingredientRepo: Repository<Ingredient>,
        @InjectRepository(CookingStep)
        private readonly stepRepo: Repository<CookingStep>,
        @InjectRepository(ChangelogEntry)
        private readonly changelogRepo: Repository<ChangelogEntry>,
    ) {}

    /** Map DB entity → API JSON format (matching frontend Dish interface) */
    private toApiDish(dish: Dish): any {
        return {
            id: dish.id,
            title: dish.title,
            slug: dish.slug,
            description: dish.description,
            images: (dish.images || []).map(img => ({
                url: img.url,
                alt: img.alt,
                isPrimary: img.isPrimary,
            })),
            rating: dish.rating,
            price: {
                amount: dish.priceAmount,
                currency: dish.priceCurrency,
            },
            cookingTime: {
                preparation: dish.preparationTime,
                cooking: dish.cookingTimeMins,
                total: dish.totalTime,
            },
            calories: dish.calories,
            servings: dish.servings,
            difficulty: dish.difficulty,
            tags: dish.tags,
            categories: dish.categories,
            tasteProfile: {
                sweet: dish.tasteSweet,
                salty: dish.tasteSalty,
                sour: dish.tasteSour,
                bitter: dish.tasteBitter,
                spicy: dish.tasteSpicy,
                umami: dish.tasteUmami,
            },
            ingredients: (dish.ingredients || [])
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(ing => ({
                    name: ing.name,
                    amount: ing.amount,
                    unit: ing.unit,
                    optional: ing.optional,
                })),
            steps: (dish.steps || [])
                .sort((a, b) => a.stepOrder - b.stepOrder)
                .map(step => ({
                    order: step.stepOrder,
                    description: step.description,
                    ...(step.duration ? { duration: step.duration } : {}),
                    ...(step.imageUrl ? { imageUrl: step.imageUrl } : {}),
                })),
            notes: dish.notes || '',
            sourceUrl: dish.sourceUrl || '',
            createdAt: dish.createdAt.toISOString(),
            updatedAt: dish.updatedAt.toISOString(),
        };
    }

    /** Map incoming API JSON → DB entity shape */
    private fromApiDish(data: any): Partial<Dish> {
        const result: Partial<Dish> = {};

        if (data.title !== undefined) result.title = data.title;
        if (data.slug !== undefined) result.slug = data.slug;
        if (data.description !== undefined) result.description = data.description;
        if (data.rating !== undefined) result.rating = data.rating;
        if (data.difficulty !== undefined) result.difficulty = data.difficulty;
        if (data.calories !== undefined) result.calories = data.calories;
        if (data.servings !== undefined) result.servings = data.servings;
        if (data.notes !== undefined) result.notes = data.notes;
        if (data.sourceUrl !== undefined) result.sourceUrl = data.sourceUrl;
        if (data.tags !== undefined) result.tags = data.tags;
        if (data.categories !== undefined) result.categories = data.categories;

        if (data.price) {
            result.priceAmount = data.price.amount;
            result.priceCurrency = data.price.currency;
        }

        if (data.cookingTime) {
            result.preparationTime = data.cookingTime.preparation;
            result.cookingTimeMins = data.cookingTime.cooking;
            result.totalTime = data.cookingTime.total;
        }

        if (data.tasteProfile) {
            result.tasteSweet = data.tasteProfile.sweet;
            result.tasteSalty = data.tasteProfile.salty;
            result.tasteSour = data.tasteProfile.sour;
            result.tasteBitter = data.tasteProfile.bitter;
            result.tasteSpicy = data.tasteProfile.spicy;
            result.tasteUmami = data.tasteProfile.umami;
        }

        return result;
    }

    async getAllDishes(): Promise<DishApiResponse> {
        const dishes = await this.dishRepo.find({
            order: { createdAt: 'DESC' },
            relations: ['images', 'ingredients', 'steps'],
        });

        const lastDish = dishes[0];

        return {
            version: '1.0.0',
            lastUpdated: lastDish ? lastDish.updatedAt.toISOString() : new Date().toISOString(),
            dishes: dishes.map(d => this.toApiDish(d)),
        };
    }

    async getDishById(id: string): Promise<any> {
        const dish = await this.dishRepo.findOne({
            where: { id },
            relations: ['images', 'ingredients', 'steps'],
        });
        if (!dish) throw new NotFoundException(`Страву з id "${id}" не знайдено`);
        return this.toApiDish(dish);
    }

    async updateDish(id: string, updates: any): Promise<any> {
        const dish = await this.dishRepo.findOne({
            where: { id },
            relations: ['images', 'ingredients', 'steps'],
        });
        if (!dish) throw new NotFoundException(`Страву з id "${id}" не знайдено`);

        // Track changes for changelog
        const changes: string[] = [];
        const mapped = this.fromApiDish(updates);

        if (mapped.title && mapped.title !== dish.title) {
            changes.push(`Назва: "${dish.title}" → "${mapped.title}"`);
        }
        if (mapped.rating !== undefined && mapped.rating !== dish.rating) {
            changes.push(`Рейтинг: ${dish.rating} → ${mapped.rating}`);
        }
        if (mapped.priceAmount !== undefined && mapped.priceAmount !== dish.priceAmount) {
            changes.push(`Ціна: ${dish.priceAmount} → ${mapped.priceAmount} грн`);
        }

        // Update main dish fields
        Object.assign(dish, mapped);
        await this.dishRepo.save(dish);

        // Update images if provided
        if (updates.images) {
            await this.imageRepo.delete({ dish: { id } });
            const images = updates.images.map((img: any) => {
                const entity = new DishImage();
                entity.url = img.url;
                entity.alt = img.alt || '';
                entity.isPrimary = img.isPrimary || false;
                entity.dish = dish;
                return entity;
            });
            await this.imageRepo.save(images);
        }

        // Update ingredients if provided
        if (updates.ingredients) {
            await this.ingredientRepo.delete({ dish: { id } });
            const ingredients = updates.ingredients.map((ing: any, idx: number) => {
                const entity = new Ingredient();
                entity.name = ing.name;
                entity.amount = ing.amount;
                entity.unit = ing.unit || '';
                entity.optional = ing.optional || false;
                entity.sortOrder = idx;
                entity.dish = dish;
                return entity;
            });
            await this.ingredientRepo.save(ingredients);
        }

        // Update steps if provided
        if (updates.steps) {
            await this.stepRepo.delete({ dish: { id } });
            const steps = updates.steps.map((step: any) => {
                const entity = new CookingStep();
                entity.stepOrder = step.order;
                entity.description = step.description;
                entity.duration = step.duration || null;
                entity.imageUrl = step.imageUrl || null;
                entity.dish = dish;
                return entity;
            });
            await this.stepRepo.save(steps);
        }

        // Log to changelog
        if (changes.length > 0) {
            const log = new ChangelogEntry();
            log.version = '1.0.0';
            log.title = `Оновлено "${dish.title}"`;
            log.description = `Змінено дані страви "${dish.title}"`;
            log.action = 'updated';
            log.dishId = dish.id;
            log.dishTitle = dish.title;
            log.changes = changes;
            await this.changelogRepo.save(log);
        }

        return this.getDishById(id);
    }

    async createDish(data: any): Promise<any> {
        // Generate next id
        const count = await this.dishRepo.count();
        const id = data.id || `dish-${String(count + 1).padStart(3, '0')}`;

        const mapped = this.fromApiDish(data);
        const dish = this.dishRepo.create({
            ...mapped,
            id,
        });

        if (data.createdAt) {
            dish.createdAt = new Date(data.createdAt);
        }
        if (data.updatedAt) {
            dish.updatedAt = new Date(data.updatedAt);
        }

        await this.dishRepo.save(dish);

        // Save images
        if (data.images?.length > 0) {
            const images = data.images.map((img: any) => {
                const entity = new DishImage();
                entity.url = img.url;
                entity.alt = img.alt || '';
                entity.isPrimary = img.isPrimary || false;
                entity.dish = dish;
                return entity;
            });
            await this.imageRepo.save(images);
        }

        // Save ingredients
        if (data.ingredients?.length > 0) {
            const ingredients = data.ingredients.map((ing: any, idx: number) => {
                const entity = new Ingredient();
                entity.name = ing.name;
                entity.amount = ing.amount;
                entity.unit = ing.unit || '';
                entity.optional = ing.optional || false;
                entity.sortOrder = idx;
                entity.dish = dish;
                return entity;
            });
            await this.ingredientRepo.save(ingredients);
        }

        // Save steps
        if (data.steps?.length > 0) {
            const steps = data.steps.map((step: any) => {
                const entity = new CookingStep();
                entity.stepOrder = step.order;
                entity.description = step.description;
                entity.duration = step.duration || null;
                entity.imageUrl = step.imageUrl || null;
                entity.dish = dish;
                return entity;
            });
            await this.stepRepo.save(steps);
        }

        // Log to changelog
        const log = new ChangelogEntry();
        log.version = '1.0.0';
        log.title = `Додано "${dish.title}"`;
        log.description = `Нова страва "${dish.title}" додана до архіву`;
        log.action = 'added';
        log.dishId = dish.id;
        log.dishTitle = dish.title;
        log.changes = [`Додано нову страву: ${dish.title}`];
        await this.changelogRepo.save(log);

        return this.getDishById(id);
    }

    async deleteDish(id: string): Promise<void> {
        const dish = await this.dishRepo.findOne({ where: { id } });
        if (!dish) throw new NotFoundException(`Страву з id "${id}" не знайдено`);

        const title = dish.title;
        await this.dishRepo.remove(dish);

        // Log to changelog
        const log = new ChangelogEntry();
        log.version = '1.0.0';
        log.title = `Видалено "${title}"`;
        log.description = `Страву "${title}" видалено з архіву`;
        log.action = 'removed';
        log.dishId = id;
        log.dishTitle = title;
        log.changes = [`Видалено страву: ${title}`];
        await this.changelogRepo.save(log);
    }
}
