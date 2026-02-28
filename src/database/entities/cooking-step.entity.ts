import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Dish } from './dish.entity';

@Entity('cooking_steps')
export class CookingStep {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int' })
    stepOrder: number;

    @Column('text')
    description: string;

    @Column({ type: 'int', nullable: true })
    duration: number;

    @Column({ nullable: true })
    imageUrl: string;

    @ManyToOne(() => Dish, (dish) => dish.steps, { onDelete: 'CASCADE' })
    dish: Dish;
}
