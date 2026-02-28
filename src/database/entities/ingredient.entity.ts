import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Dish } from './dish.entity';

@Entity('ingredients')
export class Ingredient {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    amount: string;

    @Column({ default: '' })
    unit: string;

    @Column({ default: false })
    optional: boolean;

    @Column({ type: 'int', default: 0 })
    sortOrder: number;

    @ManyToOne(() => Dish, (dish) => dish.ingredients, { onDelete: 'CASCADE' })
    dish: Dish;
}
