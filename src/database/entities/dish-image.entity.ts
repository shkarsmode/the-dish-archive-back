import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Dish } from './dish.entity';

@Entity('dish_images')
export class DishImage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    url: string;

    @Column({ nullable: true })
    alt: string;

    @Column({ default: false })
    isPrimary: boolean;

    @ManyToOne(() => Dish, (dish) => dish.images, { onDelete: 'CASCADE' })
    dish: Dish;
}
