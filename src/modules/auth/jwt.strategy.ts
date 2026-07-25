import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { isSuperAdmin } from '../../shared/admin';
import { RequestUser } from '../../shared/current-user.decorator';

const SESSION_COOKIE = 'dish_session';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request) => request?.cookies?.[SESSION_COOKIE] || null,
                // Bearer fallback: Safari blocks cross-site cookies between *.vercel.app
                // subdomains (ITP), so the SPA also sends the token as a Bearer header.
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            secretOrKey: process.env.JWT_SECRET || 'development-only-secret',
        });
    }

    async validate(payload: { sub: string; email: string; displayName: string | null }): Promise<RequestUser> {
        // Re-read role + approval each request so admin changes take effect without re-login.
        const dbUser = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { globalRole: true, email: true, displayName: true },
        });
        const globalRole = dbUser?.globalRole ?? 'user';
        const email = dbUser?.email ?? payload.email;
        const approvedMemberships = await this.prisma.familyMember.count({
            where: { userId: payload.sub, status: 'approved' },
        });
        const approved = isSuperAdmin({ email, globalRole }) || approvedMemberships > 0;
        return {
            id: payload.sub,
            email,
            displayName: dbUser?.displayName ?? payload.displayName,
            globalRole,
            approved,
        };
    }
}
