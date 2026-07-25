import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../shared/activity.service';
import { AuthzService, AuthzUser } from '../../shared/authz.service';
import {
    DISH_INCLUDE,
    toApiDish,
    toDishScalars,
    toImageRows,
    toIngredientRows,
    toStepRows,
} from './dish.serializer';

const EDITOR_ROLES = ['owner', 'admin', 'editor'];

@Injectable()
export class DishesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly authz: AuthzService,
        private readonly activity: ActivityService,
    ) {}

    // The set of dishes a user may see, expressed as a Prisma where (mirrors the
    // dishes_select RLS policy). Super-admin: everything. Anon: published+public only.
    private async viewableWhere(user: AuthzUser): Promise<Prisma.DishWhereInput> {
        if (this.authz.isSuperAdmin(user)) return {};
        const publicClause: Prisma.DishWhereInput = { visibility: 'public', status: 'published' };
        if (!user) return publicClause;

        const memberships = await this.prisma.familyMember.findMany({
            where: { userId: user.id, status: 'approved' },
            select: { familyId: true, role: true },
        });
        const editorFamilies = memberships.filter((m) => EDITOR_ROLES.includes(m.role)).map((m) => m.familyId);
        const memberFamilies = memberships.map((m) => m.familyId);

        const or: Prisma.DishWhereInput[] = [publicClause];
        if (editorFamilies.length) or.push({ familyId: { in: editorFamilies } });
        if (memberFamilies.length) or.push({ status: 'published', familyId: { in: memberFamilies } });
        return { OR: or };
    }

    async list(user: AuthzUser) {
        const dishes = await this.prisma.dish.findMany({
            where: await this.viewableWhere(user),
            include: DISH_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
        return dishes.map(toApiDish);
    }

    async getById(user: AuthzUser, id: string) {
        if (!(await this.authz.canViewDish(user, id))) {
            throw new NotFoundException('Страву не знайдено');
        }
        const dish = await this.prisma.dish.findUnique({ where: { id }, include: DISH_INCLUDE });
        if (!dish) throw new NotFoundException('Страву не знайдено');
        return toApiDish(dish);
    }

    async getBySlug(user: AuthzUser, slug: string) {
        const candidates = await this.prisma.dish.findMany({ where: { slug }, include: DISH_INCLUDE });
        for (const dish of candidates) {
            if (await this.authz.canViewDish(user, dish.id)) return toApiDish(dish);
        }
        throw new NotFoundException('Страву не знайдено');
    }

    async create(user: AuthzUser, body: any) {
        const familyId = body?.familyId;
        if (!familyId) throw new BadRequestException('familyId обовʼязковий');
        if (!(await this.authz.canEditFamily(user, familyId))) {
            throw new ForbiddenException('Недостатньо прав для створення рецепта в цій родині');
        }
        // Visibility gate: only owner/admin/super may create a public recipe.
        if (body.visibility === 'public' && !(await this.authz.canAdminFamily(user, familyId))) {
            throw new ForbiddenException('Публічним може робити лише власник або адмін родини');
        }

        const id: string = body.id || randomUUID();
        const scalars = toDishScalars(body);

        await this.prisma.$transaction(async (tx) => {
            await tx.dish.create({
                data: {
                    ...(scalars as Prisma.DishCreateInput),
                    id,
                    title: body.title ?? '',
                    slug: body.slug ?? id,
                    family: { connect: { id: familyId } },
                    createdByUserId: user!.id,
                },
            });
            await this.replaceChildren(tx, id, body);
        });

        await this.activity.log({
            actorUserId: user!.id,
            familyId,
            entityType: 'dish',
            entityId: id,
            action: 'created',
            metadata: { title: body.title },
        });
        return this.getById(user, id);
    }

    async update(user: AuthzUser, id: string, body: any) {
        const existing = await this.prisma.dish.findUnique({
            where: { id },
            select: { familyId: true, visibility: true },
        });
        if (!existing) throw new NotFoundException('Страву не знайдено');
        if (!(await this.authz.canEditFamily(user, existing.familyId))) {
            throw new ForbiddenException('Недостатньо прав для редагування цього рецепта');
        }
        // guard_dish_columns: gate the transition to public (not edits of an already-public dish).
        if (body.visibility === 'public' && existing.visibility !== 'public') {
            if (!(await this.authz.canAdminFamily(user, existing.familyId))) {
                throw new ForbiddenException('Публічним може робити лише власник або адмін родини');
            }
        }

        const scalars = toDishScalars(body);
        await this.prisma.$transaction(async (tx) => {
            // id / familyId / createdByUserId / createdAt are pinned (never in scalars);
            // stamp the editor.
            await tx.dish.update({
                where: { id },
                data: { ...scalars, updatedByUserId: user!.id },
            });
            await this.replaceChildren(tx, id, body);
        });

        await this.activity.log({
            actorUserId: user!.id,
            familyId: existing.familyId,
            entityType: 'dish',
            entityId: id,
            action: 'updated',
        });
        return this.getById(user, id);
    }

    async remove(user: AuthzUser, id: string) {
        const dish = await this.prisma.dish.findUnique({
            where: { id },
            select: { familyId: true, createdByUserId: true, title: true },
        });
        if (!dish) throw new NotFoundException('Страву не знайдено');
        const isCreator = !!user && dish.createdByUserId === user.id;
        if (!isCreator && !(await this.authz.canAdminFamily(user, dish.familyId))) {
            throw new ForbiddenException('Недостатньо прав для видалення цього рецепта');
        }
        await this.prisma.dish.delete({ where: { id } });
        await this.activity.log({
            actorUserId: user?.id ?? null,
            familyId: dish.familyId,
            entityType: 'dish',
            entityId: id,
            action: 'removed',
            metadata: { title: dish.title },
        });
        return { ok: true };
    }

    // Bulk publish every dish in families the caller may admin (super-admin: all).
    async makeAllPublic(user: AuthzUser): Promise<{ count: number }> {
        let where: Prisma.DishWhereInput;
        if (this.authz.isSuperAdmin(user)) {
            where = {};
        } else {
            if (!user) throw new ForbiddenException('Потрібна авторизація');
            const admin = await this.prisma.familyMember.findMany({
                where: { userId: user.id, status: 'approved', role: { in: ['owner', 'admin'] } },
                select: { familyId: true },
            });
            const familyIds = admin.map((m) => m.familyId);
            if (!familyIds.length) return { count: 0 };
            where = { familyId: { in: familyIds } };
        }
        const result = await this.prisma.dish.updateMany({
            where,
            data: { visibility: 'public', status: 'published' },
        });
        return { count: result.count };
    }

    // delete + re-insert children, but only for the child types the payload provides.
    private async replaceChildren(tx: Prisma.TransactionClient, dishId: string, body: any) {
        if (body.images !== undefined) {
            await tx.dishImage.deleteMany({ where: { dishId } });
            const rows = toImageRows(dishId, body.images);
            if (rows.length) await tx.dishImage.createMany({ data: rows });
        }
        if (body.ingredients !== undefined) {
            await tx.ingredient.deleteMany({ where: { dishId } });
            const rows = toIngredientRows(dishId, body.ingredients);
            if (rows.length) await tx.ingredient.createMany({ data: rows });
        }
        if (body.steps !== undefined) {
            await tx.cookingStep.deleteMany({ where: { dishId } });
            const rows = toStepRows(dishId, body.steps);
            if (rows.length) await tx.cookingStep.createMany({ data: rows });
        }
    }
}
