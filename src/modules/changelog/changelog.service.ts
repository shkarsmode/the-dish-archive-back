import { Injectable } from '@nestjs/common';
import { ChangelogEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthzService, AuthzUser } from '../../shared/authz.service';

// A single flattened changelog row as the SPA consumes it.
type ChangelogEntryItem = {
    id: number;
    version: string;
    title: string;
    description: string | null;
    action: string;
    dishId: string | null;
    dishTitle: string | null;
    changes: string[];
    date: string;
};

// Rows grouped by calendar day (YYYY-MM-DD), newest day first.
type ChangelogGroup = {
    date: string;
    entries: ChangelogEntryItem[];
};

@Injectable()
export class ChangelogService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
    ) {}

    // Visible rows (mirrors the changelog_select RLS policy): global rows
    // (familyId IS NULL), every row for a super-admin, rows of families the
    // caller is an approved member of, and rows of publicly-visible families.
    async list(user: AuthzUser): Promise<ChangelogGroup[]> {
        let where: Prisma.ChangelogEntryWhereInput;
        if (this.authz.isSuperAdmin(user)) {
            where = {};
        } else {
            const familyIds = user
                ? (
                      await this.prisma.familyMember.findMany({
                          where: { userId: user.id, status: 'approved' },
                          select: { familyId: true },
                      })
                  ).map((m) => m.familyId)
                : [];

            const or: Prisma.ChangelogEntryWhereInput[] = [
                { familyId: null },
                { family: { isPublicVisible: true } },
            ];
            if (familyIds.length) or.push({ familyId: { in: familyIds } });
            where = { OR: or };
        }

        const rows = await this.prisma.changelogEntry.findMany({
            where,
            orderBy: { date: 'desc' },
        });

        return this.groupByDay(rows);
    }

    // Group the (date-desc) rows by calendar day, preserving that descending
    // order both across groups and within each group.
    private groupByDay(rows: ChangelogEntry[]): ChangelogGroup[] {
        const groups = new Map<string, ChangelogGroup>();
        for (const row of rows) {
            const day = row.date.toISOString().slice(0, 10);
            let group = groups.get(day);
            if (!group) {
                group = { date: day, entries: [] };
                groups.set(day, group);
            }
            group.entries.push(this.toEntryItem(row));
        }
        return [...groups.values()];
    }

    private toEntryItem(row: ChangelogEntry): ChangelogEntryItem {
        return {
            id: row.id,
            version: row.version,
            title: row.title,
            description: row.description ?? null,
            action: row.action,
            dishId: row.dishId ?? null,
            dishTitle: row.dishTitle ?? null,
            changes: row.changes ?? [],
            date: row.date.toISOString(),
        };
    }
}
