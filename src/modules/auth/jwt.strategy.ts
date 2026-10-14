import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { isSuperAdmin } from '../../shared/admin';
import { RequestUser } from '../../shared/current-user.decorator';
import { SESSION_COOKIE } from './session.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                // The SPA's Bearer token first: it is the one renewed most recently, while
                // the cookie can hold an older token. Safari never sends the cookie at all
                // (cross-site between *.vercel.app subdomains), so the Bearer is the main path.
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                (request) => request?.cookies?.[SESSION_COOKIE] || null,
            ]),
            secretOrKey: process.env.JWT_SECRET || 'development-only-secret',
        });
    }

    async validate(payload: { sub: string; email: string; displayName: string | null; exp?: number }): Promise<RequestUser> {
        // Re-read role + approval each request so admin changes take effect without re-login.
        // One query (user + filtered membership count) instead of two per request.
        const dbUser = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                globalRole: true,
                email: true,
                displayName: true,
                _count: { select: { memberships: { where: { status: 'approved' } } } },
            },
        });
        const globalRole = dbUser?.globalRole ?? 'user';
        const email = dbUser?.email ?? payload.email;
        const approvedMemberships = dbUser?._count.memberships ?? 0;
        const approved = isSuperAdmin({ email, globalRole }) || approvedMemberships > 0;
        return {
            id: payload.sub,
            email,
            displayName: dbUser?.displayName ?? payload.displayName,
            globalRole,
            approved,
            tokenExpiresAt: payload.exp,
        };
    }
}
