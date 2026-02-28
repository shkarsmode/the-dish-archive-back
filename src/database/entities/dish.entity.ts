import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CookingStep } from './cooking-step.entity';
import { DishImage } from './dish-image.entity';
import { Ingredient } from './ingredient.entity';

@Entity('dishes')
export class Dish {
    @PrimaryColumn()
    id: string;

    @Column()
    title: string;

    @Column({ unique: true })
    slug: string;

    @Column('text')
    description: string;

    @Column({ type: 'smallint', default: 0 })
    rating: number;

    @Column({ type: 'int', default: 0 })
    priceAmount: number;

    @Column({ default: 'UAH' })
    priceCurrency: string;

    @Column({ type: 'int', default: 0 })
    preparationTime: number;

    @Column({ type: 'int', default: 0 })
    cookingTimeMins: number;

    @Column({ type: 'int', default: 0 })
    totalTime: number;

    @Column({ type: 'int', default: 0 })
    calories: number;

    @Column({ type: 'int', default: 0 })
    servings: number;

    @Column({ default: 'easy' })
    difficulty: string;

    @Column('text', { array: true, default: '{}' })
    tags: string[];

    @Column('text', { array: true, default: '{}' })
    categories: string[];

    // Taste profile
    @Column({ type: 'smallint', default: 0 })
    tasteSweet: number;

    @Column({ type: 'smallint', default: 0 })
    tasteSalty: number;

    @Column({ type: 'smallint', default: 0 })
    tasteSour: number;

    @Column({ type: 'smallint', default: 0 })
    tasteBitter: number;

    @Column({ type: 'smallint', default: 0 })
    tasteSpicy: number;

    @Column({ type: 'smallint', default: 0 })
    tasteUmami: number;

    @Column('text', { nullable: true })
    notes: string;

    @Column({ nullable: true })
    sourceUrl: string;

    @OneToMany(() => DishImage, (image: DishImage) => image.dish, { cascade: true, eager: true })
    images: DishImage[];

    @OneToMany(() => Ingredient, (ingredient: Ingredient) => ingredient.dish, { cascade: true, eager: true })
    ingredients: Ingredient[];

    @OneToMany(() => CookingStep, (step: CookingStep) => step.dish, { cascade: true, eager: true })
    steps: CookingStep[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
