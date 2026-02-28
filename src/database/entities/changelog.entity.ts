import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

export type ChangelogAction = 'added' | 'updated' | 'removed' | 'fixed' | 'improved';

@Entity('changelog')
export class ChangelogEntry {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    version: string;

    @Column()
    title: string;

    @Column('text', { nullable: true })
    description: string;

    @Column({ default: 'improved' })
    action: ChangelogAction;

    /** Optional link to affected dish id */
    @Column({ nullable: true })
    dishId: string;

    /** Optional link to affected dish title (snapshot at time of change) */
    @Column({ nullable: true })
    dishTitle: string;

    @Column('text', { array: true, default: '{}' })
    changes: string[];

    @CreateDateColumn()
    date: Date;
}
