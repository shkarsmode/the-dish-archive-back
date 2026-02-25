import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface DishData {
    version: string;
    lastUpdated: string;
    dishes: any[];
}

@Injectable()
export class DishesService implements OnModuleInit {
    private readonly logger = new Logger(DishesService.name);
    private data: DishData = { version: '1.0.0', lastUpdated: new Date().toISOString(), dishes: [] };

    private get dataFilePath(): string {
        // In Vercel: /tmp for writes, bundled data/ for reads
        const isVercel = !!process.env['VERCEL'];
        if (isVercel) {
            return '/tmp/dishes.json';
        }
        return path.join(process.cwd(), 'data', 'dishes.json');
    }

    private get seedFilePath(): string {
        return path.join(process.cwd(), 'data', 'dishes.json');
    }

    onModuleInit() {
        this.loadData();
    }

    private loadData(): void {
        try {
            // Try to load from data file path first
            if (fs.existsSync(this.dataFilePath)) {
                const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
                this.data = JSON.parse(raw);
                this.logger.log(`Loaded ${this.data.dishes.length} dishes from ${this.dataFilePath}`);
                return;
            }

            // Fallback: load from seed file (bundled data)
            if (fs.existsSync(this.seedFilePath)) {
                const raw = fs.readFileSync(this.seedFilePath, 'utf-8');
                this.data = JSON.parse(raw);
                this.logger.log(`Seeded ${this.data.dishes.length} dishes from ${this.seedFilePath}`);
                // Write to data path for future reads (Vercel: /tmp)
                this.saveData();
                return;
            }

            this.logger.warn('No dishes.json found, starting with empty data');
        } catch (error) {
            this.logger.error('Failed to load dishes data', error);
        }
    }

    private saveData(): void {
        try {
            this.data.lastUpdated = new Date().toISOString();
            const dir = path.dirname(this.dataFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataFilePath, JSON.stringify(this.data, null, 4), 'utf-8');
            this.logger.log('Data saved successfully');
        } catch (error) {
            this.logger.error('Failed to save dishes data', error);
        }
    }

    getAllDishes(): DishData {
        return this.data;
    }

    getDishById(id: string): any {
        const dish = this.data.dishes.find(d => d.id === id);
        if (!dish) throw new NotFoundException(`Страву з id "${id}" не знайдено`);
        return dish;
    }

    updateDish(id: string, updates: Partial<any>): any {
        const index = this.data.dishes.findIndex(d => d.id === id);
        if (index === -1) throw new NotFoundException(`Страву з id "${id}" не знайдено`);

        this.data.dishes[index] = {
            ...this.data.dishes[index],
            ...updates,
            id, // prevent changing id
            updatedAt: new Date().toISOString(),
        };

        this.saveData();
        return this.data.dishes[index];
    }

    createDish(dish: any): any {
        const id = `dish-${String(this.data.dishes.length + 1).padStart(3, '0')}`;
        const now = new Date().toISOString();
        const newDish = {
            id,
            ...dish,
            createdAt: now,
            updatedAt: now,
        };
        this.data.dishes.push(newDish);
        this.saveData();
        return newDish;
    }

    deleteDish(id: string): void {
        const index = this.data.dishes.findIndex(d => d.id === id);
        if (index === -1) throw new NotFoundException(`Страву з id "${id}" не знайдено`);
        this.data.dishes.splice(index, 1);
        this.saveData();
    }
}
