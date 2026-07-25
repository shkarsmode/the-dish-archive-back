import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FamilyMember, Family, User } from '@prisma/client';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { initialGlobalRole } from '../../shared/admin';

const SESSION_COOKIE = 'dish_session';

type GoogleUser = {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    accessToken?: string;
    refreshToken?: string;
};

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    // First-login provisioning (was the handle_new_user trigger): create/refresh
    // the User, bootstrap super-admin by email, link the OAuth account, stamp login.
    async upsertGoogleUser(profile: GoogleUser): Promise<User> {
        const email = profile.email.toLowerCase();

        const existing = await this.prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.googleId } },
            include: { user: true },
        });
        if (existing) {
            return this.prisma.user.update({
                where: { id: existing.userId },
                data: {
                    displayName: profile.displayName,
                    avatarUrl: profile.avatarUrl || undefined,
                    lastLoginAt: new Date(),
                },
            });
        }

        const user = await this.prisma.user.upsert({
            where: { email },
            update: {
                googleId: profile.googleId,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl || undefined,
                lastLoginAt: new Date(),
            },
            create: {
                email,
                googleId: profile.googleId,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl || undefined,
                globalRole: initialGlobalRole(email),
                lastLoginAt: new Date(),
            },
        });

        await this.prisma.oAuthAccount.upsert({
            where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.googleId } },
            update: { accessToken: profile.accessToken, refreshToken: profile.refreshToken },
            create: {
                userId: user.id,
                provider: 'google',
                providerAccountId: profile.googleId,
                accessToken: profile.accessToken,
                refreshToken: profile.refreshToken,
            },
        });

        return user;
    }

    createSessionToken(user: Pick<User, 'id' | 'email' | 'displayName'>): string {
        return this.jwtService.sign({ sub: user.id, email: user.email, displayName: user.displayName });
    }

    attachSessionCookie(response: Response, user: Pick<User, 'id' | 'email' | 'displayName'>): void {
        const token = this.createSessionToken(user);
        const isProduction = process.env.NODE_ENV === 'production';
        response.cookie(SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: isProduction ? 'none' : 'lax',
            secure: isProduction,
            maxAge: 14 * 24 * 60 * 60 * 1000,
        });
    }

    clearSessionCookie(response: Response): void {
        response.clearCookie(SESSION_COOKIE);
    }

    async touchLastLogin(userId: string): Promise<void> {
        await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    }

    // The shape the SPA's AuthService consumes: { user, profile, memberships }.
    async getSessionData(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) return { user: null, profile: null, memberships: [] };
        const memberships = await this.prisma.familyMember.findMany({
            where: { userId },
            include: { family: true },
            orderBy: { createdAt: 'asc' },
        });
        return {
            user: { id: user.id, email: user.email },
            profile: this.toProfile(user),
            memberships: memberships.map((m) => this.toMembership(m)),
        };
    }

    private toProfile(user: User) {
        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl ?? null,
            globalRole: user.globalRole,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        };
    }

    private toMembership(m: FamilyMember & { family: Family | null }) {
        return {
            id: m.id,
            familyId: m.familyId,
            userId: m.userId,
            role: m.role,
            status: m.status,
            approvedByUserId: m.approvedByUserId ?? null,
            approvedAt: m.approvedAt ? m.approvedAt.toISOString() : null,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
            family: m.family ? this.toFamily(m.family) : null,
        };
    }

    private toFamily(f: Family) {
        return {
            id: f.id,
            slug: f.slug,
            name: f.name,
            description: f.description ?? null,
            coverImageUrl: f.coverImageUrl ?? null,
            avatarImageUrl: f.avatarImageUrl ?? null,
            themeColor: f.themeColor ?? null,
            isPublicVisible: f.isPublicVisible,
            status: f.status,
            createdByUserId: f.createdByUserId ?? null,
            createdAt: f.createdAt.toISOString(),
            updatedAt: f.updatedAt.toISOString(),
        };
    }
}
