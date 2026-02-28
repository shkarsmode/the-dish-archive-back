import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangelogEntry } from '../database/entities/changelog.entity';

@Injectable()
export class ChangelogService {
    constructor(
        @InjectRepository(ChangelogEntry)
        private readonly changelogRepo: Repository<ChangelogEntry>,
    ) {}

    async getAll(): Promise<ChangelogEntry[]> {
        return this.changelogRepo.find({
            order: { date: 'DESC' },
        });
    }

    async getGroupedByDate(): Promise<any[]> {
        const entries = await this.changelogRepo.find({
            order: { date: 'DESC' },
        });

        // Group by date (YYYY-MM-DD)
        const grouped = new Map<string, any>();

        for (const entry of entries) {
            const dateKey = entry.date.toISOString().split('T')[0];

            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, {
                    date: dateKey,
                    entries: [],
                });
            }
            grouped.get(dateKey).entries.push({
                id: entry.id,
                version: entry.version,
                title: entry.title,
                description: entry.description,
                action: entry.action,
                dishId: entry.dishId,
                dishTitle: entry.dishTitle,
                changes: entry.changes,
                date: entry.date.toISOString(),
            });
        }

        return [...grouped.values()];
    }

    async create(data: Partial<ChangelogEntry>): Promise<ChangelogEntry> {
        const entry = this.changelogRepo.create(data);
        return this.changelogRepo.save(entry);
    }
}
